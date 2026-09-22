/* 🦊 여우팀 «실 소유자» 감시 탭 — 북마클릿 본문 (2026-09-17)
 *
 * 무엇: 전체 수량시트에서 여우 칸이 바뀌면, 그 칸의 「수정 기록」을 읽어 «누가 몇 개» 를
 *       여우팀 수량시트 실 소유자에 채운다. 칸이 바뀌고 20초 안팎이면 이름이 붙는다.
 *
 * 왜 브라우저가 필요한가: 「누가」는 구글이 API 로 안 준다. 화면(셀 우클릭 →「수정 기록 표시」)
 *       에만 있어서 브라우저만 읽을 수 있다. 그래서 이 탭이 대신 읽어 준다.
 *
 * 쓰는 법: 마스터 수량시트를 연다 → 아무 칸 우클릭 → Esc → 이 북마클릿 클릭. 그 뒤로는 그냥 둔다.
 *   ▸ 평소엔 아무 일도 안 한다. 스크립트가 올려둔 «읽어올 칸» 목록이 빌 때까지만 움직인다.
 *   ▸ 한 번 더 누르면 멈춘다.
 *
 * 🔴 이 탭은 감시 전용으로 둘 것 — 도는 동안 탭을 옮겨 다니므로 사람이 같이 쓰면 엉킨다.
 * 🔴 페이지를 새로 열면 «우클릭 1회» 를 다시 해줘야 메뉴가 만들어진다(구글 쪽 제약).
 */
