/* 💰 입금확인 다리 자동 주입 (2026-11-17 홍팀장 「리모컨 없앤다. 입금 내역(gw2/dep.php)과 외부유통 보드 정산달력을
     두 사이트 대조해서 색칠할 건 색칠하고 안 맞는 건 대조표로」).

   입금확인.html(github.io)은 masterc 로그인 정보를 못 쓴다. 그래서 입금확인.html 이 외부유통 보드를
   «ipgbridge» 라는 이름의 창으로 열면, 이 확장이 그 창에만 ipg-bridge.js(라이브)를 꽂는다.
   그 창은 보드 로그인(api 토큰)과 그룹웨어 쿠키(같은 사이트)를 그대로 쓰므로 미정산·입금 내역을 읽고
   [진행] 때 정산달력을 칠한다. 꽂는 방식은 inject.js 와 같다(fetch + textContent, world MAIN). */
(function () {
  if (window.name !== 'ipgbridge') return;
  var SRC = 'https://chanwha0221-cmyk.github.io/baljuseo/ipg-bridge.js';
  fetch(SRC + '?r=' + Date.now(), { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
    .then(function (code) {
      var s = document.createElement('script');
      s.id = 'ipgb-auto';
      s.textContent = code;
      (document.head || document.documentElement).appendChild(s);
    })
    .catch(function (e) { console.warn('[입금확인 다리] 못 불러옴', e); });
})();
