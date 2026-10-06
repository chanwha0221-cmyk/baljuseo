/* 📤 상시 보내기 — masterc 채널관리 → 우리 Supabase 로 상품·원가·변동사항을 밀어넣는다 (2026-09-28 홍팀장).
 * mc-sync.html 의 [📤 상시 보내기] 북마클릿이 이 파일을 싣는다(2026-09-30부터 — 고쳐도 북마크 재등록이 필요 없다).
 * masterc API 는 로그인 세션이 있어야 읽히고 CORS 도 없다 → 반드시 masterc 창 안에서 돈다.
 * 2026-09-30 : 보낸 뒤 ※ 스펙이 없는 상품은 masterc 상세에서 스펙까지 긁어 같이 보낸다(mc-spec.js).
 */
(async function () {
  var KEY = 'mc-zq3px7mypqwbfs3cfkjg';
  var API = 'https://yzttmdrlujgstfjsbser.supabase.co/functions/v1/api';
  if (location.host.indexOf('masterc') < 0) { alert('masterc.kr 에 로그인된 창에서 눌러주세요.'); return; }
  function post(body) {
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); });
  }
  try {
    var L = await (await fetch('/xd/api.php?mid=machan_list&a=list')).json();
    var C = await (await fetch('/xd/api.php?mid=machan_admin&a=cost')).json();
    if (!L.ok) { alert('상품리스트를 읽지 못했습니다 — masterc 로그인을 확인해주세요.'); return; }
    var items = (L.items || []).map(function (p) {
      return { n: p.n, nk: p.nk, srl: p.srl, img: p.img, price: p.price, wh: p.wh, grp: p.grp, ship: p.ship, ship_n: p.ship_n,
               tax: p.tax, courier: p.courier, cut: p.cut, exp: p.exp, stock: p.stock, bund: p.bund, k: p.k };
    });
    var costs = (C && C.ok ? (C.rows || []) : []).map(function (r) {
      return { n: r.n, sell: r.sell, cost: r.cost, base: r.base, margin: r.margin, how: r.how, remain: r.remain };
    });
    /* 📋 변동사항도 같이 — 우리가 취급하는 것(mine)만 카탈로그에 나간다 */
    var G = null; try { G = await (await fetch('/xd/api.php?mid=machan_chg&a=changes&days=14')).json(); } catch (e) {}
    var chg = (G && G.ok ? (G.rows || []) : []).filter(function (r) { return r.mine; }).map(function (r) {
      return { ap: r.ap, d: r.d, raw: r.raw, k: r.k, sale: r.sale, wh: r.wh, n: r.n, p: r.p, cou: r.cou, ship: r.ship,
               tax: r.tax, spec: r.spec, memo: r.memo, stock: r.stock };
    });
    var j = await post({ action: 'mcpush', key: KEY, items: items, costs: costs, chg: chg });

    /* 🏷 특별단가 «전체»(업체 지정 없이 켜둔 것) — 카탈로그 가격을 이 값으로 (2026-10-06 홍팀장). 못 읽으면 건드리지 않는다. */
    var spcTxt = '';
    try {
      var S = await (await fetch('/xd/api.php?mid=machan_admin&a=special_list', { credentials: 'same-origin', cache: 'no-store' })).json();
      if (S && S.ok) {
        var spc = (S.rows || []).filter(function (r) { return +r.member_srl === 0 && r.active === 'Y' && +r.price > 0; })
          .map(function (r) { return { n: r.item, wh: r.wh, price: +r.price }; });
        var sj = await post({ action: 'mcspc', key: KEY, rows: spc });
        spcTxt = sj && sj.ok ? (spc.length ? '\n🏷 특별단가(전체) ' + spc.length + '개 적용' : '') : '\n⚠️ 특별단가를 못 보냈습니다';
      }
    } catch (e) { spcTxt = '\n⚠️ 특별단가를 못 읽었습니다'; }

    /* 📋 ※ 스펙 — 아직 없는 상품만 masterc 상세에서 긁어 보낸다. 실패해도 보내기는 이미 끝났다. */
    var specTxt = '';
    if (j.ok) {
      try {
        if (!window.MCSPEC) await new Promise(function (res, rej) { var s = document.createElement('script'); s.src = 'https://chanwha0221-cmyk.github.io/baljuseo/mc-spec.js?v=' + Date.now(); s.onload = res; s.onerror = rej; document.head.appendChild(s); });
        var sr = await window.MCSPEC.run(API, KEY);
        specTxt = sr.need ? ('\n📋 스펙 새로 ' + sr.saved + '개 채움' + (sr.miss ? ' (상세에 스펙 없는 것 ' + sr.miss + '개)' : '')) : '';
      } catch (e) { specTxt = '\n⚠️ 스펙은 못 채웠습니다 — ' + (e && e.message ? e.message : e); }
    }

    /* 🔔 «수량 적어서 뺐는데 다시 찼다» 는 맨 앞에 띄운다 — 이걸 보고 다시 민다(홍팀장 2026-09-28) */
    var bk = (j.back || []);
    var msg = j.ok
      ? ('카탈로그로 보냈습니다\n\n상품 ' + j.count + '개 · 원가 ' + (j.costs || 0) + '개 · 변동사항 ' + (j.chg || 0) + '건' + specTxt + spcTxt + '\n카탈로그를 새로고침하면 반영됩니다.')
      : ('보내지 못했습니다\n' + (j.error || ''));
    if (j.ok && bk.length) msg = '🔔 수량이 다시 찼습니다 — ' + bk.length + '개\n' + bk.slice(0, 15).map(function (x) { return '· ' + x.n + ' (잔여 ' + x.remain + ')'; }).join('\n') + (bk.length > 15 ? '\n…' : '') + '\n\n' + msg;
    /* ❓ 풀어둔 상품이 아직도 소량이면 한 번 묻는다 — 아니오면 다시 예외로 내린다 (홍팀장 2026-09-28) */
    var ak = (j.ask || []);
    if (j.ok && ak.length) {
      var keep = confirm('풀어두신 상품이 아직 소량입니다 — ' + ak.length + '개\n' + ak.slice(0, 12).map(function (x) { return '· ' + x.n + ' (잔여 ' + x.remain + (x.stock === 'early' ? ' · 조기소진' : x.stock === 'low' ? ' · 소량' : '') + ')'; }).join('\n') + (ak.length > 12 ? '\n…' : '') + '\n\n[확인] 그대로 계속 판다   [취소] 다시 예외로 내린다');
      if (!keep) {
        for (var i2 = 0; i2 < ak.length; i2++) { await post({ action: 'mckeep', key: KEY, del: ak[i2].n }); }
        msg = '다시 예외로 내렸습니다 — ' + ak.length + '개\n\n' + msg;
      }
    }
    alert(msg);
  } catch (e) { alert('보내지 못했습니다 — ' + (e && e.message ? e.message : e)); }
})();
