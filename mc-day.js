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
    /* 💸 역마진 판정은 «공급가(base)» 로 한다 — 원가(cost) 칸이 아니다 (2026-09-29 홍팀장
       「저거 버그래, 앞에 공급가가 맞대」). 알배기암게 공급가 12,000 인데 원가 칸이 14,000(마스터 기준)으로
       잘못 떠서 마진 -1,000 으로 보였다. 규칙가도 공급가에서 계산된다. */
    function under(r) { var b = +(r.base || 0); return b > 0 && +r.sug < b; }
    var loss = fresh.filter(function (r) { return r.remain > 0 && under(r); });
    var noPrice = fresh.filter(function (r) { return r.remain > 0 && !(+r.sug > 0); });
    var go = fresh.filter(function (r) { return r.remain > 0 && +r.sug > 0 && !under(r); });
    var low = go.filter(function (r) { return r.remain < DAY_LOW_N; });

    /* ⚠️ 수량은 있는데 마진 마이너스라 안 올린 것 — 맨 위에 이름까지 띄운다 (2026-09-29 홍팀장
       「이런 건 확인해서 확인하라고 알림 줘라」). 끝에 묻어 두면 안 보고 넘어간다. */
    var lossTxt = loss.length
      ? ('⚠️ 확인하세요 — 수량은 있는데 마진 마이너스라 안 올린 것 ' + loss.length + '개\n'
         + loss.map(function (c) { return '· ' + c.n + ' (잔여 ' + c.remain + ' · 규칙가 ' + won(c.sug) + ' / 공급가 ' + won(c.base) + ' → 마진 ' + won(c.sug - c.base) + ')'; }).join('\n')
         + '\n→ 가격 정해서 손으로 등록하세요.\n\n')
      : '';
    var ask = lossTxt + '당일 보내기\n\n'
      + (go.length
          ? ('① 새로 등록 ' + go.length + '개 (규칙가 · 오늘만)' + (low.length ? ' — 그중 소량(잔여 ' + DAY_LOW_N + '개 미만) ' + low.length + '개' : '') + '\n')
          : '① 새로 등록할 것 없음\n')
      + (zero.length ? '   · 잔여 0 이라 안 올림 ' + zero.length + '개\n' : '')
      + (loss.length ? '   · 마진 마이너스라 안 올림 ' + loss.length + '개 (위 목록)\n' : '')
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
    /* 📷 사진·배송비·택배사는 상품리스트 응답에서 — 🔴 당일상품은 `items`(상시)가 아니라 `today` 에 있다
       (2026-09-30 알배기암게 등 당일 54개가 전부 「사진 준비중」 이었다). today 를 나중에 넣어 당일 값이 이기게 한다. */
    var im = {};
    [].concat((L && L.items) || [], (L && L.today) || []).forEach(function (p) {
      im[String(p.n).replace(/\s+/g, '').toLowerCase()] = { img: p.img, srl: p.srl, ship_n: p.ship_n, courier: p.courier };
    });
    var items = (Q.cands || []).filter(function (r) { return r.k === 'day'; }).map(function (r) {
      var m = im[String(r.n).replace(/\s+/g, '').toLowerCase()] || {};
      /* 🚚 택배사 (2026-09-29 홍팀장 「택배사 문의 많다, 노출할 수 있게」) — 당일 자료(daily_cand)에 택배사가
         들어오면 그걸, 아직 없으면 상품리스트에 같은 이름이 있을 때 그 택배사를 쓴다. */
      return { n: r.n, wh: r.wh, qid: r.qid, sell: r.sell, sug: r.sug, base: r.base, cost: r.cost, ship: r.ship, ship_n: m.ship_n,
               tax: r.tax, courier: r.courier || r.cou || m.courier || '', cut: r.cut, exp: r.exp, img: m.img, srl: m.srl,
               total: r.total, sold: r.sold, remain: r.remain, reg: r.reg };
    });
    var r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'mcday', key: KEY, day: Q.day, items: items }) });
    var j = await r.json();

    /* 📋 ※ 스펙도 같이 — 스펙이 아직 없는 상품만 masterc 상세에서 긁어 보낸다(mc-spec.js). 실패해도 보내기는 끝났다. */
    var specTxt = '';
    try {
      if (!window.MCSPEC) await new Promise(function (res, rej) { var s = document.createElement('script'); s.src = 'https://chanwha0221-cmyk.github.io/baljuseo/mc-spec.js?v=' + Date.now(); s.onload = res; s.onerror = rej; document.head.appendChild(s); });
      var sr = await window.MCSPEC.run(API, KEY);
      specTxt = sr.need ? ('\n📋 스펙 새로 ' + sr.saved + '개 채움' + (sr.miss ? ' (상세에 스펙 없는 것 ' + sr.miss + '개)' : '')) : '';
    } catch (e) { specTxt = '\n⚠️ 스펙은 못 채웠습니다 — ' + (e && e.message ? e.message : e); }

    var msg = lossTxt + (j.ok
        ? ('당일을 카탈로그로 보냈습니다\n\n전체 ' + j.count + '개 · 파는 것 ' + j.open + '개')
        : ('카탈로그로 보내지 못했습니다\n' + (j.error || '')))
      + '\n새로 등록 ' + ok.length + '개' + (low.length ? ' (소량 딱지 붙는 것 ' + low.filter(function (c) { return ok.indexOf(c) >= 0; }).length + '개)' : '')
      + specTxt
      + (fail.length ? '\n\n⚠️ 등록 실패 ' + fail.length + '개\n' + fail.slice(0, 10).join('\n') : '')
      + '\n\n카탈로그를 새로고침하면 반영됩니다.';
    alert(msg);
    if (ok.length && typeof window.loadDaily === 'function') { try { window.loadDaily(); } catch (e) {} }
  } catch (e) {
    alert('당일 보내기 중 멈췄습니다 — ' + (e && e.message ? e.message : e));
  }
})();
