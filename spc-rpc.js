/* ════════════════════════════════════════════════════════════════
   🏷 특별단가 연결 창 (spc-rpc.js) — 홍팀장 2026-11-18
   「카탈로그에 특별단가 설정하는 건 다 가지고 오자 — 마진 전체상품 안쪽에 특별단가 걸고 리스트 보는 것까지」
   ────────────────────────────────────────────────────────────────
   카탈로그(spc.js)가 masterc 게시판을 #spcrpc 로 작은 창에 연다 → dm-bridge.js 가 이 파일을 불러온다.
   이 창은 열어 둔 채로 카탈로그의 부탁(postMessage)을 받아 masterc #special 과 똑같은 요청을 대신 보낸다.
   (masterc API 는 로그인 세션이 있어야 하고 다른 사이트에서 못 부른다 — 그래서 이 창 안에서 돈다)

   받는 일(이것만): special_list · vendors · find (읽기) / special_save · special_del (쓰기) / day_price (당일 등록가)
   쓰기 뒤엔 특별단가(전체·지금 적용 중)를 카탈로그(Edge mcspc)로 다시 보낸다 — spc-save.js 와 같은 일.
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__spcRpc) return; window.__spcRpc = 1;
  if (location.hostname !== 'masterc.kr') return;
  var TARGET = 'https://chanwha0221-cmyk.github.io';
  var KEY = 'mc-zq3px7mypqwbfs3cfkjg';
  var EDGE = 'https://yzttmdrlujgstfjsbser.supabase.co/functions/v1/api';
  var READ = { special_list: 1, vendors: 1, find: 1 };
  var WRITE = { special_save: 1, special_del: 1 };

  var box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:2147483647;background:#15803d;color:#fff;'
    + 'font:700 14px/1.6 system-ui,sans-serif;padding:12px 14px;white-space:pre-wrap';
  (document.body || document.documentElement).appendChild(box);
  var nDone = 0;
  function say(m, bad) { box.style.background = bad ? '#b91c1c' : '#15803d'; box.textContent = m; }
  function idle() { say('🏷 카탈로그 특별단가 — masterc 에 다녀가는 창입니다. 일이 끝나면 저절로 닫힙니다.' + (nDone ? '\n처리 ' + nDone + '건' : '')); }
  idle();
  try { if (!/^spcrpc/.test(window.name)) window.name = 'spcrpc'; } catch (e) {}

  function tell(o) { try { if (window.opener) window.opener.postMessage(Object.assign({ type: 'spcrpc' }, o), TARGET); } catch (e) {} }
  function get(a, data) {
    var u = '/xd/api.php?mid=machan_admin&a=' + a;
    Object.keys(data || {}).forEach(function (k) { u += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(data[k]); });
    return fetch(u, { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.json(); });
  }
  function post(a, data) {
    var fd = new FormData(); fd.append('a', a);
    Object.keys(data || {}).forEach(function (k) { if (data[k] != null) fd.append(k, data[k]); });
    return fetch('/xd/api.php?mid=machan_admin', { method: 'POST', credentials: 'same-origin', cache: 'no-store', body: fd }).then(function (r) { return r.json(); });
  }
  function edge(body) {
    return fetch(EDGE, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); });
  }
  function loggedIn() { return get('special_list').then(function (j) { return !!(j && j.ok); }).catch(function () { return false; }); }
  var nk = function (s) { return String(s || '').replace(/\s+/g, '').toLowerCase(); };

  /* 특별단가(전체 업체 · 켜짐 · 지금 적용 중)를 카탈로그로 — 기간이 지났거나(past) 아직 안 온(soon) 것은 빼고 보낸다 */
  async function pushSpc() {
    var S = await get('special_list');
    if (!S || !S.ok) return -1;
    var spc = (S.rows || []).filter(function (r) { return +r.member_srl === 0 && r.active === 'Y' && +r.price > 0 && r.per !== 'past' && r.per !== 'soon'; })
      .map(function (r) { return { n: r.item, wh: r.wh, price: +r.price }; });
    var j = await edge({ action: 'mcspc', key: KEY, rows: spc });
    return j && j.ok ? spc.length : -1;
  }

  /* 🐟 당일 등록가를 같은 값으로 (spc-save.js 와 같은 요청 — daily_save, 기간 0 = 지금 기간 그대로) + 당일을 카탈로그로 다시 보냄 */
  async function dayPrice(n, price) {
    var Q = await get('daily_cand');
    var c = ((Q && Q.cands) || []).filter(function (x) { return x.k === 'day' && nk(x.n) === nk(n); })[0];
    if (!c) return { ok: false, msg: '당일 목록에 없음' };
    var y = await post('daily_save', { wh: c.wh, item: c.n, price: String(Math.round(+price)), ship_txt: c.ship || '', tax: c.tax || '',
      memo: (c.reg && c.reg.memo) || '', days: c.reg ? '0' : '1' });
    if (!y || !y.ok) return { ok: false, msg: (y && y.msg) || '거절' };
    try {
      var Q2 = await get('daily_cand');
      var L = null; try { L = await (await fetch('/xd/api.php?mid=machan_list&a=list', { credentials: 'same-origin', cache: 'no-store' })).json(); } catch (e) {}
      var im = {};
      [].concat((L && L.items) || [], (L && L.today) || []).forEach(function (p) { im[nk(p.n)] = { img: p.img, srl: p.srl, ship_n: p.ship_n, courier: p.courier }; });
      var rkm = {};
      try { var CC = await get('cost'); ((CC && CC.rows) || []).forEach(function (x) { if (x.k === 'day' && +x.rk_supply > 0) rkm[nk(x.n)] = +x.rk_supply; }); } catch (e) {}
      var items = ((Q2 && Q2.cands) || []).filter(function (r) { return r.k === 'day'; }).map(function (r) {
        var m = im[nk(r.n)] || {};
        var rk = !r.reg ? rkm[nk(r.n)] : 0;
        if (rk) r = Object.assign({}, r, { sell: rk, sug: rk });
        return { n: r.n, wh: r.wh, qid: r.qid, sell: r.sell, sug: r.sug, base: r.base, cost: r.cost, ship: r.ship, ship_n: m.ship_n,
                 tax: r.tax, courier: r.courier || r.cou || m.courier || '', cut: r.cut, exp: r.exp, img: m.img, srl: m.srl,
                 total: r.total, sold: r.sold, remain: r.remain, reg: r.reg };
      });
      var dj = (Q2 && Q2.ok) ? await edge({ action: 'mcday', key: KEY, day: Q2.day, items: items }) : null;
      return { ok: true, pushed: !!(dj && dj.ok) };
    } catch (e) { return { ok: true, pushed: false }; }
  }

  async function handle(m) {
    var a = m.a, d = m.data || {};
    if (a === 'day_price') return await dayPrice(d.n, d.price);
    if (a === 'push_spc') { var n = await pushSpc(); return { ok: n >= 0, spc: n }; }
    if (READ[a]) return await get(a, d);
    if (!WRITE[a]) return { ok: false, msg: '안 받는 요청: ' + a };
    // 여러 개 지울 땐 마지막 한 번만 카탈로그로 보낸다(_nopush) — masterc 로는 안 넘긴다
    var nopush = +d._nopush === 1; d = Object.assign({}, d); delete d._nopush;
    var x = await post(a, d);
    if (x && x.ok && !nopush) { try { x.spc = await pushSpc(); } catch (e) { x.spc = -1; } }
    return x;
  }

  window.addEventListener('message', function (ev) {
    if (ev.origin !== TARGET || !ev.data) return;
    var m = ev.data;
    if (m.type === 'spcrpc-ping') {
      loggedIn().then(function (ok) {
        if (!ok) say('🔐 masterc 로그인이 풀려 있습니다 — 이 창에서 로그인하세요. 로그인하면 카탈로그와 다시 이어집니다.', true); else idle();
        try { ev.source.postMessage({ type: 'spcrpc', ready: true, login: !ok }, TARGET); } catch (e) {}
      });
      return;
    }
    if (m.type !== 'spcrpc-call' || !m.id) return;
    say('🏷 처리 중… ' + m.a);
    handle(m).then(function (res) {
      if (res && res.ok === false && /로그인|권한|login/i.test(String(res.msg || ''))) res.login = true;
      if (WRITE[m.a] || m.a === 'day_price') nDone++;
      idle();
      try { ev.source.postMessage({ type: 'spcrpc', id: m.id, res: res }, TARGET); } catch (e) {}
    }).catch(function (e) {
      say('⚠️ ' + ((e && e.message) || e), true);
      try { ev.source.postMessage({ type: 'spcrpc', id: m.id, res: { ok: false, msg: (e && e.message) || String(e) } }, TARGET); } catch (x) {}
    });
  });
  /* 🧹 남지 않게 (11-18 「내가 안 닫으면 페이지 계속 생기더만」) — 보통은 카탈로그가 일 끝나고 닫는다.
     카탈로그 탭이 닫혔거나 2분 동안 부탁이 없으면 스스로 닫는다. 로그인 화면(로그인 안 됨)일 땐 안 닫는다. */
  var lastAt = Date.now(), needLogin = false;
  window.addEventListener('message', function (ev) { if (ev.origin === TARGET) lastAt = Date.now(); }, true);
  setInterval(function () {
    var gone = true; try { gone = !window.opener || window.opener.closed; } catch (e) {}
    if (needLogin) return;
    if (gone || Date.now() - lastAt > 120000) { try { window.close(); } catch (e) {} }
  }, 5000);
  // 처음 열렸거나 로그인 화면을 거쳐 돌아왔으면 카탈로그에 «준비됨»을 먼저 알린다
  loggedIn().then(function (ok) {
    needLogin = !ok;
    if (!ok) say('🔐 masterc 로그인이 풀려 있습니다 — 이 창에서 로그인하세요. 로그인하면 카탈로그와 다시 이어집니다.', true);
    tell({ ready: true, login: !ok });
  });
})();
