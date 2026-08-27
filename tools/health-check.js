/**
 * health-check.js — 도구들이 실제로 살아 있는지 **익명으로** 확인한다.
 *
 * 왜 있나 (2026-08-27 사고):
 *   도구 21개를 한 번에 sheets-proxy 경유로 바꾸고, 확인은 브라우저 주소창으로 했다.
 *   그런데 브라우저는 **로그인 쿠키를 싣고** 가고, 도구의 fetch 는 **쿠키 없이 익명으로** 나간다.
 *   배포된 프록시가 익명 접근을 막고 있어서 → 주소창으론 멀쩡, 도구에선 전부 404.
 *   수량관리·비서·소식글이 통째로 멈췄고 팀원이 먼저 겪었다.
 *
 *   🔴 교훈: **도구가 부르는 방식 그대로 불러봐야 확인이다.**
 *      사람이 브라우저로 열어보는 것은 확인이 아니다.
 *
 * 쓰는 법:  node tools/health-check.js
 *   배포 뒤, 그리고 "도구가 이상하다"는 말이 나올 때 제일 먼저 돌린다.
 */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');

// ── 어느 파일이 어느 백엔드를 보는지 소스에서 직접 뽑는다 (손으로 적지 않는다) ──
const EXEC_RE = /https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec/g;
const SUPA_RE = /https:\/\/[a-z0-9]+\.supabase\.co\/functions\/v1\/[A-Za-z0-9_-]+/g;

function scan(dir, out, depth) {
  if (depth > 2) return out;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (f.name.startsWith('.') || f.name === 'node_modules') continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) { scan(p, out, depth + 1); continue; }
    if (!/\.(html|js)$/i.test(f.name)) continue;
    const src = fs.readFileSync(p, 'utf8');
    const urls = [...new Set([...(src.match(EXEC_RE) || []), ...(src.match(SUPA_RE) || [])])];
    if (urls.length) out.push({ file: path.relative(ROOT, p), urls });
  }
  return out;
}

const files = scan(ROOT, [], 0);
const byUrl = {};
for (const f of files) for (const u of f.urls) (byUrl[u] ||= []).push(f.file);

/* 🔴 sheets-proxy.js 는 **여러 도구가 같이 불러 쓰는 파일**이다.
   그 안의 주소 하나가 죽으면 그걸 부르는 도구가 **전부** 죽는다.
   여기서 그 관계를 펴주지 않으면 "쓰는 곳 1개"로 보여서 사고 크기를 잘못 읽는다
   (2026-08-27에 21개가 같이 죽었는데 아무도 그 규모를 몰랐다). */
for (const shim of files.filter(f => /^sheets-proxy\.js$/i.test(f.file))) {
  const users = files
    .filter(f => /\.html$/i.test(f.file))
    .filter(f => fs.readFileSync(path.join(ROOT, f.file), 'utf8').includes('sheets-proxy.js'))
    .map(f => f.file);
  // 실제로는 shim 을 부르는 html 이 훨씬 많다 — 주소를 안 가진 파일까지 훑는다
  const all = [];
  (function walk(dir, depth) {
    if (depth > 2) return;
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (d.name.startsWith('.') || d.name === 'node_modules') continue;
      const p = path.join(dir, d.name);
      if (d.isDirectory()) { walk(p, depth + 1); continue; }
      if (!/\.html$/i.test(d.name)) continue;
      if (fs.readFileSync(p, 'utf8').includes('sheets-proxy.js')) all.push(path.relative(ROOT, p));
    }
  })(ROOT, 0);
  for (const u of shim.urls) {
    byUrl[u] = [...new Set([...(byUrl[u] || []).filter(x => x !== shim.file), ...users, ...all])];
  }
}

// ── 익명으로 부른다. 쿠키·인증 헤더 일절 안 붙인다 (도구와 같은 조건) ──
async function probe(url) {
  const t0 = Date.now();
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 45000);
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: '__healthcheck__' }),   // 어느 백엔드든 모르는 액션이면 곱게 거절한다
      signal: ctl.signal
    });
    clearTimeout(to);
    const txt = await r.text();
    const ms = Date.now() - t0;
    if (r.status !== 200) return { ok: false, ms, why: 'HTTP ' + r.status + (r.status === 404 ? ' — 익명 접근이 막혀 있다(배포 권한 확인)' : '') };
    try { JSON.parse(txt); } catch (_) {
      return { ok: false, ms, why: 'JSON 이 아닌 것을 돌려준다 — ' + txt.slice(0, 60).replace(/\s+/g, ' ') };
    }
    return { ok: true, ms };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, why: e.name === 'AbortError' ? '45초 안에 응답 없음' : e.message };
  }
}

(async () => {
  const urls = Object.keys(byUrl);
  console.log('도구가 의존하는 백엔드 ' + urls.length + '곳을 **익명으로** 확인한다.\n');
  let bad = 0;
  for (const u of urls) {
    const r = await probe(u);
    const tag = u.includes('supabase') ? 'Supabase' : 'AppsScript';
    console.log((r.ok ? '✅ ' : '❌ ') + tag + '  ' + r.ms + 'ms' + (r.ok ? '' : '  — ' + r.why));
    console.log('   ' + u);
    console.log('   쓰는 곳(' + byUrl[u].length + '): ' + byUrl[u].join(', '));
    if (!r.ok) { bad++; }
    console.log('');
  }
  if (bad) {
    console.log('❌ 죽은 백엔드 ' + bad + '곳 — 위 "쓰는 곳" 의 도구가 전부 안 된다.');
    process.exit(1);
  }
  console.log('✅ 전부 응답한다. (응답한다는 것까지다 — 로그인 뒤 데이터가 맞는지는 사람이 봐야 한다)');
})();
