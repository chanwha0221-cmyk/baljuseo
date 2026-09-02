/**
 * sheets-proxy.js — 브라우저에서 구글 개인키를 걷어내기 위한 클라이언트 shim
 *
 * 왜 있나 (2026-08-27):
 *   GitHub Pages 사이트는 repo 가 private 이어도 공개다. 그런데 각 도구가
 *   서비스계정 개인키를 HTML 안에 박아두고 브라우저에서 Sheets API 를 직접
 *   불러서, 개인키가 인터넷에 그대로 노출돼 있었다.
 *
 * 어떻게 고치나:
 *   window.fetch 를 감싸서 sheets.googleapis.com 으로 나가는 요청만
 *   Apps Script 프록시로 돌린다. 그래서 각 도구의 호출부(71곳)는 한 줄도
 *   안 고쳐도 된다. 도구에서 지울 것은 PRIVATE_KEY / CLIENT_EMAIL 상수와
 *   getAccessToken() 의 본문뿐이다.
 *
 * 쓰는 법 — 도구 HTML 에서 다른 스크립트보다 먼저 한 줄:
 *   <script src="sheets-proxy.js"></script>
 *   그리고 그 파일의 getAccessToken() 을 아래로 바꾼다:
 *   async function getAccessToken(){ return 'via-proxy'; }
 */
