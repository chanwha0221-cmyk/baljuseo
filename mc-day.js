/* 🐟 당일 딸깍 — masterc 관리화면(#daily)에서 누른다 (mc-sync.html 의 [🐟 당일 보내기] 북마클릿이 이 파일을 싣는다).
 * ─────────────────────────────────────────────────────────────────────────
 * 2026-09-29 홍팀장 : 「등록 버튼을 하나씩 눌러서 등록한 다음 당일 보내기 누르고 있거든.
 *                      당일 보내기 누르면 니가 등록 눌러서 카탈로그에 나오게 해줄 수 있냐」
 *                    → 「0은 올리지 말고, 15/30 이런 거 소량 남아있는 건 소량으로, 나머지는 그냥」
 *
 * 순서 : ① 아직 등록 안 한 당일 상품 중 잔여가 있는 것을 «등록» 버튼과 똑같이 등록한다
 *          (daily_save · 가격 = 규칙가 · 기간 = 오늘만)
 *        ② 다시 읽어서 카탈로그로 보낸다(mcday) — 예전 당일 딸깍 그대로.
 * 소량(잔여 1~29) 딱지는 카탈로그가 붙인다(catalog.html DAYLOW). 여기서는 등록만.
 *
 * 🔴 건드리지 않는 것
 *    · 잔여 0 (총수량 0 = 아직 안 열린 것 포함)
 *    · 이미 등록한 것 — 꺼둔 것도 그대로 둔다(홍팀장이 일부러 끈 것이다)
 *    · 규칙가가 원가보다 낮은 것 — 화면의 등록 버튼도 «원가보다 낮다» 고 되묻는 자리다.
 *      자동으로 밑지고 팔지 않는다. 목록으로 알려 주고 손으로 정하게 한다.
 * 🔴 masterc 에 스니펫을 박는 건 XE 가 <script> 를 걸러서 안 된다 → 북마클릿이 이 파일을 싣는다.
 *    이 파일을 고치면 북마크를 다시 등록할 필요가 없다.
 */
