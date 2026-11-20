/* 💰 입금확인 다리 — 외부유통 보드 창(ipgbridge)에 확장이 꽂는다 (2026-11-17 홍팀장 «리모컨 없앤다»).
   입금확인.html(github.io)이 postMessage 로 부탁하면, 이 창의 로그인(보드 api 토큰 + 그룹웨어 쿠키)으로 대신 읽고 칠한다.
     ping   → pong (준비됐으면)
     list   → 미수금 있는 거래처 목록
     vendor → 그 거래처 미정산 날짜(정산달력) + 그 기간 입금 내역(gw2/dep.php, 입금자 전부 — 이름 고르기는 도구가)
     apply  → 고른 날짜를 정산달력에 «입금»(adj_chk 2)으로 칠함, 입금일자(dep_dt) 같이
     dup    → (신규업체메일링) 상점 목록을 거래처 중복검색에 돌려 걸린 이유 — 읽기만
     extracands → (신규업체메일링) 상점 하나로 걸린 거래처 후보 + 이미 있는 추가 채널명 — 읽기만
     extraadd   → 고른 거래처에 추가 채널명 한 개 등록(보드 [+ 추가]와 같은 POST /clients/{id}/extra-names). 사람이 확인창 눌렀을 때만 온다
   🔴 받는 곳은 도구 주소(TOOL) 하나뿐, 할 수 있는 일은 위 일곱뿐. 칠하기는 도구에서 사람이 [진행] 눌렀을 때만 온다. */
