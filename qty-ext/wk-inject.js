/* 🚚 당일 시트 → 발주 등록 웹(wk.php) 바로 넣기 (2026-11-13 홍팀장 「발주영역 복사 버튼이 아니라 저걸 누르면 웹에 똑같이 들어가게」).
   월 시트 메뉴 「🚚 E:N 발주영역 → 발주 웹 넣기」(copyOrderRange) → 시트 창(gs-dialog.js)이 bg.js 에 넘김 →
   bg.js 가 열려 있는 wk.php 탭 주소를 #gsbalju=<E:N 탭글자 base64url> 로 바꾸거나(없으면 새 탭) →
   이 스크립트가 주소를 읽어 지우고 [발주서] 표 첫 칸(발주사)에 붙여넣기를 일으킨다 = 사람이 Ctrl+V 한 것과 같다.
   11-13 「열려 있으면 그 페이지에다가」 → 처음 열 때(load)뿐 아니라 주소 #만 바뀔 때(hashchange)도 받는다.
   표에 이미 줄이 있으면 묻고 [초기화 F1] 뒤 넣는다.
   🔴 [발주체크]·[발주등록] 은 누르지 않는다 — 사람이 F3·F4. 값은 주소 # 뒤라 서버로 안 간다. */
(function () {
  var TAG = '#gsbalju=';
  function decode(raw) {
    var b = atob(raw.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, ''));
    var u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return new TextDecoder('utf-8').decode(u);
  }
  function run() {
    if (location.hash.indexOf(TAG) !== 0) return;
    var raw = location.hash.slice(TAG.length);
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    var tsv;
    try { tsv = decode(raw); } catch (e) { alert('발주를 못 읽었습니다 — 시트에서 다시 눌러 주세요. (' + (e && e.message || e) + ')'); return; }
    if (!tsv || !tsv.trim()) { alert('넘어온 발주가 비어 있습니다.'); return; }
    var n = 0, asked = false;
    (function put() {
      var gin = document.getElementById('gin');
      var el = gin && gin.querySelector('input[data-r="0"][data-c="0"]');
      if (!el) { if (++n > 60) alert('발주 표가 안 떠서 못 넣었습니다 — 새로고침 후 시트에서 다시 눌러 주세요.'); else setTimeout(put, 250); return; }
      if (!asked) {
        asked = true;
        var had = Array.prototype.filter.call(gin.querySelectorAll('input[data-k="ord_nm"]'), function (x) { return String(x.value || '').trim() !== ''; }).length;
        if (had) {
          if (!confirm('발주서 표에 이미 ' + had + '줄이 있습니다.\n\n지우고 시트의 ' + tsv.split('\n').length + '줄로 새로 넣을까요?\n(아직 [발주등록] 안 한 줄이면 [취소])')) return;
          var bi = document.getElementById('bInit'); if (bi) bi.click();
          return setTimeout(put, 200);
        }
      }
      /* 칸 순서 = 리모컨 10칸(발주사·주문처·주문처주소·주문처연락처·창고·상품명·수령인·수령인주소·수령인연락처·배송메시지).
         붙여넣기는 «보이는 칸» 차례로 채우니 주문처·주소·창고 칸을 켜 둔다. */
      var changed = false;
      ['h1', 'h2', 'h3'].forEach(function (id) {
        var x = document.getElementById(id);
        if (x && !x.checked) { x.checked = true; x.dispatchEvent(new Event('change', { bubbles: true })); changed = true; }
      });
      if (changed) { n = 0; return setTimeout(put, 200); }   // 표를 다시 그리니 새 칸을 잡는다
      var txt = tsv;
      if (el.getAttribute('data-k') !== 'ord_co_nm') {        // 발주사 칸이 없는 계정이면 첫 칸(E)을 뗀다
        txt = tsv.split('\n').map(function (l) { return l.split('\t').slice(1).join('\t'); }).join('\n');
      }
      var lines = tsv.split('\n').length;
      var dt = new DataTransfer(); dt.setData('text/plain', txt + '\n');
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      var got = el.value !== '' || (gin.querySelector('input[data-r="0"][data-k="ord_nm"]') || {}).value;
      if (!got) alert('발주를 못 넣었습니다 — 시트에서 다시 눌러 주세요.');
      else document.title = '✅ ' + lines + '줄 들어옴 · ' + document.title.replace(/^✅ \d+줄 들어옴 · /, '');
    })();
  }
  run();
  window.addEventListener('hashchange', run);
})();
