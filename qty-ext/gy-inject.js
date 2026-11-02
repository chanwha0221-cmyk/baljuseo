/* 📤 공유서 다리 자동 주입 (2026-11-02 홍팀장 「비서에서 제목이랑 내용 그대로 저기에 옮겨 쓸 수 있냐」).
   게시판 「하단 내용」 에 심으려 했는데 그룹웨어 관리자 권한이 없다(「관리자만 접속이 가능합니다」) → 이 확장이 대신 꽂는다.
   #gysend= 로 열린 창에서만 돈다. 코드는 라이브 gy-bridge.js. 꽂는 방식은 inject.js 와 같다(fetch + textContent). */
(function () {
  if (location.hash.indexOf('#gysend=') !== 0) return;
  fetch('https://chanwha0221-cmyk.github.io/baljuseo/gy-bridge.js', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
    .then(function (code) {
      var s = document.createElement('script');
      s.textContent = code;
      (document.head || document.documentElement).appendChild(s);
    })
    .catch(function (e) { alert('공유서를 못 채웠습니다 — 비서 [📋 게시판 HTML] 로 넣어주세요. (' + (e && e.message || e) + ')'); });
})();
