/**
 * sheets-proxy — 구글 시트 중계 웹앱
 *
 * 왜 만들었나 (2026-08-27):
 *   baljuseo 는 GitHub Pages 로 배포된다. repo 를 private 으로 묶어도
 *   "빌드된 사이트는 공개"다 (GitHub 설정 화면이 직접 경고한다).
 *   그런데 각 도구는 서비스계정 개인키를 HTML 안에 그대로 박아두고
 *   브라우저에서 JWT 를 서명해 Sheets API 를 직접 호출하고 있었다.
 *   → sheets-writer / catalog-reader 개인키가 인터넷 전체에 공개돼 있었다.
 *      (실제로 로그인 없이 curl 로 받아지는 것을 확인함)
 *
 *   이 웹앱은 그 키를 브라우저에서 완전히 걷어내기 위한 중계다.
 *
 * 구조:
 *   브라우저 --(팀 세션토큰)--> 이 웹앱 --(웹앱 소유자 권한)--> Sheets API
 *   브라우저는 구글 자격증명을 한 번도 만지지 않는다.
 *
 * 배포 설정 (중요):
 *   실행: 나(웹앱 소유자)  /  액세스: 모든 사용자
 *   "모든 사용자"여야 팀원이 로그인 없이 쓴다. 대신 아래 TEAM_PASSCODE 가 문지기다.
 *
 * Script Properties (배포 후 setup() 으로 넣는다):
 *   TEAM_PASSCODE   팀 비밀번호. 사람이 브라우저에서 한 번 입력하는 값
 *   HMAC_SECRET     세션토큰 서명용 임의 문자열 (아무도 몰라도 됨)
 *   ALLOW_SHEETS    (선택) 허용 스프레드시트 ID 쉼표 구분. 비우면 전체 허용
 *                   — 발주서 변환기처럼 사용자가 시트 주소를 직접 붙여넣는
 *                     도구가 있어서 기본은 비워둔다
 */

var SESSION_DAYS = 30;
var SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets/';

function props_() { return PropertiesService.getScriptProperties(); }

// ── 응답 ──────────────────────────────────────────────────────────────
// Apps Script 웹앱은 임의 CORS 헤더를 못 붙인다. ContentService 의 JSON 출력은
// 브라우저에서 그냥 읽히므로 그걸 쓴다. (요청도 text/plain 으로 받아 preflight 를 피함)
function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── 세션 토큰 ─────────────────────────────────────────────────────────
function b64url_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

function sign_(payloadB64) {
  var secret = props_().getProperty('HMAC_SECRET');
  if (!secret) throw new Error('HMAC_SECRET 미설정 — setup() 을 먼저 실행하세요');
  return b64url_(Utilities.computeHmacSha256Signature(payloadB64, secret));
}

function issueToken_() {
  var exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  var payload = b64url_(Utilities.newBlob(JSON.stringify({ exp: exp })).getBytes());
  return { token: payload + '.' + sign_(payload), exp: exp };
}

function checkToken_(token) {
  if (!token || token.indexOf('.') < 0) return false;
  var parts = token.split('.');
  var payloadB64 = parts[0], sig = parts[1];
  // 길이가 같을 때만 비교되도록 문자열 동등비교 전에 길이부터 본다
  var expect = sign_(payloadB64);
  if (sig.length !== expect.length || sig !== expect) return false;
  try {
    var data = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(payloadB64)).getDataAsString());
    return data.exp > Date.now();
  } catch (e) {
    return false;
  }
}

