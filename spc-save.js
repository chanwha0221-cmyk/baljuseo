/* ════════════════════════════════════════════════════════════════
   🏷 특별단가 저장 (spc-save.js) — 홍팀장 2026-10-15
   ────────────────────────────────────────────────────────────────
   저마진 [💾 단가 저장] 이 고친 값은 **masterc #special 「전체」 특별단가**로 들어가야 한다.
   그래야 리모컨 가격표에 실려 그 값으로 정산된다(«오늘만» 당일가·카탈로그 덮개는 다음 날 규칙가로 돌아간다 —
   10-14 호래기 8,500 을 말하고 팔았는데 8,000 으로 정산된 사고).

   누가 부르나: 카탈로그 저마진 [💾 단가 저장] → masterc.kr/board_eJGl96#spcsave 를 새 창으로 →
               그 게시판에 심어 둔 dm-bridge.js 가 #spcsave 를 보고 이 파일을 불러온다.
   (masterc API 는 로그인 세션이 있어야 되고 다른 사이트에선 못 부른다 — 그래서 그 창 안에서 돈다)

   하는 일: ① 카탈로그에서 고친 줄을 받는다 ② machan_admin special_bulk 로 저장(#cost [노출가 한 번에 저장]과 같은 길)
           ③ 특별단가(전체)를 카탈로그로 다시 보낸다(상시 딸깍의 특별단가 부분과 같다) ④ 결과를 카탈로그로 돌려준다.
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__spcSave) return; window.__spcSave = 1;
  if (location.hostname !== 'masterc.kr') return;
  var TARGET = 'https://chanwha0221-cmyk.github.io';
  var KEY = 'mc-zq3px7mypqwbfs3cfkjg';
  var EDGE = 'https://yzttmdrlujgstfjsbser.supabase.co/functions/v1/api';

  var box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:50%;top:20px;transform:translateX(-50%);z-index:2147483647;width:min(560px,92vw);'
    + 'background:#fff;border:2px solid #15803d;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.25);font:13px/1.6 system-ui,sans-serif;color:#1f2937;padding:14px 16px;white-space:pre-wrap';
  box.textContent = '🏷 특별단가 저장 준비 중…';
  (document.body || document.documentElement).appendChild(box);
  function say(m) { box.textContent = m; }
  function tell(o) { try { if (window.opener) window.opener.postMessage(Object.assign({ type: 'spcsave' }, o), TARGET); } catch (e) {} }

  function mc(action, data) {
    var fd = new FormData(); fd.append('a', action);
    Object.keys(data || {}).forEach(function (k) { fd.append(k, data[k]); });
    return fetch('/xd/api.php?mid=machan_admin', { method: 'POST', credentials: 'same-origin', cache: 'no-store', body: fd })
      .then(function (r) { return r.json(); });
  }
  function edge(body) {
    return fetch(EDGE, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); });
  }

  async function run(rows) {
    try {
      var list = (rows || []).filter(function (r) { return r && r.n && +r.price > 0; })
        .map(function (r) { return { wh: String(r.wh || ''), item: String(r.n), price: Math.round(+r.price) }; });
      if (!list.length) { tell({ ok: false, error: '저장할 줄이 없습니다' }); say('저장할 줄이 없습니다.'); return; }
      say('🏷 masterc 특별단가(전체)에 ' + list.length + '개 저장 중…');
      var x = await mc('special_bulk', { rows: JSON.stringify(list) });
      if (!x || !x.ok) throw new Error((x && x.msg) || 'masterc 가 저장을 거절했습니다(로그인 확인)');

      // 카탈로그에 바로 보이게 — 특별단가(전체)를 다시 보낸다. 실패해도 masterc 저장은 이미 끝났다.
      var spcN = -1;
      try {
        var S = await (await fetch('/xd/api.php?mid=machan_admin&a=special_list', { credentials: 'same-origin', cache: 'no-store' })).json();
        if (S && S.ok) {
          var spc = (S.rows || []).filter(function (r) { return +r.member_srl === 0 && r.active === 'Y' && +r.price > 0; })
            .map(function (r) { return { n: r.item, wh: r.wh, price: +r.price }; });
          var sj = await edge({ action: 'mcspc', key: KEY, rows: spc });
          if (sj && sj.ok) spcN = spc.length;
        }
      } catch (e) {}

      tell({ ok: true, n: x.n || list.length, rk: x.rk || null, spc: spcN, rows: list });
      say('✅ masterc 특별단가(전체) ' + (x.n || list.length) + '개 저장'
        + (spcN >= 0 ? '\n카탈로그에도 보냈습니다 (특별단가 ' + spcN + '개)' : '\n⚠️ 카탈로그로는 못 보냈습니다 — 상시 딸깍을 눌러주세요')
        + '\n\n이 창은 곧 닫힙니다.');
      setTimeout(function () { try { window.close(); } catch (e) {} }, 1500);
    } catch (e) {
      var msg = (e && e.message) || String(e);
      tell({ ok: false, error: msg });
      say('⚠️ 저장하지 못했습니다 — ' + msg);
    }
  }

  var got = false;
  window.addEventListener('message', function (ev) {
    if (ev.origin !== TARGET || !ev.data || ev.data.type !== 'spcsave-rows' || got) return;
    got = true; run(ev.data.rows);
  });
  tell({ ready: true });
  setTimeout(function () { if (!got) say('⚠️ 카탈로그에서 저장할 값을 못 받았습니다 — 카탈로그 저마진 화면에서 다시 눌러주세요.'); }, 15000);
})();
