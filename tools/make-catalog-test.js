/**
 * make-catalog-test.js — catalog.html 로부터 catalog-test.html 을 생성한다
 *
 * 왜 (2026-08-27):
 *   두 파일을 각자 손으로 고치다 보니 테스트본이 실사이트보다 204줄·함수 4개
 *   (hapAlias·infoNudge·renderMoveBox·sync) 뒤처져 있었다. 그 상태로 테스트본을
 *   검증해봐야 실사이트와 다른 걸 본 것이라 의미가 없다.
 *   → 앞으로 테스트본은 손으로 고치지 않는다. 실사이트를 고치고 이걸 돌린다.
 *
 * 테스트본이 실사이트와 다른 점은 아래 6가지뿐이고, 전부 여기서 만들어낸다:
 *   1) 제목에 [🧪 테스트본]
 *   2) 빨간 테두리 + 상단 경고바 + 헤더 배지
 *   3) localStorage 키에 TEST_ 접두어 (업체 화면 캐시·로그인 오염 방지)
 *   4) order.js 의 네임스페이스도 TEST_
 *   5) API 주소 = Supabase Edge Function (실사이트는 Apps Script 그대로)
 *   6) 서버주소 미설정 오류 문구 (사소하지만 기존 테스트본과 맞춰둔다)
 *
 * 쓰는 법:
 *   node tools/make-catalog-test.js          생성
 *   node tools/make-catalog-test.js --check  생성했을 때와 지금 파일이 같은지만 확인
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'catalog.html');
const DST = path.join(ROOT, 'catalog-test.html');

// 테스트본만 보는 백엔드. 컷오버 때 실사이트 catalog.html 의 API 한 줄을
// 이 주소로 바꾸면 전환이 끝난다.
const SUPABASE_API = 'https://yzttmdrlujgstfjsbser.supabase.co/functions/v1/api';

const TEST_CSS = `/* 🧪 테스트본 표시 — 실사이트(catalog.html)와 절대 헷갈리면 안 된다 */
body{border:5px solid #d64545 !important;box-sizing:border-box;min-height:100vh}
.testbadge{display:inline-block;font-size:11px;font-weight:800;color:#fff;background:#d64545;
  padding:3px 9px;border-radius:6px;margin-left:8px;vertical-align:middle;letter-spacing:0}
.testbar{position:sticky;top:0;z-index:99;background:#d64545;color:#fff;font-size:12px;font-weight:700;
  text-align:center;padding:5px 10px;letter-spacing:0}
`;

const TESTBAR = '<div class="testbar">🧪 테스트본입니다 — 업체가 보는 실제 카탈로그가 아닙니다</div>';

const API_NOTE = `/* 🧪 2026-08-27 — 테스트본만 **Supabase Edge Function**을 본다. 실사이트(catalog.html)는 그대로 Apps Script다.
   요청·응답 모양은 100% 같게 맞춰놨다.
   ⚠️ 여기로 넣은 발주는 **Supabase에만** 쌓인다 — 컷오버 전까지는 실사이트 발주 내역에 안 보인다.
      그래도 버리는 데이터가 아니다. 당일 시트로 [보내기]까지 여기서 그대로 된다.
   이 주소는 tools/make-catalog-test.js 가 넣는다 — 이 파일을 직접 고치지 말 것. */`;

// ── 치환 ──────────────────────────────────────────────────────────────
// 하나라도 안 맞으면 조용히 반쪽짜리 파일이 나오므로, 전부 "몇 번 바뀌었는지" 센다.
const rules = [
  {
    what: '제목 배지',
    from: /<title>마스터 유통 카탈로그/,
    to: '<title>🧪 [테스트본] 마스터 유통 카탈로그',
    want: 1
  },
  {
    what: '테스트 CSS',
    from: /(?=\/\* ═+\n)/,   // 첫 구분선 주석 앞에 끼워넣는다
    to: TEST_CSS + '\n',
    want: 1, once: true
  },
  {
    what: '상단 경고바',
    from: /<div class="wrap">/,
    to: TESTBAR + '<div class="wrap">',
    want: 1
  },
  {
    what: '헤더 배지',
    from: /(<div class="gt">마스터 유통 카탈로그<span class="ver" id="gver"><\/span>)/,
    to: '$1<span class="testbadge">🧪 테스트본</span>',
    want: 1
  },
  { what: '캐시 키',     from: /'catalog_cache_v2'/g,    to: "'TEST_catalog_cache_v2'",    want: 1 },
  { what: '공지읽음 키', from: /'catalog_ntc_seen_'/g,   to: "'TEST_catalog_ntc_seen_'",   want: 1 },
  { what: '로그인 키',   from: /'catalog_auth_v1'/g,     to: "'TEST_catalog_auth_v1'",     want: 1 },
  { what: 'order 네임스페이스', from: /window\.ORDER_NS='';/, to: "window.ORDER_NS='TEST_';", want: 1 },
  /* 🔴 2026-08-28 — 컷오버가 끝나 **실사이트도 Supabase**를 본다. 주소가 이미 같아서 바꿀 게 없다.
     규칙을 지우지 않고 남긴 이유: 되돌려서 실사이트가 Apps Script로 돌아가면 이게 다시 살아나야 한다.
     ⚠️ 지금은 테스트본과 실사이트가 **같은 DB**를 본다 — 테스트 발주가 실발주에 섞인다.
        테스트본으로 발주를 넣어보기 전에 홍팀장에게 먼저 알릴 것. */
  {
    what: 'API 주소',
    from: /const API='https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec';/,
    to: API_NOTE + "\nconst API='" + SUPABASE_API + "';",
    want: 1,
    skipIf: src => src.indexOf("const API='" + SUPABASE_API + "'") >= 0
  },
  {
    what: '오류 문구',
    from: /throw new Error\('서버 주소가 설정되지 않았습니다\.'\)/,
    to: "throw new Error('발주 서버 주소가 아직 설정되지 않았습니다.')",
    want: 1
  }
];

let out = fs.readFileSync(SRC, 'utf8');
const problems = [];

for (const r of rules) {
  if (r.skipIf && r.skipIf(out)) { r.skipped = true; continue; }
  const hits = (out.match(r.from instanceof RegExp && r.from.global ? r.from : new RegExp(r.from.source, r.from.flags + 'g')) || []).length;
  if (hits !== r.want) {
    problems.push(`${r.what}: ${r.want}번 바뀌어야 하는데 ${hits}번 일치`);
    continue;
  }
  out = out.replace(r.from, r.to);
}

if (problems.length) {
  console.log('❌ catalog.html 구조가 바뀌어 생성을 멈춥니다 — 규칙을 고쳐야 합니다:');
  problems.forEach(p => console.log('   - ' + p));
  process.exit(1);
}

if (process.argv.includes('--check')) {
  const cur = fs.existsSync(DST) ? fs.readFileSync(DST, 'utf8') : '';
  const same = cur.replace(/\r/g, '') === out.replace(/\r/g, '');
  console.log(same ? '✅ 테스트본이 실사이트와 동기화돼 있습니다.'
                   : '⚠️ 테스트본이 실사이트와 다릅니다 — node tools/make-catalog-test.js 로 다시 생성하세요.');
  process.exit(same ? 0 : 1);
}

fs.writeFileSync(DST, out);
console.log('✅ catalog-test.html 생성 완료');
rules.forEach(r => console.log('   · ' + r.what + (r.skipped ? ' (건너뜀 — 이미 같음)' : '')));