(function () {
  'use strict';

  // Apps Script 웹앱 /exec 주소.
  // 🚨 clasp 로 재배포할 때는 반드시 기존 배포ID 로 update-deployment 할 것.
  //    새 배포를 만들면 주소가 갈려서 사이트 전체가 죽는다.

  var PROXY_URL = 'https://script.google.com/macros/s/AKfycbx46saILixJ387TxLbfnsBwjdc5K93j-cqUFjHxQU8xPGL7DJ9S-YjUvw7kvHmGPe7mmg/exec';
  var SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets/';
  var STORE_KEY = 'mc_sheets_session';

  // ── 세션 보관 ───────────────────────────────────────────────────────
  function loadToken() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      return s.exp > Date.now() ? s.token : null;
    } catch (e) { return null; }
  }

  function saveToken(token, exp) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ token: token, exp: exp })); } catch (e) {}
  }

  function clearToken() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
  }

  // ── 프록시 호출 ─────────────────────────────────────────────────────
  // text/plain 으로 보내야 CORS preflight 가 안 뜬다 (Apps Script 는 OPTIONS 를 못 받는다)
  /* ⏱ 응답이 안 오면 **영영 기다리지 않는다** (2026-09-02 사고).
     이날 프록시 웹앱이 익명 접근 404가 되면서 카탈로그의 요청 10건이 통째로 pending 으로 매달렸다.
     실패한 게 아니라 **끝나지 않는 대기**라 에러도 안 뜨고 「상품을 불러오는 중」만 계속 돌았다 —
     업체도 우리도 뭐가 잘못됐는지 알 수가 없었고, 업체가 전화를 하고서야 알았다.
     → 시간이 넘으면 끊고 실패로 돌린다. 그래야 화면이 「불러오지 못했습니다 + 다시 시도」를 띄운다.
     ⚠️ 쓰기는 넉넉히 준다 — 서버엔 저장됐는데 실패로 보이는 것이 안 되는 것보다 나쁘다. */
  var READ_MS = 15000, WRITE_MS = 45000;
  function post(payload, ms) {
    var ac = (typeof AbortController === 'function') ? new AbortController() : null;
    var timer = ac ? setTimeout(function () { ac.abort(); }, ms || READ_MS) : 0;
    return fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      signal: ac ? ac.signal : undefined
    }).then(function (r) { clearTimeout(timer); return r.text(); }, function (e) {
      clearTimeout(timer);
      return '__PROXY_DOWN__' + ((ac && ac.signal && ac.signal.aborted)
        ? '시트 서버가 시간 안에 응답하지 않았습니다. 잠시 후 다시 시도해 주세요.'
        : '시트 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }).then(function (t) {
      if (typeof t === 'string' && t.indexOf('__PROXY_DOWN__') === 0) {
        return { error: { code: 504, message: t.slice(14) } };
      }
      /* 🔴 2026-08-27 사고 — Apps Script 는 몰리면 POST 를 doGet 으로 답한다.
         그러면 {ok:true, service:'sheets-proxy', note:'…'} 가 돌아오는데,
         예전 코드는 그걸 정상 응답으로 보고 new Response(undefined) 를 만들었다.
         → 본문이 빈 응답 → 도구에서 .json() 이 'Unexpected end of input' 로 터졌다.
         발주서 변환기가 "자꾸" 에러난 게 이것이다(몰릴 때만 나서 재현이 어려웠다). */
      var j;
      try { j = JSON.parse(t); }
      catch (e) { return { __transient: 'JSON아님: ' + t.slice(0, 80) }; }
      if (j && j.service === 'sheets-proxy' && j.body === undefined && !j.error) {
        return { __transient: 'POST가 doGet으로 응답됨' };
      }
      return j;
    });
  }

  // 읽기만 자동으로 다시 부른다.
  // 🔴 쓰기(PUT·POST·batchUpdate)는 절대 재시도하지 않는다 — 같은 저장이 두 번 들어간다.
  //    (카탈로그의 API_READONLY 와 같은 규칙이다. 중복이 응답 실패보다 나쁘다.)
  function postWithRetry(payload, retriable) {
    var tries = retriable ? 3 : 1;
    var ms = retriable ? READ_MS : WRITE_MS;
    function attempt(n) {
      return post(payload, ms).then(function (res) {
        if (res && res.__transient && n < tries) {
          return new Promise(function (r) { setTimeout(r, 400 * n); }).then(function () { return attempt(n + 1); });
        }
        return res;
      });
    }
    return attempt(1);
  }

  // 본문도 오류도 없는 응답을 절대 그대로 흘리지 않는다 — 사람 말로 바꿔 돌려준다.
  function toResponse(res) {
    if (res && res.__transient) {
      return new Response(JSON.stringify({ error: {
        code: 503,
        message: '시트 서버가 잠시 응답하지 못했습니다. 잠시 후 다시 시도해 주세요.'
      } }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    }
    if (res && res.error) {
      return new Response(JSON.stringify({ error: res.error }),
        { status: res.error.code || 500, headers: { 'Content-Type': 'application/json' } });
    }
    if (!res || res.body === undefined) {
      return new Response(JSON.stringify({ error: {
        code: 502,
        message: '시트 서버 응답을 읽지 못했습니다. 잠시 후 다시 시도해 주세요.'
      } }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json' } });
  }

  // ── 비밀번호 입력창 ─────────────────────────────────────────────────
  function askPasscode(message) {
    return new Promise(function (resolve) {
      var wrap = document.createElement('div');
      wrap.style.cssText =
        'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.55);' +
        'display:flex;align-items:center;justify-content:center;' +
        'font-family:system-ui,-apple-system,"Malgun Gothic",sans-serif';
      wrap.innerHTML =
        '<div style="background:#fff;color:#111;border-radius:12px;padding:24px 26px;' +
        'width:min(340px,90vw);box-shadow:0 12px 40px rgba(0,0,0,.3)">' +
        '<div style="font-weight:700;font-size:16px;margin-bottom:6px">팀 비밀번호</div>' +
        '<div style="font-size:13px;color:#666;margin-bottom:14px">' +
        (message || '이 브라우저에 30일간 저장됩니다.') + '</div>' +
        '<input type="password" autocomplete="current-password" style="width:100%;box-sizing:border-box;' +
        'padding:10px 12px;border:1px solid #ccc;border-radius:8px;font-size:15px">' +
        '<div class="err" style="color:#c00;font-size:12px;min-height:16px;margin-top:6px"></div>' +
        '<button style="width:100%;margin-top:8px;padding:10px;border:0;border-radius:8px;' +
        'background:#1a73e8;color:#fff;font-size:15px;font-weight:600;cursor:pointer">확인</button>' +
        '</div>';

      var input = wrap.querySelector('input');
      var btn = wrap.querySelector('button');
      var err = wrap.querySelector('.err');

      function submit() {
        var v = input.value;
        if (!v) { err.textContent = '비밀번호를 입력하세요'; return; }
        btn.disabled = true;
        btn.textContent = '확인 중...';
        post({ action: 'login', pw: v }).then(function (res) {
          if (res && res.token) {
            saveToken(res.token, res.exp);
            document.body.removeChild(wrap);
            resolve(res.token);
          } else {
            err.textContent = (res && res.error && res.error.message) || '실패';
            btn.disabled = false;
            btn.textContent = '확인';
            input.select();
          }
        }).catch(function (e) {
          err.textContent = '연결 오류: ' + e.message;
          btn.disabled = false;
          btn.textContent = '확인';
        });
      }

      btn.addEventListener('click', submit);
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
      document.body.appendChild(wrap);
      input.focus();
    });
  }

  // 동시에 여러 요청이 만료를 만나도 입력창은 하나만 뜨게 한다
  var pendingAuth = null;
  function ensureSession(message) {
    var t = loadToken();
    if (t) return Promise.resolve(t);
    /* 🔒 거래처 화면에서는 팀 비밀번호를 **묻지 않는다** (2026-09-02).
       카탈로그에서 업체가 발주 줄을 지우려다 이 창을 봤다. 우리 내부 비밀번호이므로
       업체 눈에 띄는 것 자체가 사고다. 페이지가 `window.SHEETS_PROXY_NO_ASK = true` 를
       켜두면(로그인한 사람이 마스터가 아닐 때) 묻는 대신 그냥 실패한다.
       ⚠️ 읽기는 public 경로로 나가므로 이 게이트에 걸리지 않는다 — 막히는 건 관리자 쓰기뿐이다. */
    if (window.SHEETS_PROXY_NO_ASK) {
      return Promise.reject(new Error('이 화면에서는 할 수 없는 동작입니다.'));
    }
    if (!pendingAuth) {
      pendingAuth = askPasscode(message).then(function (tok) {
        pendingAuth = null;
        return tok;
      });
    }
    return pendingAuth;
  }

  // ── fetch 가로채기 ──────────────────────────────────────────────────
  var nativeFetch = window.fetch.bind(window);

  window.fetch = function (input, init) {
    var url = (typeof input === 'string') ? input : (input && input.url) || '';
    if (url.indexOf(SHEETS_BASE) !== 0) return nativeFetch(input, init);

    init = init || {};
    var path = url.slice(SHEETS_BASE.length);
    var method = (init.method || 'GET').toUpperCase();
    var body = init.body;

    // 카탈로그처럼 거래처(고객)가 쓰는 페이지는 팀 비밀번호를 물을 수 없다.
    // 페이지가 shim 을 불러오기 전에 window.SHEETS_PROXY_PUBLIC = true 를 켜두면
    // 비밀번호 없이 나가고, 대신 서버가 허용된 시트·탭인지만 본다.
    var readOnly = (method === 'GET');

    if (window.SHEETS_PROXY_PUBLIC) {
      return postWithRetry({ action: 'public', path: path, method: method, body: body }, readOnly)
        .then(toResponse);
    }

    function call(token, retried) {
      return postWithRetry({ action: 'call', token: token, path: path, method: method, body: body }, readOnly)
        .then(function (res) {
          // 세션이 죽었으면 한 번만 다시 물어보고 재시도한다
          if (res && res.error && res.error.message === 'session-expired' && !retried) {
            clearToken();
            return ensureSession('세션이 만료됐습니다. 다시 입력해 주세요.')
              .then(function (t) { return call(t, true); });
          }
          return toResponse(res);
        });
    }

    return ensureSession().then(function (token) { return call(token, false); });
  };

  // 도구에서 필요하면 직접 부를 수 있게 열어둔다
  window.SheetsProxy = {
    ensureSession: ensureSession,
    signOut: function () { clearToken(); location.reload(); },
    url: PROXY_URL,

    /* 🔑 팀 인증으로 한 번만 호출한다 (2026-09-01).
       왜 필요한가: 카탈로그는 SHEETS_PROXY_PUBLIC=true 라 모든 요청이 무인증 public 경로로
       나가고, 서버는 거기에 **읽기만** 열어준다. 그런데 사장님이 카탈로그 화면에서 공지·소식글을
       지우고 싶어한다(2026-09-01). 그렇다고 public 쓰기를 열면 정적 페이지라 소스만 뜯으면
       누구나 지울 수 있다 — 사이트는 인터넷 전체 공개다.
       → 지우기 같은 관리자 동작만 이 함수로 보낸다. 팀 비밀번호를 아는 사람(사장님·원비씨)만
         통과하고, 세션은 다른 도구와 같은 것을 쓰므로 보통 한 번도 안 묻는다.
       ⚠️ 재시도하지 않는다 — 쓰기를 두 번 보내는 것이 실패보다 나쁘다. */
    call: function (path, method, body) {
      function send(token) {
        return postWithRetry({ action: 'call', token: token, path: path, method: method || 'GET', body: body }, false);
      }
      return ensureSession().then(send).then(function (res) {
        if (res && res.error && res.error.message === 'session-expired') {
          clearToken();
          return ensureSession('세션이 만료됐습니다. 다시 입력해 주세요.').then(send);
        }
        return res;
      }).then(function (res) {
        if (res && res.__transient) throw new Error('시트 서버가 잠시 응답하지 못했습니다. 잠시 후 다시 시도해 주세요.');
        if (res && res.error) throw new Error(res.error.message || '요청이 거절됐습니다.');
        return res;
      });
    }
  };
})();
