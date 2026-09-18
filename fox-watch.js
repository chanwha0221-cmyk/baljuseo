/* 여우팀 실 소유자 감시 — 북마클릿이 불러가는 본문 */
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
  var TOKEN = window.FOXT || '';
  var TICK = 10000;

  if (window.__FOXWATCH) { window.__FOXWATCH.stop(); return; }
  if (location.href.indexOf(ALLID) < 0) { alert('마스터 수량시트를 열고 눌러 주세요.'); return; }
  if (![].slice.call(document.querySelectorAll('.goog-menuitem')).some(function (e) { return /수정 기록 표시/.test(e.innerText); })) {
    alert('아무 칸이나 마우스 오른쪽 클릭했다가 Esc 로 닫은 뒤, 다시 눌러 주세요.\n(페이지를 새로 열 때 한 번만 하면 됩니다)');
    return;
  }

  var bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;right:16px;top:64px;z-index:99999;background:#137333;color:#fff;padding:10px 14px;border-radius:8px;font:13px/1.5 sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.3);max-width:340px;cursor:pointer';
  bar.title = '누르면 감시를 멈춥니다';
  document.body.appendChild(bar);
  var stamp = '';
  function say(t, color) { bar.textContent = '🦊 ' + t + (stamp ? ' · ' + stamp : ''); if (color) bar.style.background = color; }

  var stopped = false, busy = false, timer = null, tabCache = {};
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
    for (var w = 0; w < 20; w++) { await sleep(400); if (cur() === name) return true; }
    return false;
  }
  async function goCell(a1) {
    var nb = q('#t-name-box');
    nb.focus(); nb.value = a1;
    nb.dispatchEvent(new Event('input', { bubbles: true }));
    ['keydown', 'keypress', 'keyup'].forEach(function (t) {
      nb.dispatchEvent(new KeyboardEvent(t, { bubbles: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 }));
    });
    await sleep(600);
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
  async function waitNew(prev, tries) {
    for (var w = 0; w < (tries || 8); w++) {
      await sleep(300);
      var s = snap();
      if (s && (s.who + s.when + s.body) !== prev) return s;
    }
    return null;
  }
  /* 🔴 오래된 기록까지 거슬러 올라가지 않는다 — 한 칸에서 9월 9일까지 읽고 있었다 (2026-09-18).
     지금 판은 어제 저녁에 열렸으니 «어제·오늘» 이면 충분하다. 그 앞은 '이전' 으로 뭉뚱그린다. */
  function tooOld(when) {
    var m = String(when).match(/(\d+)월\s*(\d+)일/);
    if (!m) return false;
    var n = new Date(), y = new Date(n.getTime() - 86400000);
    var mm = parseInt(m[1], 10), dd = parseInt(m[2], 10);
    if (mm === n.getMonth() + 1 && dd === n.getDate()) return false;
    if (mm === y.getMonth() + 1 && dd === y.getDate()) return false;
    return true;
  }
  async function readCell(a1) {
    var t0 = Date.now();
    var got = await goCell(a1);
    if (got.indexOf(a1) < 0) return { err: 'move' };
    if (!openHist()) return { err: 'menu' };
    var out = [], prev = '';
    for (var i = 0; i < 20; i++) {
      if (Date.now() - t0 > 40000) break;
      var s = await waitNew(prev, i === 0 ? 12 : 8);
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
      if (!b) break;
      fire(b, ['mouseover', 'mousedown', 'mouseup', 'click']);
    }
    document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape', keyCode: 27 }));
    await sleep(200);
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
      var t = await csv(FOXID, '_여우로그', 'T1:T1');
      pend = JSON.parse((t[0] && t[0][0]) || '[]');
    } catch (e) { return; }
    if (!pend.length) { say('대기 중 — 새로 잡히면 바로 채웁니다', '#137333'); return; }

    say('읽는 중 ' + pend.length + '건', '#1a73e8');
    var rows = [], got = 0;
    for (var i = 0; i < pend.length && i < 8; i++) {
      if (stopped) return;
      var k = String(pend[i].k || ''), tab = String(pend[i].tab || '');
      var p = k.split('|'), wh = p[0], nm = p.slice(1).join('|');
      if (!tab || !nm) continue;
      var sh;
      try { sh = await sheetOf(tab); } catch (e) { continue; }
      if (!sh.col) continue;
      var row = findRow(sh.rows, wh, nm);
      if (!row) { delete tabCache[tab]; try { sh = await sheetOf(tab); row = findRow(sh.rows, wh, nm); } catch (e) {} }
      if (!row) continue;
      if (!(await openTab(tab))) continue;
      say('읽는 중 ' + (i + 1) + '/' + Math.min(pend.length, 8) + ' ' + nm, '#1a73e8');
      var r = await readCell(colName(sh.col) + row);
      if (r.err || !r.list.length) continue;
      var list = r.list.slice().reverse();
      (function (tb, w2, n2) {
        list.forEach(function (x, j) {
          rows.push({ tab: tb, wh: w2, nm: n2, who: x.who, before: x.before, after: x.after, at: String(1000 + j) });
        });
      })(tab, wh, nm);
      got++;
    }
    if (rows.length) {
      try {
        await fetch(URL, { method: 'POST', body: JSON.stringify({ token: TOKEN, action: 'hist', rows: rows }) });
        stamp = new Date().toTimeString().slice(0, 5) + ' ' + got + '건';
      } catch (e) {}
    }
    say('대기 중', '#137333');
  }

  (function loop() {
    if (stopped) return;
    if (busy) { timer = setTimeout(loop, TICK); return; }
    busy = true;
    once().catch(function (e) { say('오류: ' + String(e).slice(0, 40), '#c5221f'); })
          .then(function () { busy = false; if (!stopped) timer = setTimeout(loop, TICK); });
  })();

  say('감시 시작', '#137333');
})();