(function () {
  if (window.__ipgb) return; window.__ipgb = 1;
  var TOOL = 'https://chanwha0221-cmyk.github.io';
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var ymd = function (d) { return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); };
  var dash = function (s) { return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8); };
  var toD = function (s) { return new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)); };
  var ok = false;
  /* 창 이름을 지킨다 — 보드가 이름을 지우면 입금확인이 이 창을 못 찾고 새 창을 또 띄운다(26-11-17 «창이 하나씩 더 생긴다») */
  setInterval(function () { if (window.name !== 'ipgbridge') window.name = 'ipgbridge'; }, 1000);

  // 작은 표시 — 이 창이 다리라는 걸 사람이 알게
  function badge(t, bad) {
    var b = document.getElementById('ipgb-badge');
    if (!b) { b = document.createElement('div'); b.id = 'ipgb-badge'; b.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:99999;padding:8px 12px;border-radius:8px;font:13px "Malgun Gothic",sans-serif;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.25)'; document.body.appendChild(b); }
    b.style.background = bad ? '#c0262d' : '#1b4fb3'; b.textContent = '🔌 보드 연결 창(입금확인·중복검색) — ' + t;
  }

  (async function wait() {
    for (var i = 0; i < 600; i++) {
      try { if (typeof api === 'function') { await api('/auth/me'); ok = true; badge('연결됨 (닫지 마세요)'); return; } } catch (e) { if (i === 3) badge('보드에 로그인해 주세요', true); }
      await sleep(1000);
    }
  })();

  async function depList(st, ed) {
    var r = await fetch('/gw2/dep.php?a=list', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-GW2': '1' },
      body: JSON.stringify({ st: st + ' 00:00', ed: ed + ' 23:59', acct: '', name: '', ty: '0' }) });
    var j = await r.json();
    if (!j.ok) throw new Error('입금 내역을 못 읽었습니다 — ' + (j.why || '그룹웨어 로그인 확인'));
    return (j.rows || []).filter(function (x) { return x.io === 'IN' && String(x.hid) !== '1'; })
      .map(function (x) { return { id: x.id, dt: x.dt, name: x.name, amt: +x.amount, memo: x.memo || '' }; });
  }

  var CMD = {
    list: async function () {
      var j = await api('/clients?size=0&sort=month_sales&direction=DESC');
      return (j.items || []).filter(function (c) { return +c.unpaid_amount > 0; }).map(function (c) {
        return { id: c.id, name: c.client_name, ch: c.channel_name, biz: c.business_name, alias: c.channel_alias, cyc: c.settlement_cycle,
                 last: c.last_payment_date, unpaid: +c.unpaid_amount, st: c.receivable_status, contact: c.contact_name, dist: c.external_distributor_name };
      }).sort(function (a, b) { return b.unpaid - a.unpaid; });
    },
    vendor: async function (q) {
      var id = +q.id, now = new Date(), y = now.getFullYear(), m = now.getMonth() + 1;
      var days = [], done = [], hist = [], top = +q.top || null, acc = 0;   // 목표 = 거래처 목록 미수금(달력 unpaid_amt 는 그 달 것)
      /* 지난 정산(이미 칠한 날)도 첫 미정산 45일 전까지 가져온다 (홍팀장 26-11-17 «대조 시작은 입금액·정산액이 딱 맞는 날짜 기준»).
         도구가 그 안에서 «입금 = 정산 구간» 딱 맞은 마지막 지점을 찾아 거기 다음부터 대조한다. */
      var HIST = 45;
      for (var k = 0; k < 14; k++) {
        var c = await api('/clients/' + id + '/settlement-calendar?year=' + y + '&month=' + m);
        if (top === null) top = +c.unpaid_amt || 0;
        (c.days || []).forEach(function (d) {
          if (+d.unpaid_amt) { days.push({ date: d.date, amt: +d.unpaid_amt, tot: +d.total_amt }); acc += +d.unpaid_amt; }
          else if (+d.total_amt) { done.push(d.date); hist.push({ date: d.date, amt: +d.total_amt }); }
        });
        var minU = days.length ? days.reduce(function (a, d) { return d.date < a ? d.date : a; }, '99999999') : ymd(now);
        var edge = toD(minU); edge.setDate(edge.getDate() - HIST);
        if (acc >= top && new Date(y, m - 1, 1) <= edge) break;
        m--; if (!m) { m = 12; y--; }
      }
      days.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      var first = days.length ? days[0].date : null;
      var lastDone = first ? done.filter(function (d) { return d < first; }).sort().pop() || null : null;
      var from = toD(first || ymd(now)); from.setDate(from.getDate() - HIST);
      hist = hist.filter(function (d) { return d.date >= ymd(from); }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      var deps = [], s = new Date(from);
      while (s <= now) {
        var e = new Date(s); e.setDate(e.getDate() + 60); if (e > now) e = new Date(now);
        deps = deps.concat(await depList(dash(ymd(s)), dash(ymd(e))));
        s = new Date(e); s.setDate(s.getDate() + 1);
      }
      /* 환불 = 그룹웨어 «입금요청»(gw2/payreq.php) 중 지급 끝난 것 (홍팀장 26-11-17 «환불내역 여기 다 있어»). 업체 고르기는 도구가(이름 맞추기) */
      var refs = [];
      try {
        var pr = await fetch('/gw2/payreq.php?a=list&co=board_xjVk44', { method: 'POST', credentials: 'same-origin', headers: { 'X-GW2': '1', 'Content-Type': 'application/json' },
          body: JSON.stringify({ st: ymd(from), ed: ymd(now), q: '', un: 0, all: 1 }) }).then(function (r) { return r.json(); });
        if (pr.ok) refs = (pr.rows || []).filter(function (x) { return x.paid && +x.amt > 0; }).map(function (x) {
          return { id: x.id, dt: x.pd || x.d, req: x.d, co: x.co || '', hd: x.hd || '', tg: x.tg || '', rs: x.rs || '', amt: +x.amt };
        });
      } catch (e) {}
      return { id: id, top: top, sum: acc, days: days, hist: hist, lastDone: lastDone, depFrom: ymd(from), deps: deps, refs: refs };
    },
    /* 미정산 기간 (홍팀장 26-11-17 «미정산 기간이랑 정렬 기능도») — 거래처 목록엔 첫 미정산일이 없어서 달력을 거꾸로 훑는다.
       이번 달부터 한 달씩, 모은 미정산 합이 미수금에 닿으면 멈춘다(최대 14달). */
    span: async function (q) {
      // 🔴 달력의 unpaid_amt 는 «그 달» 미정산이다 — 목표 합은 거래처 목록의 미수금(q.top)으로 (11월에 미정산 없는 메이크머닛이 빈칸 나온 사고)
      var id = +q.id, now = new Date(), y = now.getFullYear(), m = now.getMonth() + 1, top = +q.top || null, acc = 0, ds = [];
      for (var k = 0; k < 14; k++) {
        var c = await api('/clients/' + id + '/settlement-calendar?year=' + y + '&month=' + m);
        if (top === null) top = +c.unpaid_amt || 0;
        (c.days || []).forEach(function (d) { if (+d.unpaid_amt) { ds.push(d.date); acc += +d.unpaid_amt; } });
        if (acc >= top || !top) break;
        m--; if (!m) { m = 12; y--; }
      }
      ds.sort();
      return { id: id, first: ds[0] || null, last: ds[ds.length - 1] || null, n: ds.length, full: acc >= top };
    },
    /* 🔍 중복업체 (2026-11-19 신규업체메일링 몰 탭) — 상점마다 보드 «거래처 중복검색»(/clients/search)을 사업자번호·전화·메일·상호로 돌린다.
       검색 하나가 전 채널 거래처(items)·그룹 자회사(affiliates)·문제 업체(problem_vendors)를 같이 준다.
       사업자번호·전화·메일로 걸린 건 그대로 중복, 상호로 걸린 건 이름이 똑같을 때만(«신선식품» 같은 흔한 글자가 남의 이름에 섞여 걸리지 않게). 읽기만 한다. */
    dup: async function (q) {
      var nk = function (s) { return String(s || '').replace(/주식회사|유한회사|농업회사법인|영농조합법인|\(주\)|㈜|\s+/g, '').toLowerCase(); };
      var rows = (q.rows || []).slice(0, 400), out = [], i = 0;
      async function one(r) {
        var why = [], seen = {};
        var add = function (t) { if (!seen[t]) { seen[t] = 1; why.push(t); } };
        var keys = [];
        if (r.biz) keys.push(['사업자번호', r.biz]);
        if (r.tel) keys.push(['전화', r.tel]);
        if (r.mail) keys.push(['메일', r.mail]);
        if (nk(r.name).length >= 2) keys.push(['상호', r.name.replace(/주식회사|유한회사|농업회사법인|\(주\)|㈜/g, '').trim()]);
        for (var k = 0; k < keys.length; k++) {
          var by = keys[k][0], d;
          try { d = await api('/clients/search?q=' + encodeURIComponent(keys[k][1])); } catch (e) { continue; }
          var same = function (names) { return by !== '상호' || names.some(function (n) { return n && nk(n) === nk(r.name); }); };
          (d.items || []).forEach(function (c) {
            if (same([c.client_name, c.channel_name, c.business_name, c.channel_alias])) add('거래처 «' + (c.client_name || c.channel_name) + '»' + (c.external_distributor_name ? '(' + c.external_distributor_name + ')' : '') + ' ' + by + ' 일치');
          });
          (d.affiliates || []).forEach(function (a) { if (same([a.company_name])) add('🚫 자회사 «' + a.company_name + '» ' + by + ' 일치'); });
          (d.problem_vendors || []).forEach(function (p) { if (same([p.company_name, p.channel_name])) add('⚠ 문제업체 «' + p.company_name + '»' + (p.problem ? ' ' + p.problem : '')); });
        }
        return { name: r.name, why: why };
      }
      await Promise.all([0, 1, 2].map(async function () { while (i < rows.length) { var r = rows[i++]; out.push(await one(r)); badge('중복검색 ' + out.length + '/' + rows.length); } }));
      return out;
    },
    /* 🏷 추가 채널명 (2026-11-20 홍팀장) — 몰 상호가 거래처 이름과 달라 중복으로 걸린 곳을 그 거래처의 «추가 채널명»으로 넣는다.
       후보 = 사업자번호·전화·메일로 걸린 거래처(상호는 이름이 같을 때만 — dup 과 같은 규칙). 자회사·문제업체는 대상 아님. */
    extracands: async function (q) {
      var nk = function (s) { return String(s || '').replace(/주식회사|유한회사|농업회사법인|영농조합법인|\(주\)|㈜|\s+/g, '').toLowerCase(); };
      var r = q.row || {}, keys = [], map = {};
      if (r.biz) keys.push(['사업자번호', r.biz]);
      if (r.tel) keys.push(['전화', r.tel]);
      if (r.mail) keys.push(['메일', r.mail]);
      if (nk(r.name).length >= 2) keys.push(['상호', r.name]);
      for (var k = 0; k < keys.length; k++) {
        var by = keys[k][0], d;
        try { d = await api('/clients/search?q=' + encodeURIComponent(keys[k][1])); } catch (e) { continue; }
        (d.items || []).forEach(function (c) {
          var names = [c.client_name, c.channel_name, c.business_name, c.channel_alias];
          if (by === '상호' && !names.some(function (n) { return n && nk(n) === nk(r.name); })) return;
          var ex = (c.extra_names || []).map(function (e) { return e.name; });
          var m = map[c.id] || (map[c.id] = { id: c.id, client: c.client_name || c.channel_name, dist: c.external_distributor_name || '', by: [], extras: ex,
            same: names.concat(ex).some(function (n) { return n && nk(n) === nk(r.name); }) });
          if (m.by.indexOf(by) < 0) m.by.push(by);
        });
      }
      return Object.keys(map).map(function (k) { return map[k]; });
    },
    extraadd: async function (q) {
      var id = +q.id, name = String(q.name || '').trim();
      if (!id || !name) throw new Error('거래처·이름이 비었습니다');
      await api('/clients/' + id + '/extra-names', { method: 'POST', body: JSON.stringify({ name: name }) });
      return { ok: 1 };
    },
    apply: async function (q) {
      var id = +q.id, out = [];
      for (var i = 0; i < (q.items || []).length; i++) {
        var it = q.items[i];
        if (!/^\d{8}$/.test(it.date) || !/^\d{8}$/.test(it.dep_dt)) { out.push({ date: it.date, err: '날짜 형식' }); continue; }
        try {
          var r = await api('/clients/' + id + '/settlement-calendar/day-status', { method: 'PATCH', body: JSON.stringify({ date: it.date, adj_chk: '2', dep_dt: it.dep_dt }) });
          out.push({ date: it.date, updated: r.updated || 0 });
        } catch (e) { out.push({ date: it.date, err: e.message || String(e) }); }
      }
      return out;
    }
  };

  window.addEventListener('message', async function (ev) {
    if (ev.origin !== TOOL || !ev.data || ev.data.ipgb !== 1) return;
    var d = ev.data, reply = function (m) { try { ev.source.postMessage(Object.assign({ ipgb: 2, rid: d.rid }, m), TOOL); } catch (e) {} };
    if (d.cmd === 'ping') { reply({ pong: ok }); return; }
    if (!ok) { reply({ err: '보드에 로그인해 주세요 (연결 창)' }); return; }
    if (!CMD[d.cmd]) { reply({ err: '모르는 부탁' }); return; }
    badge('작업 중…');
    try { reply({ data: await CMD[d.cmd](d) }); badge('연결됨 (닫지 마세요)'); }
    catch (e) { reply({ err: e.message || String(e) }); badge('오류 — ' + (e.message || e), true); }
  });
})();
