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
  function post(payload) {
    return fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); });
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

    function call(token, retried) {
      return post({ action: 'call', token: token, path: path, method: method, body: body })
        .then(function (res) {
          if (res && res.error) {
            // 세션이 죽었으면 한 번만 다시 물어보고 재시도한다
            if (res.error.message === 'session-expired' && !retried) {
              clearToken();
              return ensureSession('세션이 만료됐습니다. 다시 입력해 주세요.')
                .then(function (t) { return call(t, true); });
            }
            return new Response(JSON.stringify({ error: res.error }), {
              status: res.error.code || 500,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          return new Response(res.body, {
            status: res.status,
            headers: { 'Content-Type': 'application/json' }
          });
        });
    }

    return ensureSession().then(function (token) { return call(token, false); });
  };

  // 도구에서 필요하면 직접 부를 수 있게 열어둔다
  window.SheetsProxy = {
    ensureSession: ensureSession,
    signOut: function () { clearToken(); location.reload(); },
    url: PROXY_URL
  };
})();
