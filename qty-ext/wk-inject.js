/* 🚚 당일 시트 → 발주 등록 웹(wk.php) 바로 넣기 (2026-11-13 홍팀장 「발주영역 복사 버튼이 아니라 저걸 누르면 웹에 똑같이 들어가게」).
   리모컨이 발주 등록 웹으로 바뀌었다. 월 시트 메뉴 「🚚 E:N 발주영역 → 발주 웹」(copyOrderRange) 이
   wk.php#gsbalju=<E:N 탭글자 base64url> 를 새 탭으로 연다 → 이 스크립트가 주소를 읽어 지우고,
   [발주서] 표 첫 칸(발주사)에 붙여넣기를 일으킨다 = 사람이 E:N 을 복사해 그 칸에 Ctrl+V 한 것과 똑같다.
   🔴 [발주체크]·[발주등록] 은 누르지 않는다 — 사람이 F3·F4. 값은 주소 # 뒤라 서버로 안 간다. */
(function () {
  var TAG = '#gsbalju=';
  if (location.hash.indexOf(TAG) !== 0) return;
  var raw = location.hash.slice(TAG.length);
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  var tsv;
  try {
    var b = atob(raw.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, ''));
    var u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    tsv = new TextDecoder('utf-8').decode(u);
  } catch (e) { alert('발주를 못 읽었습니다 — 시트에서 다시 눌러 주세요. (' + (e && e.message || e) + ')'); return; }
  if (!tsv || !tsv.trim()) { alert('넘어온 발주가 비어 있습니다.'); return; }
  var n = 0;
  (function put() {
    var gin = document.getElementById('gin');
    var el = gin && gin.querySelector('input[data-r="0"][data-c="0"]');
    if (!el) { if (++n > 60) alert('발주 표가 안 떠서 못 넣었습니다 — 새로고침 후 시트에서 다시 눌러 주세요.'); else setTimeout(put, 250); return; }
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
    else document.title = '✅ ' + lines + '줄 들어옴 · ' + document.title;
  })();
})();
