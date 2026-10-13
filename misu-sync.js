/* ════════════════════════════════════════════════════════════════
   💰 미수 보고 금액 업데이트 (misu-sync.js) — 홍팀장 2026-10-13
   ────────────────────────────────────────────────────────────────
   미수 보고 페이지(report/misu-*.html) [🔄 금액 업데이트] → masterc.kr/board_eJGl96#misusync 를 새 창으로 →
   그 게시판에 심어 둔 dm-bridge.js 가 #misusync 를 보고 이 파일을 불러온다.
   masterc 관리 「전체 정산현황」(xd/api.php?mid=machan_admin&a=dep_log 의 sum)을 읽어 우리 서버(misudata)로 보내고,
   보고 페이지(opener)에 끝났다고 알린 뒤 스스로 닫힌다. 읽기만 하고 masterc 에는 아무것도 쓰지 않는다.
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__misuSync) return; window.__misuSync = 1;
  if (location.hostname !== 'masterc.kr') return;
  var TARGET = 'https://chanwha0221-cmyk.github.io';
  var API = 'https://yzttmdrlujgstfjsbser.supabase.co/functions/v1/api';
  var KEY = 'mc-zq3px7mypqwbfs3cfkjg';   // mc-list.js 와 같은 밀어넣기 키

  var box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:50%;top:20px;transform:translateX(-50%);z-index:2147483647;width:min(460px,92vw);'
    + 'background:#fff;border:2px solid #1f3a5f;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.25);font:14px/1.6 system-ui,sans-serif;color:#1f2937;padding:14px 16px';
  box.textContent = '💰 미수 금액 읽는 중…';
  (document.body || document.documentElement).appendChild(box);
  function say(m) { box.textContent = m; }
  function tell(o) { try { if (window.opener) window.opener.postMessage(Object.assign({ type: 'misusync' }, o), TARGET); } catch (e) {} }

  fetch('/xd/api.php?mid=machan_admin&a=dep_log&days=14', { credentials: 'same-origin' })
    .then(function (r) { return r.json(); })
    .then(function (j) {
      if (!j || !Array.isArray(j.sum)) throw new Error('정산현황을 못 읽었습니다 — masterc 관리 로그인을 확인해 주세요.');
      say('💰 ' + j.sum.length + '곳 읽음 — 보내는 중…');
      return fetch(API, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'misudata', key: KEY, rows: j.sum, sumAt: j.sum_at || '' })
      }).then(function (r) { return r.json(); });
    })
    .then(function (k) {
      if (!k || !k.ok) throw new Error((k && k.error) || '서버가 거절했습니다');
      say('✅ 미수 금액 ' + k.count + '곳 업데이트 (' + (k.sumAt || '') + ' 기준) — 이 창은 곧 닫힙니다');
      tell({ ok: true, count: k.count, sumAt: k.sumAt });
      setTimeout(function () { try { window.close(); } catch (e) {} }, 1500);
    })
    .catch(function (e) {
      say('⚠️ ' + (e.message || e));
      tell({ ok: false, error: String(e.message || e) });
    });
})();
