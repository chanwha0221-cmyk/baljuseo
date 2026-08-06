/* =========================================================
   서비스계정 토큰 + 제안서상품 탭 읽기/쓰기 (index.html·admin.html 공용)
   — 발주서 변환기 getAccessToken()과 동일 패턴 (JWT RS256, crypto.subtle)
   ========================================================= */
(function () {
  "use strict";
  var CFG = window.PROPOSAL_CONFIG || {};
  var _tok = null, _exp = 0;

  async function svcToken() {
    if (_tok && Date.now() < _exp - 60000) return _tok;
    var s = CFG.svc || {};
    var header = { alg: 'RS256', typ: 'JWT' };
    var now = Math.floor(Date.now() / 1000);
    var claim = { iss: s.email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now };
    var enc = function (obj) { return btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'); };
    var toSign = enc(header) + '.' + enc(claim);
    var pem = String(s.key || '').replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, '');
    var bin = Uint8Array.from(atob(pem), function (c) { return c.charCodeAt(0); });
    var key = await crypto.subtle.importKey('pkcs8', bin, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    var sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(toSign));
    var jwt = toSign + '.' + btoa(String.fromCharCode.apply(null, new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    var res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + jwt });
    var d = await res.json();
    if (!d.access_token) throw new Error('토큰 발급 실패');
    _tok = d.access_token; _exp = Date.now() + (d.expires_in ? d.expires_in : 3300) * 1000;
    return _tok;
  }

  // '제안서상품' 탭 → rows(2차원 배열, [0]=헤더)
  async function svcReadRows() {
    var ds = CFG.dataSheet || {};
    if (!ds.id || !ds.tab) throw new Error('dataSheet 미설정');
    var t = await svcToken();
    var r = await fetch('https://sheets.googleapis.com/v4/spreadsheets/' + ds.id + '/values/' + encodeURIComponent("'" + ds.tab + "'!A1:Z"), { headers: { Authorization: 'Bearer ' + t } });
    if (!r.ok) throw new Error('시트 읽기 실패 HTTP ' + r.status);
    var j = await r.json();
    return j.values || [];
  }

  // rows(헤더 포함)로 탭 전체 덮어쓰기
  async function svcWriteRows(rows) {
    var ds = CFG.dataSheet || {};
    var t = await svcToken();
    var clear = await fetch('https://sheets.googleapis.com/v4/spreadsheets/' + ds.id + '/values/' + encodeURIComponent("'" + ds.tab + "'!A:Z") + ':clear', { method: 'POST', headers: { Authorization: 'Bearer ' + t } });
    if (!clear.ok) throw new Error('시트 비우기 실패 HTTP ' + clear.status);
    var w = await fetch('https://sheets.googleapis.com/v4/spreadsheets/' + ds.id + '/values/' + encodeURIComponent("'" + ds.tab + "'!A1") + '?valueInputOption=RAW', { method: 'PUT', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify({ values: rows }) });
    if (!w.ok) throw new Error('시트 쓰기 실패 HTTP ' + w.status);
    return true;
  }

  window.svcToken = svcToken;
  window.svcReadRows = svcReadRows;
  window.svcWriteRows = svcWriteRows;
})();
