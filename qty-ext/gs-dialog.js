/* 🚚 월 시트 「발주 웹 넣기」 창 → 확장 배경(bg.js)으로 바로 넘긴다 (2026-11-13 홍팀장 「꼭 2단계로 해야 되냐」).
   시트 창(Apps Script 대화상자, *.googleusercontent.com 안쪽 틀)은 사람 클릭 없이는 새 탭을 못 연다 → 버튼을 한 번 더 눌러야 했다.
   이 스크립트가 창 안 a[data-gsbalju] 주소를 배경에 넘기면 배경이 탭을 연다/다시 쓴다. 창은 body[data-gssent] 를 보고 스스로 닫힌다.
   확장이 없으면 예전처럼 버튼을 누르면 된다. */
(function () {
  var a = document.querySelector('a[data-gsbalju]');
  if (!a || a.getAttribute('data-gssent')) return;
  a.setAttribute('data-gssent', '1');
  try {
    chrome.runtime.sendMessage({ gsbalju: a.href }, function (r) {
      if (chrome.runtime.lastError || !r || !r.ok) { a.removeAttribute('data-gssent'); return; }
      document.body.setAttribute('data-gssent', r.reused ? 'reused' : 'new');
    });
  } catch (e) { a.removeAttribute('data-gssent'); }
})();