(function () {
  var ALLID = '1GOQnTOr6LfFpyTTDaSLsN-fkWN14Yf1Kkabu8CpF_g0';
  var FOXID = '1gBH1yXReSLdIrI2tR2Z-sIAbSyQIWCe1-s1Hc-0wbsk';
  var URL = 'https://script.google.com/macros/s/AKfycbyOPSk6qoVVD2eZxEVkk81YNDouH3Qgw9Ba9DTVuKr2vK8oU5Lqf2HNUIQxkvxRkXjxSQ/exec';
  var TOKEN = 'fox-2026-hcw';
  var VER = '0922';   // 배지에 찍힌다 — 옛 북마크가 남아 있는지 한눈에 알기 위해
  /* ⚙ 이 값들은 스크립트가 시트 U1 에 올려준다 — 숫자를 바꾸려고 북마크를 다시 등록하지 않기 위해서다 */
  var CFG = { max: 60, ms: 90000, batch: 4, tick: 8000, days: 4 };

  if (window.__FOXWATCH) { window.__FOXWATCH.stop(); return; }
  if (location.href.indexOf(ALLID) < 0) { alert('마스터 수량시트를 열고 눌러 주세요.'); return; }
  function hasMenu() { return [].slice.call(document.querySelectorAll('.goog-menuitem')).some(function (e) { return /수정 기록 표시/.test(e.innerText); }); }
  /* 우클릭 메뉴는 한 번 열려야 만들어진다 — 사람 대신 한 번 열었다 닫는다 (2026-09-18 실측: 스크립트로 열어도 된다) */
  if (!hasMenu()) {
    try {
      var gEl = document.querySelector('#waffle-grid-container') || document.querySelector('.grid-container');
      var gr = gEl.getBoundingClientRect(), gx = gr.left + 200, gy = gr.top + 200;
      var tgt = document.elementFromPoint(gx, gy) || gEl;
      ['mousedown', 'mouseup', 'contextmenu'].forEach(function (t) {
        tgt.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window, button: 2, buttons: 2, clientX: gx, clientY: gy }));
      });
      document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape', keyCode: 27 }));
    } catch (e) {}
  }
  if (!hasMenu()) {
    alert('아무 칸이나 마우스 오른쪽 클릭했다가 Esc 로 닫은 뒤, 다시 눌러 주세요.\n(페이지를 새로 열 때 한 번만 하면 됩니다)');
    return;
  }

  /* 🔴 가려진 탭에서도 돌게 한다 (2026-09-18 홍팀장: "별도 창으로 띄워놓으면 불편해서 어캄").
     크롬은 뒤에 숨은 탭의 타이머를 1분에 한 번으로 몰아 돌리고, 구글시트는 숨은 탭에서
     「수정 기록」 내용을 아예 안 불러온다(빈 틀만 뜬다 — 실측). 그래서
     ① 이 탭에는 «보이는 중» 이라고 알려 주고 ② 화면 그리기 신호(rAF)를 타이머 없이 바로 돌려 주고
     ③ 기다릴 땐 타이머 대신 «화면이 바뀌면 바로» 알아채게 한다. 숨은 탭 실측: 한 칸 기록 전체 5초. 쉬는 동안 부하 0. */
  try {
    Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: function () { return false; } });
    Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get: function () { return 'visible'; } });
    Object.defineProperty(Document.prototype, 'webkitHidden', { configurable: true, get: function () { return false; } });
  } catch (e) {}
  ['visibilitychange', 'webkitvisibilitychange'].forEach(function (t) {
    document.addEventListener(t, function (e) { e.stopImmediatePropagation(); }, true);
    window.addEventListener(t, function (e) { e.stopImmediatePropagation(); }, true);
  });
  (function () {
    var ch = new MessageChannel(), qd = [], pend = false;
    ch.port1.onmessage = function () {
      pend = false;
      var t = performance.now(), l = qd.splice(0);
      l.forEach(function (f) { try { f(t); } catch (e) {} });
    };
    window.requestAnimationFrame = function (cb) {
      qd.push(cb);
      if (!pend) { pend = true; ch.port2.postMessage(0); }
      return qd.length;
    };
  })();
  /* 조건이 맞을 때까지 — 화면이 바뀔 때마다 확인한다. ms 는 끝내 안 될 때의 상한(숨은 탭에선 더 늦을 수 있다) */
  function waitFor(fn, ms) {
    return new Promise(function (res) {
      var v = fn();
      if (v) return res(v);
      var done = false, t = null;
      var ob = new MutationObserver(function () {
        if (done) return;
        var v2 = fn();
        if (v2) { done = true; ob.disconnect(); clearTimeout(t); res(v2); }
      });
      ob.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
      t = setTimeout(function () { if (done) return; done = true; ob.disconnect(); res(fn() || null); }, ms);
    });
  }

  var bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;right:16px;top:64px;z-index:99999;background:#137333;color:#fff;padding:10px 14px;border-radius:8px;font:13px/1.5 sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.3);max-width:340px;cursor:pointer';
  bar.title = '누르면 감시를 멈춥니다';
  document.body.appendChild(bar);
  var stamp = '';
  function say(t, color) { bar.textContent = '🦊 v' + VER + ' ' + t + (stamp ? ' · ' + stamp : ''); if (color) bar.style.background = color; }

  var stopped = false, busy = false, timer = null, tabCache = {}, recent = {};
  var W = {
    stop: function () {
      stopped = true;
      if (timer) clearTimeout(timer);
      bar.remove();
      window.__FOXWATCH = null;
    }
  };
  window.__FOXWATCH = W;
  bar.onclick = function () { W.stop(); };

  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var q = function (s) { return document.querySelector(s); };

  function parseCsv(t) {
    var rows = [], r = [], c = '', inQ = false;
    for (var i = 0; i < t.length; i++) {
      var ch = t[i];
      if (inQ) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else inQ = false; } else c += ch; }
      else if (ch === '"') inQ = true;
      else if (ch === ',') { r.push(c); c = ''; }
      else if (ch === '\n') { r.push(c); rows.push(r); r = []; c = ''; }
      else if (ch !== '\r') c += ch;
    }
    if (c !== '' || r.length) { r.push(c); rows.push(r); }
    return rows;
  }
  function csv(id, name, range) {
    var u = 'https://docs.google.com/spreadsheets/d/' + id + '/gviz/tq?tqx=out:csv&headers=0&sheet=' +
            encodeURIComponent(name) + (range ? '&range=' + range : '');
    return fetch(u, { credentials: 'include', cache: 'no-store' }).then(function (r) { return r.text(); }).then(parseCsv);
  }
  function colName(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; }
  function tabEls() { return [].slice.call(document.querySelectorAll('.docs-sheet-tab')); }
  function tabNames() { return tabEls().map(function (e) { return e.querySelector('.docs-sheet-tab-name').innerText.trim(); }); }
  function cur() { var e = q('.docs-sheet-active-tab .docs-sheet-tab-name'); return e ? e.innerText.trim() : ''; }
  function fire(el, types) { types.forEach(function (t) { el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window })); }); }

  async function openTab(name) {
    if (cur() === name) return true;
    var i = tabNames().indexOf(name);
    if (i < 0) return false;
    fire(tabEls()[i], ['mousedown', 'mouseup', 'click']);
    return !!(await waitFor(function () { return cur() === name; }, 8000));
  }
  async function goCell(a1) {
    var nb = q('#t-name-box');
    nb.focus(); nb.value = a1;
    nb.dispatchEvent(new Event('input', { bubbles: true }));
    ['keydown', 'keypress', 'keyup'].forEach(function (t) {
      nb.dispatchEvent(new KeyboardEvent(t, { bubbles: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 }));
    });
    await waitFor(function () { return q('#t-name-box').value === a1; }, 3000);
    return q('#t-name-box').value;
  }
  function openHist() {
    var it = [].slice.call(document.querySelectorAll('.goog-menuitem')).filter(function (e) { return /수정 기록 표시/.test(e.innerText); })[0];
    if (!it) return false;
    fire(it, ['mouseover', 'mousedown', 'mouseup', 'click']);
    return true;
  }
  function snap() {
    var a = q('.docs-blameview-author'), c = q('.docs-blameview-content');
    if (!a || !c) return null;
    var who = a.innerText.trim(), lines = c.innerText.split('\n');
    var body = lines.slice(2).join(' ').trim();
    if (!who || !body) return null;
    return { who: who, when: lines[1] || '', body: body };
  }
  function parseBody(b) {
    var m = b.match(/"([^"]*)"이\(가\)\s*"([^"]*)"\(으\)로 교체됨/);
    if (m) return { before: m[1], after: m[2] };
    m = b.match(/"([^"]*)"이\(가\)\s*삭제됨/);
    if (m) return { before: m[1], after: '' };
    m = b.match(/"([^"]*)"이\(가\)\s*(?:입력|추가)됨/);
    if (m) return { before: '', after: m[1] };
    return { before: '', after: '' };
  }
  function waitNew(prev, ms) {
    return waitFor(function () {
      var s = snap();
      return (s && (s.who + s.when + s.body) !== prev) ? s : null;
    }, ms);
  }
  /* 🔴 오래된 기록까지 거슬러 올라가지 않는다 — 한 칸에서 9월 9일까지 읽고 있었다 (2026-09-18).
     지금 판은 어제 저녁에 열렸으니 «어제·오늘» 이면 충분하다. 그 앞은 '이전' 으로 뭉뚱그린다. */
  /* 🔴 날짜로 끊는 건 x 표시가 없는 칸을 위한 보조일 뿐 — 며칠까지 볼지는 서버가 준다(CFG.days, 기본 4일).
     «어제까지» 로 끊었더니 월요일에 켜면 토요일에 잡은 몫이 이름 없이 «이전» 이 됐다 (2026-09-18 홍팀장). */
  function tooOld(when) {
    var m = String(when).match(/(\d+)월\s*(\d+)일/);
    if (!m) return false;
    var n = new Date(), mm = parseInt(m[1], 10), dd = parseInt(m[2], 10);
    var d = new Date(n.getFullYear(), mm - 1, dd);
    if (d.getTime() > n.getTime() + 86400000) d = new Date(n.getFullYear() - 1, mm - 1, dd);   // 해 넘김
    var today0 = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
    return (today0 - d.getTime()) / 86400000 > (CFG.days || 4);
  }
  async function readCell(a1) {
    var t0 = Date.now();
    var got = await goCell(a1);
    if (got.indexOf(a1) < 0) return { err: 'move' };
    if (!openHist()) return { err: 'menu' };
    var out = [], prev = '';
    for (var i = 0; i < CFG.max; i++) {
      if (Date.now() - t0 > CFG.ms) break;
      /* 🔴 전날 기록은 불러오는 데 2~3초씩 걸린다 (2026-09-18 탑초이스). 2.4초만 기다리고 끊었더니
         «마덕 2→4» 에서 멈춰 그 앞 «문경태 2 추가» 를 못 읽고 «이전 2개» 가 떴다.
         최대 12초까지 기다린다. («이전» 을 다시 누르면 늦게 뜬 한 칸을 건너뛸 수 있어 누르지 않는다) */
      var s = await waitNew(prev, 12000);
      if (!s) break;
      prev = s.who + s.when + s.body;
      var p = parseBody(s.body);
      /* 🔴 판을 새로 팔 때 «x» 를 지워 빈칸으로 만든다 (2026-09-17 17~18시). 그 자리가 이번 판의 시작이라
         거기서 멈춘다 — 그 앞은 지난 판이고, 그 기록 자체는 판 세팅이지 수량을 잡은 게 아니다. */
      if (/^x$/i.test(String(p.before).trim())) break;
      var old = tooOld(s.when);
      /* x 표시가 없는 칸을 위한 보조 기준 — 어제보다 앞이면 «누가» 는 버리고 시작값만 '이전' 으로 */
      out.push({ who: old ? '이전' : s.who, when: s.when, before: p.before, after: p.after });
      if (old) break;
      var b = [].slice.call(document.querySelectorAll('[aria-label="이전 수정 항목"]')).filter(function (e) { return e.offsetParent; })[0];
      if (!b || b.getAttribute('aria-disabled') === 'true') break;   // 맨 처음 기록까지 왔다
      fire(b, ['mouseover', 'mousedown', 'mouseup', 'click']);
    }
    document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape', keyCode: 27 }));
    return { list: out };
  }
  async function sheetOf(tab) {
    var c = tabCache[tab];
    if (c && Date.now() - c.at < 300000) return c;
    var h = (await csv(ALLID, tab, 'A1:Z1'))[0] || [], fc = 0;
    for (var i = 0; i < h.length; i++) if (String(h[i]).trim() === '여우') { fc = i + 1; break; }
    var S = await csv(ALLID, tab);
    c = { at: Date.now(), col: fc, rows: S };
    tabCache[tab] = c;
    return c;
  }
  function findRow(S, wh, nm) {
    for (var i = 0; i < S.length; i++) {
      if (String(S[i][2] || '').trim() === wh && String(S[i][3] || '').trim() === nm) return i + 1;
    }
    return 0;
  }

  async function once() {
    var pend = [];
    try {
      var t = await csv(FOXID, '_여우로그', 'T1:U1');
      pend = JSON.parse((t[0] && t[0][0]) || '[]');
      if (t[0] && t[0][1]) { var c = JSON.parse(t[0][1]); for (var kk in c) CFG[kk] = c[kk]; }
    } catch (e) { return; }
    if (!pend.length) { say('대기 중 — 새로 잡히면 바로 채웁니다', '#137333'); return; }

    say('읽는 중 ' + pend.length + '건', '#1a73e8');
    var got = 0, tried = 0;
    for (var i = 0; i < pend.length && tried < CFG.batch; i++) {
      if (stopped) return;
      var k = String(pend[i].k || ''), tab = String(pend[i].tab || '');
      /* 🔁 5분 안에 읽은 칸은 건너뛴다 — 쉬지 않고 도는 대신, 합이 영영 안 맞는 칸을 계속 붙잡지 않게 */
      if (recent[k] && Date.now() - recent[k] < 300000) continue;
      recent[k] = Date.now();
      tried++;
      var p = k.split('|'), wh = p[0], nm = p.slice(1).join('|');
      if (!tab || !nm) continue;
      /* 🔴 칸 자리는 서버가 준 row·col 이 정답이다 (2026-09-22). gviz CSV 는 빈 줄을 빼고 주기 때문에
         CSV 줄 번호로 찾으면 당일/상시 사이에 빈 줄이 있는 탭(단독(유)·단독(선물)·단독(무)·부산)에서
         엉뚱한 칸(합쳐진 띠)을 읽었다 — 활 새우가 영영 «읽는 중…», 영광굴비에 남의 이름. CSV 는 서버가 못 줄 때만. */
      var row = parseInt(pend[i].row, 10) || 0, col = parseInt(pend[i].col, 10) || 0;
      if (!row || !col) {
        var sh;
        try { sh = await sheetOf(tab); } catch (e) { continue; }
        if (!sh.col) continue;
        col = sh.col;
        row = findRow(sh.rows, wh, nm);
        if (!row) { delete tabCache[tab]; try { sh = await sheetOf(tab); row = findRow(sh.rows, wh, nm); } catch (e) {} }
        if (!row) continue;
      }
      if (!(await openTab(tab))) continue;
      say('읽는 중 ' + (i + 1) + '/' + Math.min(pend.length, CFG.batch) + ' ' + nm, '#1a73e8');
      var r = await readCell(colName(col) + row);
      if (r.err || !r.list.length) continue;
      var rows = r.list.slice().reverse().map(function (x, j) {
        return { tab: tab, wh: wh, nm: nm, who: x.who, before: x.before, after: x.after, at: String(1000 + j) };
      });
      /* 🔴 한 칸 읽으면 바로 보낸다 (2026-09-18 홍팀장). 4칸 다 읽고 모아 보냈더니,
         먼저 읽은 칸도 같은 바퀴의 느린 칸(최대 90초)이 끝날 때까지 시트에 안 떴다. */
      try {
        await fetch(URL, { method: 'POST', body: JSON.stringify({ token: TOKEN, action: 'hist', rows: rows }) });
        got++;
        stamp = new Date().toTimeString().slice(0, 5) + ' ' + nm;
      } catch (e) {}
    }
    say('대기 중', '#137333');
    return tried ? 'more' : '';
  }

  /* 🔴 한 칸이라도 읽었으면 쉬지 않고 바로 대기열을 다시 본다 (2026-09-18 홍팀장: "홍어 찾는데 왜 이렇게 오래 걸려").
     바퀴 사이에 8초 쉬었는데 숨은 탭에선 그게 1분으로 늘어나 30칸이 20분 걸렸다.
     읽을 게 없을 때만 쉰다. */
  (function loop() {
    if (stopped) return;
    if (busy) { timer = setTimeout(loop, CFG.tick); return; }
    busy = true;
    once().catch(function (e) { say('오류: ' + String(e).slice(0, 40), '#c5221f'); })
          .then(function (more) {
            busy = false;
            if (stopped) return;
            if (more === 'more') Promise.resolve().then(loop); else timer = setTimeout(loop, CFG.tick);
          });
  })();

  say('감시 시작', '#137333');
})();
