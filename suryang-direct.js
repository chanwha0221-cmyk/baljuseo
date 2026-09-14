/**
 * suryang-direct.js — 수량관리 전용: 브라우저가 구글 Sheets API 를 **직접** 부른다 (2026-09-14 홍팀장)
 *
 * 왜 (홍팀장: "안정성 + 속도 + 여러 명 써도 터지지 않게, 이걸 메인으로"):
 *   8/27 이전 수량관리는 서비스계정 키로 직접 불러서 빨랐다. 키를 걷어내고 Apps Script 중계로 바꾼 뒤로
 *   한 번에 13~17초 · 줄 서기 · 헛응답(doGet) 이 반복돼 계속 터졌다.
 *   → 수량 시트 **전용** 서비스계정(suryang-writer)을 새로 파서 다시 직접 부른다.
 *     이 계정은 수량 시트 두 개에만 공유돼 있다. 새 수량 시트는 원래 «링크 있는 사람 편집» 이라
 *     키가 보여도 더 열리는 것이 없다. 다른 도구 시트에는 **절대 이 계정을 공유하지 말 것.**
 *
 * 쓰는 법: 페이지에서 suryang-key.js(window.SURYANG_SA) → 이 파일 순서로 싣는다.
 *   페이지의 fetch('https://sheets.googleapis.com/…') 호출은 한 줄도 안 바꿔도 된다 — 여기서 토큰만 붙인다.
 *
 * 안정성:
 *   · 토큰은 1시간짜리를 한 번 받아 돌려 쓴다(동시에 여러 요청이 와도 발급은 한 번).
 *   · 시간 제한 20초(쓰기 30초). 끝나지 않는 대기는 없다.
 *   · 429(구글 분당 한도)·5xx·네트워크 끊김은 1→2→4초 쉬고 다시 건다.
 *     단 **덧붙이기(:append — 삭제 로그)는 다시 걸지 않는다**(줄 중복). 나머지 쓰기는 두 번 들어가도 같은 값이다.
 *   · 여러 명이 15초마다 읽는 배경 동기화는 이 파일을 안 탄다 — 페이지가 CSV 내보내기로 직접 읽는다(한도 없음).
 *     그래서 이 계정의 분당 한도는 «저장 직전 읽기 + 저장» 에만 쓰인다.
 */