// ── 진입점 ────────────────────────────────────────────────────────────
// GET 은 배포 확인용으로만 쓴다. 실제 호출은 전부 POST(text/plain).
function doGet() {
  return out_({ ok: true, service: 'sheets-proxy', note: '동작 확인용. 실제 호출은 POST.' });
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return out_({ error: { code: 400, message: '요청 본문이 JSON 이 아닙니다' } });
  }

  if (req.action === 'login') {
    var pw = props_().getProperty('TEAM_PASSCODE');
    if (!pw) return out_({ error: { code: 500, message: 'TEAM_PASSCODE 미설정' } });
    if (String(req.pw || '') !== pw) {
      Utilities.sleep(1000);  // 무차별 대입 늦추기
      return out_({ error: { code: 401, message: '비밀번호가 틀렸습니다' } });
    }
    return out_(issueToken_());
  }

  if (req.action === 'call') {
    if (!checkToken_(req.token)) {
      return out_({ error: { code: 401, message: 'session-expired' } });
    }
    return out_(relay_(req));
  }

  // 카탈로그는 거래처(고객)가 쓰는 페이지라 팀 비밀번호를 걸 수 없다.
  // 대신 비밀번호 없이 받되 "어느 시트의 어느 탭"까지만 허용한다.
  // 도구시트에는 전체판매·업무관리 같은 내부 탭이 같이 있어서
  // 시트 단위로 열면 안 되고 반드시 탭 단위로 좁혀야 한다.
  if (req.action === 'public') {
    var verdict = publicAllowed_(req);
    if (!verdict.ok) return out_({ error: { code: 403, message: verdict.why } });
    return out_(relay_(req));
  }

  // 제안서 도구의 상품 이미지 업로드.
  // Drive 멀티파트를 그대로 중계하는 것보다 DriveApp 으로 받는 편이 짧고 안전하다.
  if (req.action === 'uploadImage') {
    if (!checkToken_(req.token)) {
      return out_({ error: { code: 401, message: 'session-expired' } });
    }
    try {
      var blob = Utilities.newBlob(
        Utilities.base64Decode(req.data),
        req.mimeType || 'application/octet-stream',
        req.name || 'upload'
      );
      var file = DriveApp.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return out_({ id: file.getId(), url: 'https://drive.google.com/file/d/' + file.getId() + '/view' });
    } catch (err) {
      return out_({ error: { code: 500, message: '업로드 실패: ' + err.message } });
    }
  }

  return out_({ error: { code: 400, message: '알 수 없는 action: ' + req.action } });
}

// ── 무인증(카탈로그) 허용 판정 ────────────────────────────────────────
// PUBLIC_READ  / PUBLIC_WRITE 형식: "시트ID" 또는 "시트ID|탭이름" 을 쉼표로
//   "시트ID"       → 그 시트의 모든 탭
//   "시트ID|탭이름" → 그 탭만
// 카탈로그 무인증 범위의 기본값.
// 시트 ID 와 탭 이름은 비밀이 아니라 클라이언트 HTML 에 이미 들어있는 값이므로
// 코드에 둔다. Script Property 로 덮어쓸 수 있다.
/* 🔴 2026-08-27 사고 — 여기에 탭을 빠뜨리면 **에러도 안 뜨고 화면만 빈다.**
   처음엔 도구시트를 `카탈로그_계정` 하나만 열어뒀는데, 카탈로그는 그 시트에서
   사진·합포장·분류·추천상품·공지사항까지 읽는다 → 전부 403 → 상품 584개가
   통째로 "사진 준비중"으로 떴다. 링크 정본 시트는 아예 빠져 있었다.
   ⚠️ 목록의 근거는 catalog.html 이다. 거기서 읽는 탭이 늘면 **여기도 같이 늘려야 한다.**
      확인: `grep -oE "'[가-힣A-Za-z_0-9]+'![A-Z]" catalog.html | sort -u`
   ⚠️ 시트를 통째로 열지 않는다. 도구시트엔 전체판매·업무관리 같은 내부 탭이 같이 있다. */
