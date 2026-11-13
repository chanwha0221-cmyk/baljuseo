/* 🚚 월 시트 「발주 웹 넣기」 창 → 확장 배경(bg.js)으로 바로 넘긴다 (2026-11-13 홍팀장 「꼭 2단계로 해야 되냐」).
   시트 창(Apps Script 대화상자)은 사람 클릭 없이는 새 탭을 못 연다 → 버튼을 한 번 더 눌러야 했다.
   🔴 창 안(googleusercontent 안쪽 틀)에 확장을 꽂는 첫 판은 안 들어갔다(11-13 실측 — 안쪽 틀이 about:blank 꼴).
   → 창이 window.top(구글 시트 화면)에 postMessage {gsbalju:주소} 를 보내고, 이 스크립트(시트 화면)가 받아 배경에 넘긴 뒤
     창에 {gsack:'reused'|'new'} 로 답한다 → 창은 그걸 보고 닫힌다. 확장이 없으면 창의 버튼을 누르면 된다. */
(function () {
  var last = '';
  window.addEventListener('message', function (ev) {
    if (!/^https:\/\/[a-z0-9-]+(-[a-z0-9-]+)*\.googleusercontent\.com$/.test(ev.origin)) return;
    var d = ev.data;
    if (!d || typeof d.gsbalju !== 'string' || d.gsbalju.indexOf('https://service.masterc.co.kr/gw2/wk.php#gsbalju=') !== 0) return;
    var src = ev.source, org = ev.origin;
    if (d.gsbalju === last) return;   // 창이 답 받을 때까지 여러 번 보낸다 — 한 번만 연다
    last = d.gsbalju;
    try {
      chrome.runtime.sendMessage({ gsbalju: d.gsbalju }, function (r) {
        if (chrome.runtime.lastError || !r || !r.ok) { last = ''; return; }
        try { src.postMessage({ gsack: r.reused ? 'reused' : 'new' }, org); } catch (e) {}
        setTimeout(function () { last = ''; }, 3000);
      });
    } catch (e) { last = ''; }
  });
})();
