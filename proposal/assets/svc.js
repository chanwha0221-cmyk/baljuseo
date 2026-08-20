/* =========================================================
   제안서 사이트 공용 백엔드 — 구글 시트(서비스계정) 직접 호출
   index.html · admin.html 공용. (발주서/카탈로그와 동일한 하우스 패턴:
   JWT RS256 → OAuth 토큰 → Sheets API)

   원비님 원본은 Supabase 를 썼지만, 이 카피본은 팀장님 전용이라
   baljuseo 가 이미 쓰는 도구시트에 탭 4개로 붙였다.
     제안서버전     id · slug · 이름 · 순서 · 설정JSON
     제안서카테고리 id · key · 이름 · 아이콘 · 영문라벨 · 소개 · 헤더메타 · 색상 · 사진맞춤 · 표시 · 순서
     제안서상품     버전 · 카테고리 · 상품명 · 창고 · 설명 · 공급가 · 택배사 · 택배비 · 면과세 · 사진 · 링크 · 노출 · 순서
     제안서조회     시각 · 버전slug · 방문자 · 유입
   ========================================================= */
(function () {
  "use strict";
  var CFG = window.PROPOSAL_CONFIG || {};
  var SCOPE = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file';
  var _tok = null, _exp = 0;

  var TAB = {
    products: '제안서상품',
    versions: '제안서버전',
    cats: '제안서카테고리',
    views: '제안서조회'
  };

  function sheetId() { return (CFG.dataSheet && CFG.dataSheet.id) || ''; }

  async function svcToken() {
    if (_tok && Date.now() < _exp - 60000) return _tok;
    var s = CFG.svc || {};
    var now = Math.floor(Date.now() / 1000);
    var enc = function (obj) { return btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'); };
    var toSign = enc({ alg: 'RS256', typ: 'JWT' }) + '.' +
      enc({ iss: s.email, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now });
    var pem = String(s.key || '').replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, '');
    var bin = Uint8Array.from(atob(pem), function (c) { return c.charCodeAt(0); });
    var key = await crypto.subtle.importKey('pkcs8', bin, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    var sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(toSign));
    var jwt = toSign + '.' + btoa(String.fromCharCode.apply(null, new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    var res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=' + jwt
    });
    var d = await res.json();
    if (!d.access_token) throw new Error('토큰 발급 실패');
    _tok = d.access_token; _exp = Date.now() + (d.expires_in ? d.expires_in : 3300) * 1000;
    return _tok;
  }

  // 네트워크가 한 번 튀는 것만으로 화면 전체가 "불러오지 못했습니다"가 되지 않게
  // 일시적 실패(fetch 예외·5xx·429)는 한 번 더 시도한다.
  async function api(path, opt, retry) {
    opt = opt || {};
    var t = await svcToken();
    var head = { Authorization: 'Bearer ' + t };
    if (opt.body) head['Content-Type'] = 'application/json';
    var r;
    try {
      r = await fetch('https://sheets.googleapis.com/v4/spreadsheets/' + path,
        { method: opt.method || 'GET', headers: head, body: opt.body });
    } catch (e) {
      if (retry) throw e;
      await new Promise(function (s) { setTimeout(s, 700); });
      return api(path, opt, true);
    }
    if (!r.ok) {
      if (!retry && (r.status >= 500 || r.status === 429)) {
        await new Promise(function (s) { setTimeout(s, 700); });
        return api(path, opt, true);
      }
      if (r.status === 401 || r.status === 403) { _tok = null; _exp = 0; }   // 토큰 재발급 유도
      throw new Error('시트 ' + (opt.method || 'GET') + ' 실패 HTTP ' + r.status);
    }
    var txt = await r.text();
    return txt ? JSON.parse(txt) : {};
  }

  var rng = function (tab, a1) { return encodeURIComponent("'" + tab + "'!" + a1); };

  /* 탭 하나를 2차원 배열로 (0행 = 헤더) */
  async function svcReadTab(tab) {
    if (!sheetId()) throw new Error('dataSheet 미설정');
    var j = await api(sheetId() + '/values/' + rng(tab, 'A1:Z'));
    return j.values || [];
  }

  /* 여러 탭 한 번에 (왕복 1회) */
  async function svcReadTabs(tabs) {
    if (!sheetId()) throw new Error('dataSheet 미설정');
    var q = tabs.map(function (t) { return 'ranges=' + rng(t, 'A1:Z'); }).join('&');
    var j = await api(sheetId() + '/values:batchGet?' + q);
    var out = {};
    (j.valueRanges || []).forEach(function (vr, i) { out[tabs[i]] = vr.values || []; });
    return out;
  }

  /* 탭 전체 교체. ⚠️ 읽기에 성공한 뒤에만 부를 것 (빈 배열로 덮어쓰면 데이터가 날아간다) */
  async function svcWriteTab(tab, rows) {
    if (!rows || !rows.length) throw new Error('빈 내용으로 덮어쓰기 차단');
    await api(sheetId() + '/values/' + rng(tab, 'A:Z') + ':clear', { method: 'POST' });
    await api(sheetId() + '/values/' + rng(tab, 'A1') + '?valueInputOption=RAW',
      { method: 'PUT', body: JSON.stringify({ values: rows }) });
    return true;
  }

  /* 맨 아래에 행 추가 (조회 기록용 — 기존 내용을 절대 안 건드림) */
  async function svcAppend(tab, rows) {
    await api(sheetId() + '/values/' + rng(tab, 'A1') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',
      { method: 'POST', body: JSON.stringify({ values: rows }) });
    return true;
  }

  /* 사진 업로드 — 구글 드라이브에 올리고 "링크가 있는 사람" 열람 권한을 준다.
     원본(Supabase Storage) 대체. 반환 URL 은 imgUrl()/resolveImage() 가
     drive 썸네일 주소로 바꿔서 표시한다. */
  async function svcUploadImage(file) {
    var t = await svcToken();
    var meta = { name: (Date.now() + '_' + (file.name || 'photo.jpg')).replace(/[^\w.\-가-힣]/g, '_') };
    var fd = new FormData();
    fd.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
    fd.append('file', file);
    var r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      { method: 'POST', headers: { Authorization: 'Bearer ' + t }, body: fd });
    if (!r.ok) throw new Error('업로드 실패 HTTP ' + r.status);
    var j = await r.json();
    var p = await fetch('https://www.googleapis.com/drive/v3/files/' + j.id + '/permissions',
      { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'reader', type: 'anyone' }) });
    if (!p.ok) throw new Error('공개 설정 실패 HTTP ' + p.status);
    return 'https://drive.google.com/file/d/' + j.id + '/view';
  }

  /* 탭이 없으면 헤더까지 만들어 준다 (처음 여는 브라우저 대비) */
  var HEADERS = {};
  HEADERS[TAB.versions] = ['id', 'slug', '이름', '순서', '설정JSON'];
  HEADERS[TAB.cats] = ['id', 'key', '이름', '아이콘', '영문라벨', '소개', '헤더메타', '색상', '사진맞춤', '표시', '순서'];
  HEADERS[TAB.products] = ['버전', '카테고리', '상품명', '창고', '설명', '공급가', '택배사', '택배비', '면과세', '사진', '링크', '노출', '순서'];
  HEADERS[TAB.views] = ['시각', '버전slug', '방문자', '유입'];

  async function svcEnsureTabs() {
    var j = await api(sheetId() + '?fields=sheets(properties(title))');
    var have = {};
    (j.sheets || []).forEach(function (s) { have[s.properties.title] = 1; });
    var need = Object.keys(HEADERS).filter(function (t) { return !have[t]; });
    if (!need.length) return false;
    await api(sheetId() + ':batchUpdate', {
      method: 'POST',
      body: JSON.stringify({ requests: need.map(function (title) { return { addSheet: { properties: { title: title } } }; }) })
    });
    for (var i = 0; i < need.length; i++) {
      await api(sheetId() + '/values/' + rng(need[i], 'A1') + '?valueInputOption=RAW',
        { method: 'PUT', body: JSON.stringify({ values: [HEADERS[need[i]]] }) });
    }
    return true;
  }

  window.SVC = {
    TAB: TAB, HEADERS: HEADERS,
    token: svcToken, readTab: svcReadTab, readTabs: svcReadTabs,
    writeTab: svcWriteTab, append: svcAppend, upload: svcUploadImage, ensureTabs: svcEnsureTabs
  };
  // 예전 이름 유지 (app.js 폴백 경로가 쓴다)
  window.svcToken = svcToken;
  window.svcReadRows = function () { return svcReadTab(TAB.products); };
})();