(async function () {
  var KEY = 'mc-zq3px7mypqwbfs3cfkjg';
  var API = 'https://yzttmdrlujgstfjsbser.supabase.co/functions/v1/api';
  var DAY_LOW_N = 30;                           // 이 수 미만이면 카탈로그에 🟡 소량 (catalog.html DAY_LOW_N 과 같은 값)

  if (location.host.indexOf('masterc') < 0) { alert('masterc.kr 에 로그인된 창에서 눌러주세요.'); return; }
  function cand() { return fetch('/xd/api.php?mid=machan_admin&a=daily_cand', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.json(); }); }
  function saveDaily(c) {
    var fd = new FormData();
    fd.append('a', 'daily_save');
    fd.append('wh', c.wh); fd.append('item', c.n); fd.append('price', String(c.sug));
    fd.append('ship_txt', c.ship || ''); fd.append('tax', c.tax || ''); fd.append('memo', ''); fd.append('days', '1');
    return fetch('/xd/api.php?mid=machan_admin&a=daily_save', { method: 'POST', body: fd, credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.json(); });
  }
  function won(n) { return String(Math.round(+n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  try {
    var Q = await cand();
    if (!Q.ok) { alert('당일 자료를 읽지 못했습니다 — masterc 로그인을 확인해주세요.'); return; }
    var day = (Q.cands || []).filter(function (r) { return r.k === 'day'; });

    /* ① 자동 등록할 것 고르기 */
    var fresh = day.filter(function (r) { return !r.reg; });
    var zero = fresh.filter(function (r) { return !(r.remain > 0); });
    var loss = fresh.filter(function (r) { return r.remain > 0 && r.cost != null && +r.sug < +r.cost; });
    var noPrice = fresh.filter(function (r) { return r.remain > 0 && !(+r.sug > 0); });
    var go = fresh.filter(function (r) { return r.remain > 0 && +r.sug > 0 && !(r.cost != null && +r.sug < +r.cost); });
    var low = go.filter(function (r) { return r.remain < DAY_LOW_N; });

    var ask = '당일 보내기\n\n'
      + (go.length
          ? ('① 새로 등록 ' + go.length + '개 (규칙가 · 오늘만)' + (low.length ? ' — 그중 소량(잔여 ' + DAY_LOW_N + '개 미만) ' + low.length + '개' : '') + '\n')
          : '① 새로 등록할 것 없음\n')
      + (zero.length ? '   · 잔여 0 이라 안 올림 ' + zero.length + '개\n' : '')
      + (loss.length ? '   · 규칙가가 원가보다 낮아 안 올림 ' + loss.length + '개 (끝나고 목록 보여드림)\n' : '')
      + (noPrice.length ? '   · 규칙가가 없어 안 올림 ' + noPrice.length + '개\n' : '')
      + '② 그다음 당일 전체를 카탈로그로 보냅니다.\n\n진행할까요?';
    if (!confirm(ask)) return;

    var ok = [], fail = [];
    for (var i = 0; i < go.length; i++) {
      try {
        var x = await saveDaily(go[i]);
        if (x && x.ok) ok.push(go[i]); else fail.push(go[i].n + ' — ' + ((x && x.msg) || '거절'));
      } catch (e) { fail.push(go[i].n + ' — ' + (e && e.message ? e.message : e)); }
    }

    /* ② 등록한 상태로 다시 읽어서 보낸다 (예전 당일 딸깍과 같은 모양) */
    if (ok.length) Q = await cand();
    if (!Q.ok) { alert('등록은 ' + ok.length + '개 했는데, 다시 읽지 못해 카탈로그로는 못 보냈습니다. 한 번 더 눌러주세요.'); return; }
    var L = null; try { L = await (await fetch('/xd/api.php?mid=machan_list&a=list', { credentials: 'same-origin' })).json(); } catch (e) {}
    var im = {}; if (L && L.items) L.items.forEach(function (p) { im[String(p.n).replace(/\s+/g, '').toLowerCase()] = { img: p.img, srl: p.srl, ship_n: p.ship_n }; });
    var items = (Q.cands || []).filter(function (r) { return r.k === 'day'; }).map(function (r) {
      var m = im[String(r.n).replace(/\s+/g, '').toLowerCase()] || {};
      return { n: r.n, wh: r.wh, qid: r.qid, sell: r.sell, sug: r.sug, base: r.base, cost: r.cost, ship: r.ship, ship_n: m.ship_n,
               tax: r.tax, courier: r.courier, cut: r.cut, exp: r.exp, img: m.img, srl: m.srl,
               total: r.total, sold: r.sold, remain: r.remain, reg: r.reg };
    });
    var r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'mcday', key: KEY, day: Q.day, items: items }) });
    var j = await r.json();

    var msg = (j.ok
        ? ('당일을 카탈로그로 보냈습니다\n\n전체 ' + j.count + '개 · 파는 것 ' + j.open + '개')
        : ('카탈로그로 보내지 못했습니다\n' + (j.error || '')))
      + '\n새로 등록 ' + ok.length + '개' + (low.length ? ' (소량 딱지 붙는 것 ' + low.filter(function (c) { return ok.indexOf(c) >= 0; }).length + '개)' : '')
      + (fail.length ? '\n\n⚠️ 등록 실패 ' + fail.length + '개\n' + fail.slice(0, 10).join('\n') : '')
      + (loss.length ? '\n\n💸 원가보다 낮아 안 올린 것 — 가격 정해서 손으로 등록하세요\n'
          + loss.map(function (c) { return '· ' + c.n + ' (규칙가 ' + won(c.sug) + ' < 원가 ' + won(c.cost) + ')'; }).join('\n') : '')
      + '\n\n카탈로그를 새로고침하면 반영됩니다.';
    alert(msg);
    if (ok.length && typeof window.loadDaily === 'function') { try { window.loadDaily(); } catch (e) {} }
  } catch (e) {
    alert('당일 보내기 중 멈췄습니다 — ' + (e && e.message ? e.message : e));
  }
})();
