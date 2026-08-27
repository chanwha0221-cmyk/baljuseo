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

/* ── 정적 검사: 시트를 부르는데 프록시를 안 챙긴 파일 ──────────────────────
   2026-08-27 두 번째 사고. media-updater.js 는 **북마클릿으로 남의 페이지에 주입**되는데,
   개인키를 걷어내면서 인증을 sheets-proxy.js 에 맡겨놓고 그 shim 은 안 불러왔다.
   → 가짜 토큰 `Bearer via-proxy` 를 그대로 구글에 보내 사진 채우기가 통째로 죽었다.
   HTML 은 <script src="sheets-proxy.js"> 로 챙기지만, 주입되는 .js 는 스스로 챙겨야 한다. */
function staticCheck() {
  const bad = [];
  (function walk(dir, depth) {
    if (depth > 2) return;
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (d.name.startsWith('.') || d.name === 'node_modules' || d.name === 'tools') continue;
      const p = path.join(dir, d.name);
      if (d.isDirectory()) { walk(p, depth + 1); continue; }
      if (!/\.(html|js)$/i.test(d.name)) continue;
      const src = fs.readFileSync(p, 'utf8');
      if (!src.includes('sheets.googleapis.com')) continue;         // 시트를 안 부르면 상관없음
      if (src.includes('sheets-proxy.js')) continue;                // shim 을 스스로 챙긴다
      if (/BEGIN PRIVATE KEY/.test(src)) continue;                  // 아직 자기 키로 도는 파일
      // 🔵 구글 로그인(GIS)으로 **쓰는 사람 본인 계정** 토큰을 받는 도구는 프록시가 필요 없다
      //    (byeondong·판매캘린더가 그렇다). 이걸 안 걸러내면 검사가 헛것을 짖는다.
      if (/gsi\/client|initTokenClient/.test(src)) continue;
      // 🔵 .js 는 그것을 싣는 HTML 이 shim 을 불러주면 된다 (order.js ← catalog.html)
      if (/\.js$/i.test(p)) {
        const rel = path.basename(p);
        const hosts = [];
        (function scanHosts(d2, dep) {
          if (dep > 2) return;
          for (const e of fs.readdirSync(d2, { withFileTypes: true })) {
            if (e.name.startsWith('.') || e.name === 'node_modules') continue;
            const q = path.join(d2, e.name);
            if (e.isDirectory()) { scanHosts(q, dep + 1); continue; }
            if (!/\.html$/i.test(e.name)) continue;
            const h = fs.readFileSync(q, 'utf8');
            if (h.includes(rel)) hosts.push(h);
          }
        })(ROOT, 0);
        if (hosts.length && hosts.every(h => h.includes('sheets-proxy.js'))) continue;
      }
      bad.push(path.relative(ROOT, p));
    }
  })(ROOT, 0);
  return bad;
}

(async () => {
  const orphan = staticCheck();
  if (orphan.length) {
    console.log('❌ 시트를 부르는데 sheets-proxy.js 를 안 챙긴 파일:');
    orphan.forEach(f => console.log('   · ' + f));
    console.log('   → 인증 없이 나가서 전부 401 이 된다. 그 파일이 스스로 shim 을 불러오게 하거나,');
    console.log('     그 파일을 싣는 페이지가 <script src="sheets-proxy.js"> 를 먼저 불러야 한다.\n');
  } else {
    console.log('✅ 시트를 부르는 파일은 전부 프록시를 챙긴다.\n');
  }

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
