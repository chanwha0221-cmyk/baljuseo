/* =========================================================
   제안서 사이트 공용 백엔드 — 구글 시트(서비스계정) 직접 호출
   index.html · admin.html 공용. (발주서/카탈로그와 동일한 하우스 패턴:
   JWT RS256 → OAuth 토큰 → Sheets API)

   원비님 원본은 Supabase 를 썼지만, 이 카피본은 팀장님 전용이라
   baljuseo 가 이미 쓰는 도구시트에 탭 4개로 붙였다.
     제안서버전     id · slug · 이름 · 순서 · 설정JSON
     제안서카테고리 id · key · 이름 · 아이콘 · 영문라벨 · 소개 · 헤더메타 · 색상 · 사진맞춤 · 표시 · 순서
     제안서상품     버전 · 카테고리 · 상품명 · 창고 · 설명 · 공급가 · 택배사 · 택배비 · 면과세 · 사진 · 링크 · 노출 · 순서 · 특별제안가 · 원가
                    (특별제안가: 넣으면 공급가에 줄 긋고 이 값이 노출 / 원가: 관리자만 보는 값, 제안서엔 절대 안 나감)
   ※ 조회수(제안서조회) 탭은 2026-08-20 폐기 — 홍팀장 혼자 쓰는 도구라 불필요.
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
    history: '제안이력',      // 📝 언제 · 어느 업체에 · 무슨 상품을 · 얼마에 제안했나 (2026-08-24 홍팀장)
    catmap: '상품분류'        // catalog.html 이 쓰는 그 분류표(상품명 → 분류). 여기선 읽기만 한다.
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

  /* ── 유통시트(정본) 읽기 ────────────────────────────────────────────────
     상품명·공급가의 진짜 원본은 유통시트다. 도구시트의 '전체상품원가' 사본은 낡을 수 있어
     자동완성은 여기서 직접 읽는다(2026-08-20 홍팀장 지시).
     파싱은 catalog.html 에서 검증된 로직을 그대로 옮겼다 — 함정이 세 개 있다:
       ① 헤더가 1행이 아니다   → '상품명'+'공급가' 가 같이 있는 행을 찾아 헤더로 삼는다
       ② '택배비' 헤더가 두 칸 → 값을 보고 택배사명/금액을 판별(라벨로 잡으면 전부 무료배송이 된다)
       ③ 공급가가 "48,000 > 45,000" → 화살표 뒤(새 값)만 쓴다
     '상품변동사항'·'가격비교결과' 등은 상품 목록이 아니라서 제외한다. */
  var YUTONG_ID = '1bFfYmNNzPpIztK6_AD918Hu7s3JvaqkGGlwfIi6LxqY';
  var YUTONG_SKIP = ['상품변동사항', '공급가', '리모콘', '링크', '마감시간', '유통시트_1차', '유통시트_2차', '변동사항', '가격비교결과', '공지_당일생물'];

  function yPrice(s) {
    s = (s == null ? '' : s).toString().trim();
    if (!s) return null;
    var parts = s.split(/>|＞|→/).map(function (x) { return x.trim(); });
    var num = function (x) { var m = (x.match(/[\d,]+/) || [''])[0].replace(/,/g, ''); return m ? parseInt(m, 10) : null; };
    return num(parts[parts.length - 1]);   // 화살표가 있으면 마지막(=현재가)
  }
  function yNum(x) { var m = ((x == null ? '' : x).toString().match(/[\d,]+/) || [''])[0].replace(/,/g, ''); return m ? parseInt(m, 10) : 0; }

  async function svcReadYutong() {
    var t = await svcToken();
    var mr = await fetch('https://sheets.googleapis.com/v4/spreadsheets/' + YUTONG_ID + '?fields=sheets.properties(title,hidden)',
      { headers: { Authorization: 'Bearer ' + t } });
    if (!mr.ok) throw new Error('유통시트 접근 실패 HTTP ' + mr.status);
    var meta = await mr.json();
    var tabs = (meta.sheets || []).map(function (s) { return s.properties; })
      .filter(function (p) { return !p.hidden && YUTONG_SKIP.indexOf(p.title) < 0; })
      .map(function (p) { return p.title; });
    if (!tabs.length) return [];

    var q = tabs.map(function (x) { return 'ranges=' + encodeURIComponent("'" + x.replace(/'/g, "''") + "'!A1:N400"); }).join('&');
    var vr = await fetch('https://sheets.googleapis.com/v4/spreadsheets/' + YUTONG_ID + '/values:batchGet?' + q,
      { headers: { Authorization: 'Bearer ' + t } });
    if (!vr.ok) throw new Error('유통시트 로드 실패 HTTP ' + vr.status);
    var got = await vr.json();

    var out = [];
    (got.valueRanges || []).forEach(function (vrg, gi) {
      var tab = tabs[gi], rows = vrg.values || [];
      if (rows.length < 2) return;
      var hr = -1;
      for (var r = 0; r < Math.min(40, rows.length); r++) {
        var j = (rows[r] || []).join('|');
        if (j.indexOf('상품명') >= 0 && j.indexOf('공급가') >= 0) { hr = r; break; }
      }
      if (hr < 0) return;
      var H = rows[hr].map(function (x) { return String(x || ''); });
      if (/원가|공급처|기존가/.test(H.join('|'))) return;          // 내부 작업탭 가드
      var col = function (labels) {
        for (var i = 0; i < H.length; i++) for (var k = 0; k < labels.length; k++) if (H[i].indexOf(labels[k]) >= 0) return i;
        return -1;
      };
      var iName = col(['상품명']), iPrice = col(['공급가']), iTax = col(['면과세', '면/과세', '과세']), iWh = col(['창고명']);
      if (iName < 0 || iPrice < 0) return;

      var shipIdx = [], i2;
      for (i2 = 0; i2 < H.length; i2++) if (H[i2].indexOf('택배') >= 0) shipIdx.push(i2);
      var shipCol = -1, courierCol = -1;
      shipIdx.forEach(function (idx) {
        var n = 0, c = 0;
        for (var r2 = hr + 1; r2 < Math.min(hr + 12, rows.length); r2++) {
          var v = String((rows[r2] || [])[idx] || '').trim(); if (!v) continue;
          if (/택배|통운|로젠|우체국|경동|천일|합동|화물/.test(v)) c++;
          else if (/[\d,]/.test(v) || v.indexOf('무료') >= 0) n++;
        }
        if (c > n) { if (courierCol < 0) courierCol = idx; }
        else if (shipCol < 0) shipCol = idx;
      });

      for (var r3 = hr + 1; r3 < rows.length; r3++) {
        var row = rows[r3] || [];
        var nm = String(row[iName] || '').trim();
        if (!nm || nm === '상품명') continue;
        if (/^[<〈][\s\S]*[>〉]$/.test(nm)) continue;              // 📢 공지 행은 상품이 아니다
        var pr = yPrice(row[iPrice]);
        if (pr == null) continue;
        out.push({
          name: nm, supply_price: pr,
          ship_fee: shipCol >= 0 ? yNum(row[shipCol]) : 0,
          courier: courierCol >= 0 ? String(row[courierCol] || '').trim() : '',
          tax: String((iTax >= 0 ? row[iTax] : '') || '').indexOf('과세') > -1 &&
               String((iTax >= 0 ? row[iTax] : '') || '').indexOf('면과세') < 0 ? '과세' : '면세',
          warehouse: (iWh >= 0 && String(row[iWh] || '').trim()) || tab
        });
      }
    });
    return out;
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
  HEADERS[TAB.products] = ['버전', '카테고리', '상품명', '창고', '설명', '공급가', '택배사', '택배비', '면과세', '사진', '링크', '노출', '순서', '특별제안가', '원가'];
  HEADERS[TAB.history] = ['날짜', '업체명', '상품명', '제안가', '창고', '메모', 'id'];
  // ⚠️ '상품분류'(catmap)는 여기서 만들지 않는다 — media-updater/카탈로그가 쓰는 기존 탭이라 읽기만 한다.

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
    writeTab: svcWriteTab, append: svcAppend, upload: svcUploadImage, ensureTabs: svcEnsureTabs,
    readYutong: svcReadYutong
  };
  // 예전 이름 유지 (app.js 폴백 경로가 쓴다)
  window.svcToken = svcToken;
  window.svcReadRows = function () { return svcReadTab(TAB.products); };
})();