var DOGU_ = '1t1E8TZ9442OvgFV6Ah5nK6gexHv7xxVFf0jBVDXFUzM';   // 도구시트
var LINK_ = '1Gfjvk_4u-sFCm-u6xLE5idMxtqmBq9X3dC_BHanq-uQ';   // 상품정보 업데이트(링크 정본)
var DEFAULT_PUBLIC = {
  // 상품시트(유통시트)는 통째로 읽기 허용 — 거래처에게 보여주는 카탈로그 그 자체다.
  // 도구시트·링크시트는 **카탈로그가 실제로 읽는 탭만** 연다.
  PUBLIC_READ: [
    '1bFfYmNNzPpIztK6_AD918Hu7s3JvaqkGGlwfIi6LxqY',   // 유통시트 (상품 목록·변동사항)
    DOGU_ + '|카탈로그_계정',      // 로그인
    DOGU_ + '|상품이미지_v2',      // 상품 사진·스펙
    DOGU_ + '|상품링크',           // 링크 미러
    DOGU_ + '|상품분류',           // 카테고리
    DOGU_ + '|합포장',             // 합포장 묶음
    DOGU_ + '|추천상품',           // 추천
    DOGU_ + '|공지사항',           // 공지
    DOGU_ + '|상품별판매',         // 머리글 한 줄만 읽는다(A1:ZZ1)
    LINK_ + '|링크'                // 링크 정본
  ].join(','),
  PUBLIC_WRITE: DOGU_ + '|카탈로그_계정'
};

/* 🔴 2026-08-27 — 허용목록은 **코드가 정본이다.** Script Property 로 덮어쓰지 않는다.
   예전엔 `props_().getProperty(name) || DEFAULT_PUBLIC[name]` 였다. 그래서
   setupCatalogPublic() 이 저장해둔 옛 목록이 코드를 조용히 덮어썼고,
   코드를 고쳐 배포해도 **아무 일이 안 일어났다. 이유 표시도 없이.**
   허용목록은 보안 관련이라 깃에 남고 리뷰되는 곳에 있어야 한다. */
function parseRules_(name) {
  return (DEFAULT_PUBLIC[name] || '').split(',')
    .map(function (s) { return s.trim(); })
    .filter(String)
    .map(function (s) {
      var bits = s.split('|');
      return { id: bits[0].trim(), tab: (bits[1] || '').trim() };
    });
}

// 경로에서 건드리는 탭 이름들을 뽑는다.
// 예: {ID}/values/'카탈로그_계정'!C5?valueInputOption=RAW
//     {ID}/values:batchGet?ranges='탭'!A1&ranges=...
function tabsInPath_(path) {
  var decoded;
  try { decoded = decodeURIComponent(path); } catch (e) { decoded = path; }
  var tabs = [];
  var re = /'([^']+)'!|(?:values\/|ranges=)([^!'&?]+)!/g;
  var m;
  while ((m = re.exec(decoded)) !== null) tabs.push((m[1] || m[2]).trim());
  return tabs;
}

function publicAllowed_(req) {
  var path = String(req.path || '');
  if (!path) return { ok: false, why: 'path 없음' };

  var method = (req.method || 'GET').toUpperCase();
  var writing = (method !== 'GET');
  var rules = parseRules_(writing ? 'PUBLIC_WRITE' : 'PUBLIC_READ');
  if (!rules.length) return { ok: false, why: '무인증 접근이 설정돼 있지 않습니다' };

  var id = path.split(/[\/?:]/)[0];
  var forSheet = rules.filter(function (r) { return r.id === id; });
  if (!forSheet.length) return { ok: false, why: '허용되지 않은 시트입니다' };

  // 시트 전체를 연 규칙이 있으면 탭은 안 따진다
  if (forSheet.some(function (r) { return !r.tab; })) return { ok: true };

  var allowedTabs = forSheet.map(function (r) { return r.tab; });
  var tabs = tabsInPath_(path);

  // 탭을 특정하지 못하는 요청(시트 전체 메타 조회 등)은 탭 제한이 걸린 시트에서는 막는다
  if (!tabs.length) return { ok: false, why: '탭을 특정하지 않은 요청은 허용되지 않습니다' };

  for (var i = 0; i < tabs.length; i++) {
    if (allowedTabs.indexOf(tabs[i]) < 0) {
      return { ok: false, why: '허용되지 않은 탭입니다: ' + tabs[i] };
    }
  }
  // 구조 변경(batchUpdate)은 무인증으로 절대 허용하지 않는다
  if (/:batchUpdate\b/.test(path) && !/values:batchUpdate/.test(path)) {
    return { ok: false, why: '구조 변경은 허용되지 않습니다' };
  }
  return { ok: true };
}

