/**
 * strip-keys.js — 도구 파일에서 구글 서비스계정 개인키를 걷어낸다
 *
 * 왜 (2026-08-27):
 *   Pages 사이트는 repo 가 private 이어도 공개다. 각 도구가 개인키를 HTML 에
 *   박아두고 브라우저에서 JWT 를 서명하고 있어서 키가 그대로 노출됐다.
 *   sheets-proxy.js 가 fetch 를 가로채 프록시로 돌리므로, 도구에서는
 *   (1) 키 상수  (2) 토큰 함수 본문  두 가지만 걷어내면 된다.
 *
 * 쓰는 법:
 *   node tools/strip-keys.js --check            바뀔 내용만 보고 (파일 안 건드림)
 *   node tools/strip-keys.js catalog-test.html  지정 파일만 변환
 *   node tools/strip-keys.js --all              키가 있는 파일 전부 변환
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SHIM_TAG = '<script src="sheets-proxy.js"></script>';
const TOKEN_FNS = ['getAccessToken', 'getToken', 'token', 'svcToken'];

// 거래처(고객)가 직접 여는 페이지 — 팀 비밀번호를 물으면 거래처가 막힌다.
// 이 파일들은 무인증으로 나가고, 대신 프록시가 허용된 시트·탭인지만 본다.
const PUBLIC_FILES = ['catalog.html', 'catalog-test.html'];
const PUBLIC_FLAG = '<script>window.SHEETS_PROXY_PUBLIC=true;</script>';

function allSourceFiles() {
  const out = [];
  (function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      if (name === '.git' || name === 'node_modules' || name === 'apps-script') continue;
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) { walk(full); continue; }
      if (!/\.(html|js)$/.test(name)) continue;
      if (full.endsWith('sheets-proxy.js') || full.endsWith('strip-keys.js')) continue;
      out.push(full);
    }
  })(ROOT);
  return out;
}

function findTargets() {
  const files = allSourceFiles();
  const withKey = files.filter(f => fs.readFileSync(f, 'utf8').includes('BEGIN PRIVATE KEY'));

  // 키가 든 .js 를 불러오는 HTML 도 대상이다 — 그 HTML 이 shim 을 실어야
  // 안에서 도는 시트 호출이 프록시로 넘어간다 (proposal/index.html, admin.html)
  const keyJs = withKey.filter(f => f.endsWith('.js')).map(f => path.basename(f));
  const loaders = files.filter(f =>
    f.endsWith('.html') &&
    !withKey.includes(f) &&
    keyJs.some(js => fs.readFileSync(f, 'utf8').includes(js))
  );

  return withKey.concat(loaders);
}

function transform(src, isHtml, relDir, isPublic) {
  // 하위 폴더 파일은 shim 을 ../ 로 올라가서 불러야 한다 (통장내역조회/, proposal/)
  const up = relDir ? relDir.split(/[\\/]/).map(() => '..').join('/') + '/' : '';
  const shimTag = SHIM_TAG.replace('sheets-proxy.js', up + 'sheets-proxy.js');
  const notes = [];
  let out = src;

  // 1) const PRIVATE_KEY=`...`;  또는 "..." — 여러 줄 템플릿 리터럴을 통째로 지운다
  const keyRe = /^[ \t]*(?:const|let|var)\s+PRIVATE_KEY\s*=\s*(`[\s\S]*?`|"[\s\S]*?"|'[\s\S]*?')\s*;?[ \t]*\r?\n/gm;
  const keyHits = out.match(keyRe);
  if (keyHits) {
    out = out.replace(keyRe, '');
    notes.push(`키 상수 ${keyHits.length}개 제거`);
  }

  // 1-b) 객체 속성으로 들어있는 키 —  svc: { email: '...', key: `-----BEGIN...` }
  //      (proposal/config.js 가 이 형태다)
  const propRe = /(\bkey\s*:\s*)(`[\s\S]*?`|"[\s\S]*?"|'[\s\S]*?')/g;
  out = out.replace(propRe, (whole, lead, val) =>
    val.includes('BEGIN PRIVATE KEY')
      ? (notes.push('객체 속성 키 제거'), lead + "''")
      : whole);

  // 2) 토큰 함수 본문을 프록시용 스텁으로 교체
  //    중괄호 깊이를 세어 함수 끝을 찾는다 (본문에 정규식/객체가 섞여 있어 단순 매칭은 위험)
  //    한 파일에 같은 함수가 여러 벌 있는 경우가 있어(media-updater.html) 없어질 때까지 돈다
  for (const fn of TOKEN_FNS) {
   for (;;) {
    const sigRe = new RegExp('(async\\s+function\\s+' + fn + '\\s*\\([^)]*\\)\\s*\\{)(?![\\s\\S]{0,80}via-proxy)');
    const m = sigRe.exec(out);
    if (!m) break;
    const start = m.index;
    let i = start + m[1].length;
    let depth = 1;
    while (i < out.length && depth > 0) {
      const c = out[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      i++;
    }
    if (depth !== 0) { notes.push(`⚠ ${fn} 끝을 못 찾음 — 건너뜀`); break; }
    const stub =
      'async function ' + fn + '(){\n' +
      "  // 실제 인증은 sheets-proxy.js 가 프록시로 처리한다. 이 값은 쓰이지 않는다.\n" +
      "  return 'via-proxy';\n" +
      '}';
    out = out.slice(0, start) + stub + out.slice(i);
    notes.push(`${fn}() 스텁 처리`);
   }
  }

  // 3) HTML 이면 shim 을 첫 <script> 앞에 끼워넣는다
  // 스텁 주석에도 'sheets-proxy.js' 라는 글자가 들어가므로, 파일명이 아니라
  // script 태그 자체가 있는지로 판단해야 한다 (여기서 한 번 헛짚었다)
  if (isHtml && !out.includes('sheets-proxy.js"')) {
    const at = out.indexOf('<script');
    if (at < 0) notes.push('⚠ <script> 태그가 없어 shim 을 못 넣음');
    else {
      // 플래그는 shim 보다 먼저 놓여야 한다 — shim 이 읽는 값이다
      const inject = (isPublic ? PUBLIC_FLAG + '\n' : '') + shimTag;
      out = out.slice(0, at) + inject + '\n' + out.slice(at);
      notes.push('shim 삽입' + (up ? ` (${up}sheets-proxy.js)` : '') +
        (isPublic ? ' + 무인증 플래그(거래처용)' : ''));
    }
  }

  return { out, notes };
}

const args = process.argv.slice(2);
const check = args.includes('--check');
const all = args.includes('--all');
const named = args.filter(a => !a.startsWith('--'));

const files = (all || check) ? findTargets() : named.map(f => path.resolve(ROOT, f));
if (!files.length) { console.log('대상 파일이 없습니다.'); process.exit(0); }

let changed = 0;
for (const full of files) {
  const rel = path.relative(ROOT, full);
  const src = fs.readFileSync(full, 'utf8');
  const { out, notes } = transform(
    src,
    full.endsWith('.html'),
    path.dirname(rel) === '.' ? '' : path.dirname(rel),
    PUBLIC_FILES.includes(path.basename(full))
  );
  const stillHasKey = out.includes('BEGIN PRIVATE KEY');
  const flag = stillHasKey ? '  ❌ 키 남음' : '';
  console.log(`${rel.padEnd(40)} ${notes.join(', ') || '변경 없음'}${flag}`);
  if (!check && out !== src) { fs.writeFileSync(full, out); changed++; }
}
console.log(check ? '\n(--check 모드: 파일은 안 건드렸습니다)' : `\n${changed}개 파일 변경됨`);