(function () {
  'use strict';
  var SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets/';
  var SA = window.SURYANG_SA || null;
  var nativeFetch = window.fetch.bind(window);
  var token = null, tokenExp = 0, pendingToken = null;

  function b64urlBytes(buf) {
    var s = '', b = new Uint8Array(buf);
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlJSON(o) { return b64urlBytes(new TextEncoder().encode(JSON.stringify(o))); }

  function getToken() {
    if (token && Date.now() < tokenExp - 60000) return Promise.resolve(token);
    if (pendingToken) return pendingToken;
    if (!SA || !SA.private_key || !SA.client_email) return Promise.reject(new Error('수량 시트 키(suryang-key.js)가 없습니다'));
    pendingToken = (async function () {
      var body = SA.private_key.replace(/-----[^-]+-----/g, '').replace(/\\n/g, '').replace(/\s/g, '');
      var der = Uint8Array.from(atob(body), function (c) { return c.charCodeAt(0); });
      var key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
      var now = Math.floor(Date.now() / 1000);
      var unsigned = b64urlJSON({ alg: 'RS256', typ: 'JWT' }) + '.' + b64urlJSON({
        iss: SA.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
      });
      var sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
      var r = await nativeFetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + unsigned + '.' + b64urlBytes(sig)
      });
      var j = await r.json();
      if (!j.access_token) throw new Error('구글 토큰 발급 실패: ' + (j.error_description || j.error || r.status));
      token = j.access_token; tokenExp = Date.now() + (j.expires_in || 3600) * 1000;
      return token;
    })();
    pendingToken.then(function () { pendingToken = null; }, function () { pendingToken = null; });
    return pendingToken;
  }

  function errResponse(code, msg) {
    return new Response(JSON.stringify({ error: { code: code, message: msg } }),
      { status: code, headers: { 'Content-Type': 'application/json' } });
  }

  /* ⏰ 옛 「수량 리더 시트」(마감시간 정본)는 이 계정에 공유하지 않는다 — 키가 공개 페이지에 있어서
     공유하면 그 시트 전체가 열린다. 그 시트로 가는 호출(⏰ 마감시간 저장뿐)은 수량 전용 웹앱으로 돌린다.
     웹앱은 그 시트의 «마감시간 탭만» 허용한다. 드물게 쓰는 동작이라 몇 초 걸려도 괜찮다. */
  var RELAY_IDS = ['1WrasAPb8uQLacnwOe2_vVZHD-3cQR7oYKLxOEB_k0SI'];
  var RELAY_URL = 'https://script.google.com/macros/s/AKfycbxI0Vzt7BtnExrEkYW-HOB_BHFy_uXqmOIlF7He-yEhE_BUk8XKvfE4HDhynLFzQM8/exec';
  function relay(path, method, body) {
    var tries = /:append\b/.test(path) ? 1 : 4;
    function attempt(n) {
      var ac = new AbortController(), timer = setTimeout(function () { ac.abort(); }, 45000);
      return nativeFetch(RELAY_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'public', path: path, method: method, body: body }), signal: ac.signal })
        .then(function (r) { clearTimeout(timer); return r.text(); })
        .then(function (t) {
          var j = null; try { j = JSON.parse(t); } catch (e) {}
          var transient = !j || (j.service === 'sheets-proxy' && j.body === undefined && !j.error);   // doGet 헛응답
          if (transient && n < tries) return new Promise(function (ok) { setTimeout(ok, 800 * n); }).then(function () { return attempt(n + 1); });
          if (!j || transient) return errResponse(503, '시트 서버가 잠시 응답하지 못했습니다. 잠시 후 다시 시도해 주세요.');
          if (j.error) return errResponse(j.error.code || 500, j.error.message || '요청이 거절됐습니다');
          return new Response(j.body, { status: j.status, headers: { 'Content-Type': 'application/json' } });
        }, function () {
          clearTimeout(timer);
          if (n < tries) return new Promise(function (ok) { setTimeout(ok, 800 * n); }).then(function () { return attempt(n + 1); });
          return errResponse(503, '시트 서버가 시간 안에 응답하지 않았습니다. 잠시 후 다시 시도해 주세요.');
        });
    }
    return attempt(1);
  }

  window.fetch = function (input, init) {
    var url = (typeof input === 'string') ? input : (input && input.url) || '';
    if (url.indexOf(SHEETS_BASE) !== 0) return nativeFetch(input, init);
    init = init || {};
    var method = (init.method || 'GET').toUpperCase();
    var path = url.slice(SHEETS_BASE.length);
    // 옛 시트는 «링크 보기» 라 이 계정도 읽기는 된다(실측 200) → 읽기는 직접, **쓰기만** 웹앱으로
    if (method !== 'GET' && RELAY_IDS.indexOf(path.split(/[\/?:]/)[0]) >= 0) return relay(path, method, init.body);
    var writing = method !== 'GET';
    var retriable = !/:append\b/.test(url);          // 삭제 로그 덧붙이기만 1회
    var tries = retriable ? 4 : 1, ms = writing ? 30000 : 20000;

    function attempt(n) {
      return getToken().then(function (t) {
        var headers = new Headers(init.headers || {});
        headers.set('Authorization', 'Bearer ' + t);
        var ac = new AbortController(), timer = setTimeout(function () { ac.abort(); }, ms);
        return nativeFetch(url, { method: method, headers: headers, body: init.body, signal: ac.signal })
          .then(function (r) {
            clearTimeout(timer);
            if (r.status === 401 && n < tries) { token = null; return attempt(n + 1); }   // 토큰 만료 — 새로 받아 다시
            if ((r.status === 429 || r.status >= 500) && n < tries) {
              return new Promise(function (ok) { setTimeout(ok, 1000 * Math.pow(2, n - 1)); }).then(function () { return attempt(n + 1); });
            }
            return r;
          }, function (e) {
            clearTimeout(timer);
            if (n < tries) return new Promise(function (ok) { setTimeout(ok, 1000 * Math.pow(2, n - 1)); }).then(function () { return attempt(n + 1); });
            return errResponse(503, ac.signal.aborted ? '구글 시트가 시간 안에 응답하지 않았습니다. 잠시 후 다시 시도해 주세요.' : '구글 시트에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.');
          });
      }, function (e) { return errResponse(401, e.message); });
    }
    return attempt(1);
  };

  window.SheetsProxy = { url: 'direct:' + (SA && SA.client_email || 'no-key') };   // 예전 shim 과 같은 이름(점검용)
})();
