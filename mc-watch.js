/* ════════════════════════════════════════════════════════════════
   👀 masterc 변동 감시 (mc-watch.js) — 홍팀장 2026-10-15
   ────────────────────────────────────────────────────────────────
   「변동사항에서 인상·인하 뜨면 인지해서 카탈로그에 계속 업데이트 / 마진 낮은 상품 없던 거 나오면 확인창」
   서버는 masterc 를 못 읽는다(로그인 세션 필요, 읽기 키는 대표님 승인 대기) → 로그인된 크롬 탭 하나에서 돈다.
   PC·크롬이 꺼지면 같이 멈춘다.

   여는 법: 카탈로그 마스터 [👀 변동 감시] → masterc.kr/board_eJGl96#mcwatch 창 →
           그 게시판에 심어 둔 dm-bridge.js 가 #mcwatch 를 보고 이 파일을 불러온다. 창은 열어 둔다.

   하는 일 (월~토 09:00~18:00, 서울 시간)
     · 5분마다 변동사항(machan_chg)·특별단가·당일 등록가를 읽어 지문을 만든다.
     · 지문이 바뀌었거나 마지막으로 보낸 지 30분이 지났으면 → 상시(mcpush+mcspc) + 당일(mcday) 를 조용히 보낸다.
       상시는 mc-list.js, 당일은 mc-day.js ② 와 같은 모양이다. 🔴 당일 «자동 등록»(daily_save)은 하지 않는다 — 읽어서 보내기만.
     · 보낼 때마다 마진율 8% 이하 상품을 세어, 직전에 없던 것이 나오면 알림 + 확인창([확인] = 카탈로그 저마진 화면).
       마진율 = (판매가 − 원가) ÷ (판매가 + 택배비) — 카탈로그 저마진·월 시트 Q열과 같은 식. 원가는 이 창 밖으로 안 나간다.
   🔴 masterc 에 아무것도 쓰지 않는다. 우리 서버로 보내는 저장은 30% 넘게 줄면 서버가 거절한다.
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__mcWatch) return; window.__mcWatch = 1;
  if (location.hostname !== 'masterc.kr') return;
  var KEY = 'mc-zq3px7mypqwbfs3cfkjg';
  var EDGE = 'https://yzttmdrlujgstfjsbser.supabase.co/functions/v1/api';
  var CATALOG = 'https://chanwha0221-cmyk.github.io/baljuseo/catalog.html#lowm';
  var CHECK_MS = 5 * 60 * 1000, FULL_MS = 30 * 60 * 1000, LOWM_MAX = 8;
  var SEEN_KEY = 'mcw_lowm_seen_v1';

  /* ── 화면: 이 창이 무엇을 하는지 크게 보여준다 ── */
  var box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#f8fafc;font:14px/1.7 system-ui,sans-serif;color:#1f2937;padding:28px;overflow:auto';
  box.innerHTML = '<div style="max-width:720px;margin:0 auto">'
    + '<div style="font-size:22px;font-weight:800">👀 masterc 변동 감시 중</div>'
    + '<div style="color:#6b7280;margin:4px 0 14px">이 창은 <b>열어 두세요</b>(최소화 OK). 닫으면 감시가 멈춥니다. 다시 켤 땐 즐겨찾기(masterc.kr/board_eJGl96#mcwatch)나 카탈로그 [👀 변동 감시].</div>'
    + '<div id="mcw_st" style="background:#fff;border:2px solid #15803d;border-radius:12px;padding:14px 16px;white-space:pre-wrap">준비 중…</div>'
    + '<div style="margin-top:14px;font-weight:700">기록</div>'
    + '<div id="mcw_log" style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:10px 14px;white-space:pre-wrap;font-size:12.5px;max-height:50vh;overflow:auto"></div>'
    + '</div>';
  (document.body || document.documentElement).appendChild(box);
  var stEl = box.querySelector('#mcw_st'), logEl = box.querySelector('#mcw_log');
  function hm(d) { return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }).format(d || new Date()); }
  function log(m) { logEl.textContent = '[' + hm() + '] ' + m + '\n' + logEl.textContent.slice(0, 6000); }
  var S = { lastCheck: 0, lastPush: 0, sig: '', pushes: 0, lastMsg: '', err: '' };
  function paint() {
    stEl.style.borderColor = S.err ? '#b91c1c' : '#15803d';
    stEl.textContent = (S.err ? '⚠️ ' + S.err + '\n\n' : '')
      + '마지막 확인: ' + (S.lastCheck ? hm(new Date(S.lastCheck)) : '아직') + '\n'
      + '마지막 카탈로그 반영: ' + (S.lastPush ? hm(new Date(S.lastPush)) : '아직') + '  (오늘 ' + S.pushes + '번)\n'
      + (S.lastMsg ? '\n' + S.lastMsg : '');
    document.title = (S.err ? '⚠️ ' : '👀 ') + '변동 감시' + (S.lastPush ? ' · ' + hm(new Date(S.lastPush)) + ' 반영' : '');
  }

  function get(mid, a, extra) {
    return fetch('/xd/api.php?mid=' + mid + '&a=' + a + (extra || ''), { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.json(); });
  }
  function edge(body) {
    return fetch(EDGE, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); });
  }
  function needLogin(j) { return j && j.ok === false && j.login === false; }
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return String(h) + ':' + s.length; }
  function shipNum(s) { s = String(s == null ? '' : s); var m = s.replace(/,/g, '').match(/\d+/); return m ? +m[0] : 0; }
  function inHours() {
    var p = {}; new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
    var t = (+p.hour % 24) * 60 + (+p.minute);
    return p.weekday !== 'Sun' && t >= 9 * 60 && t < 18 * 60;
  }
  function notify(title, body) {
    try { if (window.Notification && Notification.permission === 'granted') new Notification(title, { body: body }); } catch (e) {}
  }

  /* ── 지문: 변동사항 + 특별단가 + 당일 등록가. 하나라도 바뀌면 보낸다 ── */
  async function signature() {
    var G = await get('machan_chg', 'changes', '&days=2');
    if (needLogin(G)) throw new Error('masterc 로그인이 풀렸습니다 — 이 창에서 다시 로그인하면 이어서 돕니다');
    var Sp = await get('machan_admin', 'special_list');
    var Q = await get('machan_admin', 'daily_cand');
    var a = (G.rows || []).map(function (r) { return [r.id, r.k, r.p, r.stock].join('|'); }).join(';');
    var b = (Sp.rows || []).map(function (r) { return [r.id, r.price, r.active, r.upd_dt].join('|'); }).join(';');
    var c = (Q.cands || []).filter(function (r) { return r.k === 'day' && r.reg; }).map(function (r) { return [r.n, r.reg.price, r.reg.on].join('|'); }).join(';');
    return { sig: hash(a + '#' + b + '#' + c), chgN: (G.rows || []).length };
  }

  /* ── 보내기: 상시(mc-list.js 와 같은 모양) + 당일(mc-day.js ② 와 같은 모양, 등록은 안 함) ── */
  async function push() {
    var L = await get('machan_list', 'list');
    if (needLogin(L) || !L.ok) throw new Error('상품리스트를 못 읽었습니다(로그인 확인)');
    var C = await get('machan_admin', 'cost');
    var items = (L.items || []).map(function (p) {
      return { n: p.n, nk: p.nk, srl: p.srl, img: p.img, price: p.price, wh: p.wh, grp: p.grp, ship: p.ship, ship_n: p.ship_n,
               tax: p.tax, courier: p.courier, cut: p.cut, exp: p.exp, stock: p.stock, bund: p.bund, k: p.k };
    });
    var costs = (C && C.ok ? (C.rows || []) : []).map(function (r) {
      return { n: r.n, sell: r.sell, cost: r.cost, base: r.base, margin: r.margin, how: r.how, remain: r.remain };
    });
    var G = null; try { G = await get('machan_chg', 'changes', '&days=14'); } catch (e) {}
    var chg = (G && G.ok ? (G.rows || []) : []).filter(function (r) { return r.mine; }).map(function (r) {
      return { ap: r.ap, d: r.d, raw: r.raw, k: r.k, sale: r.sale, wh: r.wh, n: r.n, p: r.p, p0: r.p0, cou: r.cou, ship: r.ship,
               tax: r.tax, spec: r.spec, memo: r.memo, stock: r.stock };
    });
    var j = await edge({ action: 'mcpush', key: KEY, items: items, costs: costs, chg: chg });
    if (!j || !j.ok) throw new Error('상시 보내기 거절: ' + ((j && j.error) || '알 수 없음'));

    var spcN = -1;
    try {
      var Sp = await get('machan_admin', 'special_list');
      if (Sp && Sp.ok) {
        var spc = (Sp.rows || []).filter(function (r) { return +r.member_srl === 0 && r.active === 'Y' && +r.price > 0; })
          .map(function (r) { return { n: r.item, wh: r.wh, price: +r.price }; });
        var sj = await edge({ action: 'mcspc', key: KEY, rows: spc });
        if (sj && sj.ok) spcN = spc.length;
      }
    } catch (e) {}

    var dayTxt = '당일 못 보냄';
    try {
      var Q = await get('machan_admin', 'daily_cand');
      if (Q && Q.ok) {
        var im = {};
        [].concat(L.items || [], L.today || []).forEach(function (p) {
          im[String(p.n).replace(/\s+/g, '').toLowerCase()] = { img: p.img, srl: p.srl, ship_n: p.ship_n, courier: p.courier };
        });
        var ditems = (Q.cands || []).filter(function (r) { return r.k === 'day'; }).map(function (r) {
          var m = im[String(r.n).replace(/\s+/g, '').toLowerCase()] || {};
          return { n: r.n, wh: r.wh, qid: r.qid, sell: r.sell, sug: r.sug, base: r.base, cost: r.cost, ship: r.ship, ship_n: m.ship_n,
                   tax: r.tax, courier: r.courier || r.cou || m.courier || '', cut: r.cut, exp: r.exp, img: m.img, srl: m.srl,
                   total: r.total, sold: r.sold, remain: r.remain, reg: r.reg };
        });
        var dj = await edge({ action: 'mcday', key: KEY, day: Q.day, items: ditems });
        dayTxt = dj && dj.ok ? ('당일 ' + dj.count + '개(파는 것 ' + dj.open + ')') : ('당일 거절: ' + ((dj && dj.error) || ''));
      }
    } catch (e) { dayTxt = '당일 못 보냄: ' + (e && e.message ? e.message : e); }

    lowmCheck(C, L);
    return '상품 ' + j.count + '개 · 변동 ' + (j.chg || 0) + '건 · ' + dayTxt + (spcN >= 0 ? ' · 특별단가 ' + spcN + '개' : ' · ⚠️ 특별단가 못 보냄');
  }

  /* ── 💸 새 저마진 상품 — 업체 화면에 떠 있는 것(상품리스트 items·today)만, 직전에 없던 것만 알린다 ── */
  function lowmCheck(C, L) {
    if (!C || !C.ok) return;
    var on = {};
    [].concat(L.items || [], L.today || []).forEach(function (p) { on[String(p.n).replace(/\s+/g, '').toLowerCase()] = 1; });
    var now = (C.rows || []).filter(function (r) {
      var sell = +r.sell || 0, cost = +r.cost || 0;
      if (!(sell > 0 && cost > 0)) return false;
      if (!on[String(r.n).replace(/\s+/g, '').toLowerCase()]) return false;
      return (sell - cost) / (sell + shipNum(r.ship)) * 100 <= LOWM_MAX;
    }).map(function (r) {
      var sell = +r.sell, cost = +r.cost;
      return { n: r.n, wh: r.wh, sell: sell, cost: cost, rate: Math.round((sell - cost) / (sell + shipNum(r.ship)) * 1000) / 10 };
    });
    var prev = null; try { prev = JSON.parse(localStorage.getItem(SEEN_KEY) || 'null'); } catch (e) {}
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(now.map(function (x) { return x.n; }))); } catch (e) {}
    if (!prev) { log('💸 저마진 기준 잡음 — 지금 ' + now.length + '개 (다음부터 새로 생기는 것만 알립니다)'); return; }
    var had = {}; prev.forEach(function (n) { had[n] = 1; });
    var fresh = now.filter(function (x) { return !had[x.n]; });
    if (!fresh.length) return;
    var won = function (n) { return Math.round(n).toLocaleString(); };
    var lines = fresh.slice(0, 15).map(function (x) { return '· ' + x.n + ' (' + x.wh + ') 판매가 ' + won(x.sell) + ' / 원가 ' + won(x.cost) + ' → ' + x.rate + '%'; }).join('\n')
      + (fresh.length > 15 ? '\n… 외 ' + (fresh.length - 15) + '개' : '');
    log('💸 새 저마진 ' + fresh.length + '개\n' + lines);
    notify('💸 새 저마진 상품 ' + fresh.length + '개', fresh.slice(0, 5).map(function (x) { return x.n + ' ' + x.rate + '%'; }).join('\n'));
    setTimeout(function () {
      if (confirm('💸 마진율 ' + LOWM_MAX + '% 이하 상품이 새로 생겼습니다 — ' + fresh.length + '개\n\n' + lines
        + '\n\n[확인] 카탈로그 저마진 화면 열기   [취소] 닫기')) window.open(CATALOG, 'catalog_lowm');
    }, 50);
  }

  async function tick(force) {
    // ⏰ 시간 제한 없음 (2026-10-15 홍팀장 「시간은 상관없을 거 같은데, 열려 있으면 계속 감시해」) — inHours 는 안 쓴다
    try {
      var s = await signature();
      S.lastCheck = Date.now(); S.err = '';
      var changed = s.sig !== S.sig, stale = Date.now() - S.lastPush >= FULL_MS;
      if (changed || stale || force) {
        var why = force ? '처음 시작' : (changed && S.sig ? '변동 감지' : '30분 정기');
        var r = await push();
        S.sig = s.sig; S.lastPush = Date.now(); S.pushes++;
        S.lastMsg = '✅ ' + why + ' → 카탈로그 반영\n' + r;
        log(why + ' → ' + r);
      } else {
        S.lastMsg = '변동 없음 (변동사항 최근 2일 ' + s.chgN + '건)';
      }
    } catch (e) {
      var m = (e && e.message) ? e.message : String(e);
      if (S.err !== m) { log('⚠️ ' + m); notify('⚠️ masterc 변동 감시', m); }
      S.err = m;
    }
    paint();
  }

  try { if (window.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch (e) {}
  paint();
  tick(true);
  setInterval(function () { tick(false); }, CHECK_MS);
})();