// ── Sheets API 중계 ───────────────────────────────────────────────────
function relay_(req) {
  var path = String(req.path || '');
  if (!path) return { error: { code: 400, message: 'path 없음' } };

  // 스프레드시트 ID 화이트리스트 (설정돼 있을 때만)
  var allow = (props_().getProperty('ALLOW_SHEETS') || '').split(',')
    .map(function (s) { return s.trim(); })
    .filter(String);
  if (allow.length) {
    var id = path.split(/[\/?:]/)[0];
    if (allow.indexOf(id) < 0) {
      return { error: { code: 403, message: '허용되지 않은 시트: ' + id } };
    }
  }

  var method = (req.method || 'GET').toLowerCase();
  var opts = {
    method: method,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  };
  if (method !== 'get' && req.body != null) {
    opts.contentType = 'application/json';
    opts.payload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }

  var res = UrlFetchApp.fetch(SHEETS_BASE + path, opts);
  return {
    status: res.getResponseCode(),
    body: res.getContentText()
  };
}

// ── 최초 1회 설정 ─────────────────────────────────────────────────────
// 편집기에서 이 함수를 직접 실행한다. 비밀번호는 여기서 바꾼다.
function setup() {
  var p = props_();
  p.setProperty('TEAM_PASSCODE', 'CHANGE_ME');       // ← 팀 비밀번호로 교체
  p.setProperty('HMAC_SECRET', Utilities.getUuid() + Utilities.getUuid());
  p.setProperty('ALLOW_SHEETS', '');                 // 비우면 전체 허용
  Logger.log('설정 완료. TEAM_PASSCODE 를 실제 비밀번호로 바꿨는지 확인하세요.');
}

// 카탈로그(거래처용)를 비밀번호 없이 열어주는 범위 설정.
// 다른 속성은 건드리지 않으므로 언제든 다시 실행해도 안전하다.
function setupCatalogPublic() {
  var 상품시트 = '1bFfYmNNzPpIztK6_AD918Hu7s3JvaqkGGlwfIi6LxqY';
  var 도구시트 = '1t1E8TZ9442OvgFV6Ah5nK6gexHv7xxVFf0jBVDXFUzM';
  var 계정탭 = '카탈로그_계정';

  /* 🔴 2026-08-27 — 이 함수는 이제 **설정값을 지우는 일만** 한다.
     허용목록의 정본은 코드의 DEFAULT_PUBLIC 이다(위 parseRules_ 주석 참고).
     예전에 이 함수가 저장해둔 좁은 목록이 코드를 덮어써서, 카탈로그가 사진·합포장·
     분류·추천상품·공지사항을 통째로 못 읽었다(상품 584개가 "사진 준비중"). */
  props_().deleteProperty('PUBLIC_READ');
  props_().deleteProperty('PUBLIC_WRITE');
  Logger.log('옛 설정값을 지웠습니다. 이제 코드의 DEFAULT_PUBLIC 이 정본입니다:\n  읽기 = %s\n  쓰기 = %s',
    DEFAULT_PUBLIC.PUBLIC_READ, DEFAULT_PUBLIC.PUBLIC_WRITE);
}

// 비밀번호만 바꾸고 싶을 때 (기존 세션은 그대로 살아있다)
function setPasscode(pw) {
  props_().setProperty('TEAM_PASSCODE', pw);
}

// 유출 의심 시 — 모든 기기의 세션을 즉시 무효화한다
function revokeAllSessions() {
  props_().setProperty('HMAC_SECRET', Utilities.getUuid() + Utilities.getUuid());
  Logger.log('모든 세션 무효화됨. 팀원은 비밀번호를 다시 입력해야 합니다.');
}
