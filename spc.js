/* ════════════════════════════════════════════════════════════════
   🏷 특별단가 — 카탈로그 마진 화면 안에서 걸고·보고·켜고 끄고·지운다 (spc.js) — 홍팀장 2026-11-18
   「정산은 다른 쪽에서 한다 치고, 카탈로그에 특별단가 설정하는 건 다 가지고 오자 — 마진 전체상품 안쪽에 특별단가 걸고
     특별단가 리스트 볼 수 있는 것까지」
   ────────────────────────────────────────────────────────────────
   정본은 그대로 masterc #special (machan_admin special_*) 이다 — 여기는 그 화면을 카탈로그로 옮긴 창구일 뿐.
   masterc API 는 카탈로그에서 직접 못 부른다(CORS·로그인) → masterc 게시판을 작은 창(#spcrpc)으로 열어 두고
   그 창의 spc-rpc.js 에 postMessage 로 부탁한다. 창이 없으면 버튼을 누를 때 연다(팝업은 클릭 안에서만 열린다).

   · 마진 표 줄마다 [🏷] → 그 상품 특별단가 창(전체/업체별·여러 업체·기간·택배비 표기·메모, 이미 걸린 것 목록·수정)
   · 탭 «🏷 특별단가 N» (#lowmspc) = masterc 「등록된 특별단가」 표 그대로 + 켬/끔·수정·삭제·새로 걸기
   · 🐟 당일 + 전체 업체 + 기간 없음이면 오늘 당일 등록가도 같은 값으로(등록가가 특별단가보다 먼저라서 — CLAUDE.md 가격 규칙)
   🔒 마스터만.
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var MC = 'https://masterc.kr';
  var URL_ = MC + '/board_eJGl96#spcrpc';
  var W = null, ready = false, login = false, waiters = [], calls = {}, seq = 0;
  var LIST = null, VENDORS = null, LIST_AT = 0;
  var E = function (s) { return esc(String(s == null ? '' : s)); };
  var won = function (n) { return Math.round(+n || 0).toLocaleString(); };
  var today = function () { return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); };
  var nk = function (s) { return String(s || '').replace(/\s+/g, '').toLowerCase(); };

  window.addEventListener('message', function (ev) {
    if (ev.origin !== MC || !ev.data || ev.data.type !== 'spcrpc') return;
    var d = ev.data;
    if (d.ready) {
      W = ev.source; ready = true; login = !!d.login;
      status(login ? '🔐 masterc 로그인이 풀려 있습니다 — 열린 masterc 창에서 로그인하면 이어집니다.' : '');
      if (!login) { var w = waiters; waiters = []; w.forEach(function (f) { f(); }); }
      return;
    }
    var c = d.id && calls[d.id];
    if (!c) return;
    delete calls[d.id]; clearTimeout(c.t);
    if (d.res && d.res.login) { login = true; status('🔐 masterc 로그인이 풀렸습니다 — 열린 masterc 창에서 로그인한 뒤 다시 눌러 주세요.'); }
    c.ok(d.res || { ok: false, msg: '응답 없음' });
  });

  function status(m) { document.querySelectorAll('.spc-st').forEach(function (el) { el.textContent = m || ''; el.style.display = m ? '' : 'none'; }); }
  function alive() { try { return W && !W.closed; } catch (e) { return false; } }

  /* 연결 — 창이 있으면 핑만, 없으면 연다(🔴 클릭 안에서 불러야 팝업이 안 막힌다) */
  function conn(open) {
    return new Promise(function (res, rej) {
      if (alive() && ready && !login) { res(); return; }
      if (!alive()) {
        if (!open) { rej(new Error('noconn')); return; }
        ready = false;
        var w = window.open(URL_, 'spcrpc', 'width=520,height=260');
        if (!w) { rej(new Error('팝업이 막혔습니다 — 주소창 오른쪽에서 팝업 허용 후 다시 눌러 주세요')); return; }
        W = w;
        try { window.focus(); } catch (e) {}
      }
      waiters.push(res);
      status('⏳ masterc 연결 중… (작은 창이 열립니다 — 닫지 말고 두세요)');
      var n = 0;
      var tick = setInterval(function () {
        if (ready && !login) { clearInterval(tick); return; }
        if (!alive()) { clearInterval(tick); waiters = waiters.filter(function (f) { return f !== res; }); rej(new Error('masterc 창이 닫혔습니다')); return; }
        try { W.postMessage({ type: 'spcrpc-ping' }, MC); } catch (e) {}
        if (++n > 600) { clearInterval(tick); rej(new Error('masterc 창이 응답하지 않습니다 — 로그인 확인 후 다시 눌러 주세요')); }
      }, 1000);
    });
  }
  function call(a, data, open) {
    return conn(open).then(function () {
      return new Promise(function (res) {
        var id = 'c' + (++seq) + '_' + Date.now();
        calls[id] = { ok: res, t: setTimeout(function () { delete calls[id]; res({ ok: false, msg: 'masterc 창 응답이 없습니다(60초)' }); }, 60000) };
        W.postMessage({ type: 'spcrpc-call', id: id, a: a, data: data || {} }, MC);
      });
    });
  }
  function loadList(open) {
    return call('special_list', {}, open).then(function (j) {
      if (!j || !j.ok) throw new Error((j && j.msg) || '특별단가를 못 읽었습니다');
      LIST = j.rows || []; LIST_AT = Date.now(); badge(); return LIST;
    });
  }
  function loadVendors(open) {
    if (VENDORS) return Promise.resolve(VENDORS);
    return call('vendors', {}, open).then(function (j) { VENDORS = (j && j.ok && j.vendors) || []; return VENDORS; });
  }
  function badge() { var b = document.getElementById('spcN'); if (b) b.textContent = LIST ? String(LIST.length) : ''; }
  function vLabel(v) { return v.nick + (v.company && v.company !== v.nick ? ' (' + v.company + ')' : ''); }
  function afterWrite(x, extra) {
    var t = (extra || '') + (x && x.spc >= 0 ? '' : ' · ⚠️ 카탈로그로는 못 보냄(감시 창이 5분 안에 보냅니다)');
    if (x && x.rk && x.rk.wait) t += ' · ⏳ 리모컨은 반영 시간(' + (x.rk.win || '') + ') 시작 때 들어갑니다';
    try { api('catalog', { token: ME.token, fresh: 1 }).catch(function () {}); } catch (e) {}
    return t;
  }

  /* ─────────────── 목록 탭 (#lowmspc) ─────────────── */
  function perTxt(r) {
    if (!r.d_from && !r.d_to) return '<span style="color:var(--muted)">끝없이</span>';
    var chip = r.per === 'past' ? '<span style="color:#b91c1c;font-weight:700">기간 지남 · 지워 주세요</span>' : r.per === 'soon' ? '<span style="color:var(--muted);font-weight:700">예정</span>' : '<span style="color:#15803d;font-weight:700">적용 중</span>';
    return E((r.d_from || '') + ' ~ ' + (r.d_to || '')) + '<br>' + chip;
  }
  function listHtml(rows, filt) {
    var th = 'padding:7px 8px;border-bottom:2px solid var(--line);text-align:right;white-space:nowrap;font-size:12px;color:var(--muted);cursor:pointer';
    var td = 'padding:7px 8px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap;font-size:13px';
    var vis = rows.filter(function (r) { return filt === 'all' ? !+r.member_srl : filt === 'mem' ? +r.member_srl : filt === 'past' ? r.per === 'past' || !r.alive : true; });
    vis.sort(function (a, b) { return ((b.per === 'past') - (a.per === 'past')) || String(b.upd_dt || '').localeCompare(String(a.upd_dt || '')); });
    var cols = ['상품', '창고', '적용 업체', '특별단가', '공급가', '규칙가', '상태', '적용 기간', '메모', '고친 때', '켬', ''];
    if (!vis.length) return '<div class="empty">해당하는 특별단가가 없습니다.</div>';
    return '<div style="overflow-x:auto;margin-top:8px;background:var(--card);border:1px solid var(--line);border-radius:11px"><table style="border-collapse:collapse;width:100%"><thead><tr>'
      + cols.map(function (t, i) { return '<th style="' + th + (i < 3 || i > 5 ? ';text-align:left' : '') + '" onclick="lowmSort(this)" title="눌러서 정렬">' + t + '</th>'; }).join('')
      + '</tr></thead><tbody>'
      + vis.map(function (r) {
        var low = +r.base > 0 && +r.price < +r.base;
        return '<tr data-spcid="' + r.id + '" style="' + (r.per === 'past' ? 'background:#fff4f4' : r.active !== 'Y' ? 'opacity:.55' : '') + '">'
          + '<td style="' + td + ';text-align:left;white-space:normal;min-width:170px">' + E(r.item) + ' <button class="cpbtn" data-cp="' + E(r.item) + '" title="상품명 복사">📋</button></td>'
          + '<td style="' + td + ';text-align:left">' + E(r.wh) + '</td>'
          + '<td style="' + td + ';text-align:left;white-space:normal">' + (+r.member_srl ? '<span style="color:#1d4ed8;font-weight:700">' + E(r.member_nick || r.member_srl) + (r.vendor && r.vendor !== r.member_nick ? ' · ' + E(r.vendor) : '') + '</span>' : '<span style="color:var(--muted);font-weight:700">전체</span>') + '</td>'
          + '<td style="' + td + ';font-weight:800' + (low ? ';color:#b91c1c' : '') + '">' + won(r.price) + (low ? '<br><span style="font-size:11px">공급가보다 낮음</span>' : '') + '</td>'
          + '<td style="' + td + ';color:var(--muted)">' + (r.base == null ? '-' : won(r.base)) + '</td>'
          + '<td style="' + td + ';color:var(--muted)">' + (r.rule == null ? '-' : won(r.rule)) + '</td>'
          + '<td style="' + td + ';text-align:left">' + (r.alive ? '<span style="color:#15803d;font-weight:700">시트에 있음</span>' : '<span style="color:#b91c1c;font-weight:700">시트에 없음</span>') + '</td>'
          + '<td style="' + td + ';text-align:left;font-size:12px">' + perTxt(r) + '</td>'
          + '<td style="' + td + ';text-align:left;white-space:normal;font-size:12px;min-width:110px">' + E(r.memo) + '</td>'
          + '<td style="' + td + ';text-align:left;font-size:12px;color:var(--muted)">' + E(String(r.upd_dt || '').slice(5, 16)) + (r.reg_by ? '<br>' + E(String(r.reg_by).replace(/^\(주\)마스터\//, '')) : '') + '</td>'
          + '<td style="' + td + ';text-align:center"><button class="ubtn" style="font-size:11.5px;font-weight:800;' + (r.active === 'Y' ? 'background:#15803d;color:#fff;border-color:transparent' : '') + '" onclick="SPC.toggle(this,' + r.id + ')">' + (r.active === 'Y' ? '켬' : '꺼짐') + '</button></td>'
          + '<td style="' + td + '"><button class="ubtn" style="font-size:11.5px" onclick="SPC.edit(' + r.id + ')">수정</button> <button class="ubtn" style="font-size:11.5px;color:#b91c1c" onclick="SPC.del(this,' + r.id + ')">삭제</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  var FILT = 'every';
  function drawList() {
    var box = document.getElementById('spcList'); if (!box || !LIST) return;
    var cnt = { every: LIST.length, all: LIST.filter(function (r) { return !+r.member_srl; }).length, mem: LIST.filter(function (r) { return +r.member_srl; }).length,
      past: LIST.filter(function (r) { return r.per === 'past' || !r.alive; }).length };
    var fb = function (k, t) { return '<button class="ubtn" style="font-size:12px;font-weight:800;' + (FILT === k ? 'background:var(--text,#1f2937);color:#fff;border-color:transparent' : '') + (k === 'past' && cnt.past ? ';color:' + (FILT === k ? '#fff' : '#b91c1c') : '') + '" onclick="SPC.filt(\'' + k + '\')">' + t + ' ' + cnt[k] + '</button>'; };
    box.innerHTML = '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:10px">' + fb('every', '전부') + fb('all', '전체 업체') + fb('mem', '업체별') + fb('past', '⚠️ 기간 지남·시트에 없음')
      + '<span style="font-size:12px;color:var(--muted)">masterc 에서 ' + new Date(LIST_AT).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' }) + ' 읽음</span>'
      + '<button class="ubtn" style="font-size:12px" onclick="SPC.reload(this)">↻ 새로 읽기</button></div>' + listHtml(LIST, FILT);
    try { lowmDraftCalc(); } catch (e) {}
  }
  function view() {
    var n = LIST ? LIST.length : '';
    return '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
      + '<button class="ubtn" style="font-weight:800;background:#15803d;color:#fff;border-color:transparent" onclick="SPC.form()">＋ 특별단가 걸기</button>'
      + '<a class="ubtn" href="' + MC + '/machan_admin#special" target="_blank" rel="noopener" style="text-decoration:none;font-size:12px">masterc 원래 화면</a>'
      + '<span class="spc-st" style="font-size:12.5px;color:#b45309;font-weight:700;display:none"></span></div>'
      + '<div id="spcList">' + (alive() ? '<div class="empty">masterc 에서 특별단가 읽는 중…</div>'
        : '<div class="empty">특별단가는 masterc 에서 바로 읽어 옵니다.<br><button class="ubtn" style="margin-top:10px;font-weight:800" onclick="SPC.reload(this)">🔌 masterc 연결해서 불러오기</button><br><span style="font-size:12px;color:var(--muted)">작은 masterc 창이 열립니다 — 닫지 말고 두면 다음부터 바로 뜹니다.</span></div>') + '</div>';
  }
  function bind() {
    if (alive()) loadList(false).then(drawList).catch(function (e) { var b = document.getElementById('spcList'); if (b) b.innerHTML = '<div class="empty">⚠️ ' + E(e.message) + '<br><button class="ubtn" style="margin-top:10px" onclick="SPC.reload(this)">🔌 다시 연결</button></div>'; });
  }

  /* ─────────────── 걸기·수정 창 ─────────────── */
  var F = null;   // { id, n, wh, sell, cost, ship, base, day, picks:[] }
  function rowInfo(n) {
    var r = null;
    try { var tr = [...document.querySelectorAll('tr[data-lowm]')].find(function (t) { return t.dataset.lowm === n; }); if (tr) r = { sell: +tr.dataset.sell, cost: +tr.dataset.cost, ship: +tr.dataset.ship, day: tr.dataset.day === '1', wh: tr.dataset.wh }; } catch (e) {}
    return r;
  }
  function modal(html) {
    var m = document.getElementById('spcModal');
    if (!m) { m = document.createElement('div'); m.id = 'spcModal'; m.style.cssText = 'position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,.35);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:30px 12px'; m.addEventListener('click', function (e) { if (e.target === m) close(); }); document.body.appendChild(m); }
    m.innerHTML = '<div style="background:var(--card,#fff);color:var(--text);border-radius:14px;max-width:620px;width:100%;padding:18px 18px 14px;box-shadow:0 10px 40px rgba(0,0,0,.3)">' + html + '</div>';
    return m;
  }
  function close() { var m = document.getElementById('spcModal'); if (m) m.remove(); F = null; }
  var inSt = 'width:100%;box-sizing:border-box;border:1px solid var(--line);border-radius:8px;padding:7px 9px;font:inherit;font-size:14px';
  var lb = function (t) { return '<div style="font-size:12px;color:var(--muted);font-weight:700;margin:10px 0 4px">' + t + '</div>'; };
  function form(n, wh, id) {
    var info = n ? rowInfo(n) : null;
    F = { id: id || 0, n: n || '', wh: wh || (info && info.wh) || '', info: info, picks: [] };
    var ex = id && LIST ? LIST.filter(function (r) { return r.id === id; })[0] : null;
    if (ex) { F.n = ex.item; F.wh = ex.wh; F.info = rowInfo(ex.item); }
    var html = '<div style="display:flex;align-items:center;gap:8px"><b style="font-size:16px">🏷 ' + (ex ? '특별단가 수정 #' + ex.id : '특별단가 걸기') + '</b><span style="flex:1"></span><button class="ubtn" onclick="SPC.close()">✕</button></div>'
      + (F.n ? '' : lb('상품 찾기 (수량시트 상시·당일)') + '<input id="spcFind" type="search" placeholder="상품 이름으로 찾기" autocomplete="off" style="' + inSt + '" oninput="SPC.find(this.value)"><div id="spcFindL" style="max-height:200px;overflow:auto"></div>')
      + '<div style="display:grid;grid-template-columns:1fr 2fr;gap:0 10px">'
      + '<div>' + lb('창고') + '<input id="spcWh" value="' + E(F.wh) + '" style="' + inSt + '"></div>'
      + '<div>' + lb('상품 이름') + '<input id="spcItem" value="' + E(F.n) + '" style="' + inSt + '"></div></div>'
      + '<div id="spcInfo" style="font-size:12.5px;color:var(--muted);margin-top:6px"></div>'
      + lb('판매가(원)') + '<input id="spcPrice" inputmode="numeric" value="' + (ex ? won(ex.price) : '') + '" placeholder="이 가격 그대로 나갑니다" style="' + inSt + ';font-weight:800;font-size:16px" oninput="SPC.calc()">'
      + '<div id="spcCalc" style="font-size:12.5px;margin-top:4px"></div>'
      + lb('적용 업체 — 비우면 전체 업체') + '<input id="spcVq" type="search" placeholder="업체 이름으로 찾기" autocomplete="off" style="' + inSt + '" oninput="SPC.vfill(this.value)">'
      + '<div style="display:flex;gap:6px;margin-top:6px"><select id="spcV" style="' + inSt + ';flex:1"><option value="0">전체 업체</option></select>'
      + (ex ? '' : '<button class="ubtn" style="white-space:nowrap" onclick="SPC.pick()">＋ 이 업체 더하기</button>') + '</div>'
      + '<div id="spcPicks" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px"></div>'
      + lb('적용 기간 — 비우면 끝없이') + '<div style="display:flex;gap:6px;align-items:center"><input id="spcFrom" type="date" value="' + E(ex && ex.d_from || '') + '" style="' + inSt + '"> ~ <input id="spcTo" type="date" value="' + E(ex && ex.d_to || '') + '" style="' + inSt + '">'
      + '<button class="ubtn" style="white-space:nowrap" onclick="SPC.oneDay()">오늘 하루만</button></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 10px">'
      + '<div>' + lb('택배비 표기') + '<input id="spcShip" value="' + E(ex && ex.ship_txt || '') + '" placeholder="비우면 시트 값" style="' + inSt + '"></div>'
      + '<div>' + lb('메모') + '<input id="spcMemo" value="' + E(ex && ex.memo || '') + '" placeholder="예 : 9월 프로모션" style="' + inSt + '"></div></div>'
      + '<label id="spcDayL" style="display:none;margin-top:10px;font-size:13px"><input type="checkbox" id="spcDay" checked> 🐟 오늘 당일 등록가도 같은 값으로 (당일은 등록가가 특별단가보다 먼저 나갑니다)</label>'
      + '<div id="spcHave" style="margin-top:12px"></div>'
      + '<div style="display:flex;gap:8px;align-items:center;margin-top:14px;border-top:1px solid var(--line);padding-top:12px">'
      + '<span class="spc-st" style="font-size:12.5px;color:#b45309;font-weight:700;display:none"></span><span id="spcMsg" style="font-size:12.5px;color:var(--muted)"></span><span style="flex:1"></span>'
      + '<button class="ubtn" onclick="SPC.close()">닫기</button><button id="spcSave" class="ubtn" style="font-weight:800;background:#15803d;color:#fff;border-color:transparent" onclick="SPC.save()">💾 특별단가 저장</button></div>';
    modal(html);
    info0();
    var p = document.getElementById('spcPrice'); if (p && F.n) p.focus();
    // 업체 목록·이미 걸린 특별단가는 masterc 창에서 받아 온다 (이 클릭 안에서 연결)
    Promise.all([loadVendors(true), LIST && Date.now() - LIST_AT < 60000 ? LIST : loadList(true)]).then(function () {
      if (!F) return;
      vfill('');
      if (ex) { var s = document.getElementById('spcV'); if (s) { if (+ex.member_srl && ![...s.options].some(function (o) { return o.value === String(ex.member_srl); })) s.add(new Option(ex.member_nick || ex.member_srl, String(ex.member_srl))); s.value = String(+ex.member_srl || 0); } }
      have();
    }).catch(function (e) { var m = document.getElementById('spcMsg'); if (m) m.textContent = '⚠️ ' + e.message; });
  }
  function info0() {
    var el = document.getElementById('spcInfo'); if (!el || !F) return;
    var i = F.info;
    el.innerHTML = i ? '지금 판매가 <b>' + won(i.sell) + '</b> · 원가 ' + won(i.cost) + ' · 택배비 ' + won(i.ship) + (i.day ? ' · 🐟 당일' : ' · 상시') : (F.baseNote || '');
    calc();
  }
  function calc() {
    var el = document.getElementById('spcCalc'); if (!el || !F) return;
    var v = parseInt(String((document.getElementById('spcPrice') || {}).value || '').replace(/[^0-9]/g, ''), 10);
    var pi = document.getElementById('spcPrice'); if (pi && v > 0) { var s = v.toLocaleString(); if (pi.value !== s) pi.value = s; }
    var i = F.info;
    var dl = document.getElementById('spcDayL'); if (dl) dl.style.display = i && i.day ? '' : 'none';
    if (!(v > 0) || !i || !(i.cost > 0)) { el.textContent = ''; return; }
    var mg = v - i.cost, rate = Math.round(mg / (v + (i.ship || 0)) * 1000) / 10;
    el.innerHTML = '이 값이면 마진 <b style="color:' + (mg < 0 ? '#b91c1c' : '#065f46') + '">' + won(mg) + '원 · ' + rate + '%</b>' + (mg < 0 ? ' — 🔴 원가보다 낮습니다(1개당 ' + won(-mg) + '원 밑짐)' : '') + (i.sell ? ' · 지금보다 ' + (v > i.sell ? '+' : '') + won(v - i.sell) : '');
  }
  function vfill(q) {
    var s = document.getElementById('spcV'); if (!s || !VENDORS) return;
    var cur = s.value || '0'; q = nk(q);
    var hit = VENDORS.filter(function (v) { return !q || nk(vLabel(v) + ' ' + v.id).indexOf(q) >= 0; });
    s.innerHTML = '';
    s.add(new Option(q ? (hit.length ? '전체 업체 · 찾은 업체 ' + hit.length + '곳' : '전체 업체 · 맞는 업체 없음') : '전체 업체', '0'));
    hit.forEach(function (v) { s.add(new Option(vLabel(v), String(v.srl))); });
    s.value = q && hit.length === 1 ? String(hit[0].srl) : ([...s.options].some(function (o) { return o.value === cur; }) ? cur : '0');
  }
  function pick() {
    var s = document.getElementById('spcV'); var v = +(s && s.value); if (!v) { toast('더할 업체를 목록에서 골라 주세요'); return; }
    if (F.picks.indexOf(v) < 0) F.picks.push(v); s.value = '0'; drawPicks();
  }
  function drawPicks() {
    var b = document.getElementById('spcPicks'); if (!b) return;
    b.innerHTML = F.picks.map(function (srl) { var v = (VENDORS || []).filter(function (x) { return x.srl === srl; })[0];
      return '<span style="background:#dbeafe;color:#1d4ed8;border-radius:999px;padding:2px 4px 2px 10px;font-size:12.5px;font-weight:700">' + E(v ? vLabel(v) : srl) + ' <button class="ubtn" style="font-size:11px;padding:0 6px" onclick="SPC.unpick(' + srl + ')">×</button></span>'; }).join('');
  }
  function have() {
    var b = document.getElementById('spcHave'); if (!b || !F || !LIST) return;
    var k = nk((document.getElementById('spcItem') || {}).value || F.n);
    var rows = LIST.filter(function (r) { return nk(r.item) === k && r.id !== F.id; });
    if (!rows.length) { b.innerHTML = ''; return; }
    b.innerHTML = '<div style="font-size:12px;color:var(--muted);font-weight:700;margin-bottom:4px">이 상품에 이미 걸린 특별단가 ' + rows.length + '개</div>'
      + rows.map(function (r) { return '<div style="display:flex;gap:8px;align-items:center;font-size:13px;padding:4px 0;border-top:1px dashed var(--line)">'
        + '<span style="flex:1">' + (+r.member_srl ? '<b style="color:#1d4ed8">' + E(r.member_nick) + '</b>' : '<b>전체</b>') + ' · <b>' + won(r.price) + '</b>'
        + (r.d_from || r.d_to ? ' · ' + E((r.d_from || '') + '~' + (r.d_to || '')) + (r.per === 'past' ? ' <span style="color:#b91c1c">기간 지남</span>' : '') : '')
        + (r.active !== 'Y' ? ' · <span style="color:var(--muted)">꺼짐</span>' : '') + (r.memo ? ' · ' + E(r.memo) : '') + '</span>'
        + '<button class="ubtn" style="font-size:11.5px" onclick="SPC.edit(' + r.id + ')">수정</button></div>'; }).join('')
      + (F.id ? '' : '<div style="font-size:12px;color:#b45309;margin-top:4px">같은 업체 줄을 고치려면 [수정]을 눌러 주세요.</div>');
  }
  var ft;
  function find(q) {
    clearTimeout(ft); var L = document.getElementById('spcFindL'); if (!L) return;
    if (!q.trim()) { L.innerHTML = ''; return; }
    ft = setTimeout(function () {
      call('find', { q: q.trim() }, false).then(function (x) {
        if (!x || !x.ok || !x.items.length) { L.innerHTML = '<div style="padding:6px;color:var(--muted)">맞는 상품이 없습니다.</div>'; return; }
        L.innerHTML = x.items.map(function (it, i) { return '<button class="ubtn" style="display:block;width:100%;text-align:left;margin-top:3px" data-i="' + i + '">' + E(it.n) + ' <small style="color:var(--muted)">' + E(it.wh) + ' · 공급가 ' + won(it.base) + (it.k === 'day' ? ' · 당일' : '') + ' · 잔여 ' + won(it.remain) + '</small></button>'; }).join('');
        L.querySelectorAll('button[data-i]').forEach(function (b) { b.onclick = function () {
          var it = x.items[+b.dataset.i];
          document.getElementById('spcWh').value = it.wh; document.getElementById('spcItem').value = it.n;
          F.n = it.n; F.wh = it.wh; F.info = rowInfo(it.n); F.baseNote = '수량시트 공급가 ' + won(it.base) + (it.k === 'day' ? ' · 당일' : '') + ' · 잔여 ' + won(it.remain);
          if (F.info) F.info.day = F.info.day || it.k === 'day'; else F.info = it.k === 'day' ? { day: true } : null;
          L.innerHTML = ''; document.getElementById('spcFind').value = ''; info0(); have(); document.getElementById('spcPrice').focus();
        }; });
      }).catch(function (e) { L.innerHTML = '<div style="padding:6px;color:#b91c1c">⚠️ ' + E(e.message === 'noconn' ? 'masterc 창이 닫혀 있습니다 — 창을 닫고 다시 열어 주세요' : e.message) + '</div>'; });
    }, 200);
  }
  function save() {
    var g = function (id) { return ((document.getElementById(id) || {}).value || '').trim(); };
    var price = parseInt(g('spcPrice').replace(/[^0-9]/g, ''), 10), item = g('spcItem'), wh = g('spcWh');
    if (!item || !(price > 0)) { toast('상품과 가격을 적어 주세요'); return; }
    var mem = +g('spcV') || 0, picks = F.picks.slice(); if (mem && picks.length && picks.indexOf(mem) < 0) picks.push(mem);
    var dF = g('spcFrom'), dT = g('spcTo');
    var body = { id: F.id || 0, wh: wh, item: item, price: price, ship_txt: g('spcShip'), memo: g('spcMemo'), active: 'Y', member_srl: picks.length ? 0 : mem, d_from: dF, d_to: dT };
    if (!F.id && picks.length) { body.members = picks.join(','); body.member_srl = mem; }   // masterc 화면과 같은 모양(고른 칸 값 + members)
    var who = picks.length ? '업체 ' + picks.length + '곳' : mem ? (VENDORS || []).filter(function (v) { return v.srl === mem; }).map(vLabel)[0] || '업체' : '전체 업체';
    var i = F.info, day = !!(i && i.day && !picks.length && !mem && !dF && !dT && (document.getElementById('spcDay') || {}).checked);
    if (i && i.cost > 0 && price < i.cost && !confirm('🔴 원가(' + won(i.cost) + ')보다 낮습니다 — 1개당 ' + won(i.cost - price) + '원 밑집니다.\n그래도 저장할까요?')) return;
    if (!confirm('🏷 masterc 특별단가 ' + (F.id ? '수정' : '저장') + '\n\n' + item + ' (' + wh + ')\n' + won(price) + '원 · ' + who + (dF || dT ? ' · ' + dF + ' ~ ' + dT : ' · 기간 없음')
      + (who === '전체 업체' ? '\n\n리모컨 가격표에 실려 이 값으로 정산되고, 카탈로그에도 바로 반영됩니다.' : '\n\n그 업체가 로그인했을 때만 이 가격이 보입니다.') + (day ? '\n🐟 오늘 당일 등록가도 같은 값으로 고칩니다.' : ''))) return;
    var btn = document.getElementById('spcSave'), msg = document.getElementById('spcMsg');
    btn.disabled = true; msg.textContent = 'masterc 에 저장 중…';
    call('special_save', body, true).then(function (x) {
      if (!x || !x.ok) throw new Error((x && x.msg) || '저장 거절');
      var t = '✅ 특별단가 ' + (F.id ? '수정' : '저장') + (body.members ? ' (업체 ' + picks.length + '곳)' : '');
      return (day ? call('day_price', { n: item, price: price }, false).then(function (y) { return y && y.ok ? ' · 🐟 당일 등록가도 고침' + (y.pushed ? '' : '(카탈로그 당일은 감시 창이 보냄)') : ' · ⚠️ 당일 등록가는 못 고침 — ' + ((y && y.msg) || ''); }) : Promise.resolve(''))
        .then(function (dt) {
          t += afterWrite(x, dt);
          if (who === '전체 업체' && x.rk && x.rk.wait) { try { var o = rkWaitLocal(); o[item] = { at: Date.now(), win: String(x.rk.win || '') }; localStorage.setItem('rk_wait_v1', JSON.stringify(o)); } catch (e) {} }
          try { lowmDraftDrop([item]); } catch (e) {}
          close(); toast(t.replace(/^✅ /, '🏷 ')); flash(t);
          return loadList(false).then(function () { if (location.hash === '#lowmspc') drawList(); });
        });
    }).catch(function (e) { btn.disabled = false; msg.textContent = '⚠️ ' + (e.message === 'noconn' ? 'masterc 창이 닫혔습니다 — 다시 눌러 주세요' : e.message); });
  }
  function flash(t) { var m = document.querySelector('.lowm-msg'); if (m) m.textContent = t; }
  function toggle(btn, id) {
    var r = (LIST || []).filter(function (x) { return x.id === id; })[0]; if (!r) return;
    var to = r.active !== 'Y';
    btn.disabled = true;
    call('special_save', { id: r.id, wh: r.wh, item: r.item, price: r.price, ship_txt: r.ship_txt || '', memo: r.memo || '', active: to ? 'Y' : 'N', member_srl: r.member_srl, d_from: r.d_from || '', d_to: r.d_to || '' }, true)
      .then(function (x) { if (!x || !x.ok) throw new Error((x && x.msg) || '거절'); toast((to ? '켰습니다' : '껐습니다') + afterWrite(x, '')); return loadList(false); })
      .then(drawList).catch(function (e) { btn.disabled = false; alert('⚠️ ' + e.message); });
  }
  function del(btn, id) {
    var r = (LIST || []).filter(function (x) { return x.id === id; })[0]; if (!r) return;
    if (!confirm('「' + r.item + '」 ' + (+r.member_srl ? r.member_nick + ' ' : '전체 ') + won(r.price) + '원 특별단가를 지울까요?')) return;
    btn.disabled = true;
    call('special_del', { id: id }, true).then(function (x) { if (!x || !x.ok) throw new Error((x && x.msg) || '거절'); toast('지웠습니다' + afterWrite(x, '')); return loadList(false); })
      .then(drawList).catch(function (e) { btn.disabled = false; alert('⚠️ ' + e.message); });
  }

  window.SPC = {
    view: view, bind: bind, form: form, close: close, calc: calc, vfill: vfill, pick: pick, find: find, save: save, toggle: toggle, del: del,
    unpick: function (s) { F.picks = F.picks.filter(function (x) { return x !== s; }); drawPicks(); },
    oneDay: function () { var t = today(); document.getElementById('spcFrom').value = t; document.getElementById('spcTo').value = t; },
    edit: function (id) { form('', '', id); },
    filt: function (k) { FILT = k; drawList(); },
    reload: function (btn) { if (btn) btn.disabled = true; loadList(true).then(drawList).catch(function (e) { if (btn) btn.disabled = false; var b = document.getElementById('spcList'); if (b) b.innerHTML = '<div class="empty">⚠️ ' + E(e.message) + '<br><button class="ubtn" style="margin-top:10px" onclick="SPC.reload(this)">🔌 다시 연결</button></div>'; }); },
    n: function () { return LIST ? LIST.length : ''; },
    countOf: function (n) { if (!LIST) return 0; var k = nk(n); return LIST.filter(function (r) { return nk(r.item) === k && r.active === 'Y' && r.per !== 'past'; }).length; }
  };
})();
