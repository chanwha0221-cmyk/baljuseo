/* 🧾 수량대조 패널 자동 주입 (2026-10-22 홍팀장 「최소화 해 놓는데 수량으로 돌아가면 꺼져 있다,
     그럼 감시도 꺼지는 건데 이러면 안 되지」).

   왜 필요한가:
     패널은 북마크릿이라 사람이 눌러야 뜬다. 그런데 수량 웹은 검색도, 창고 탭도 전부 «페이지 이동» 이라
     그때마다 패널과 타이머가 통째로 날아간다. 감시 예약은 브라우저에 적어 두지만(qtybWatch),
     북마크릿을 다시 눌러야 이어받기 때문에 누르는 걸 잊으면 감시가 조용히 끊긴다
     (10-22 09:27 알도루묵 감시가 그렇게 끊겼다).
   이 확장이 하는 일은 하나다 — 수량 웹이 뜰 때마다 북마크릿을 대신 눌러 준다.
   패널 코드 자체는 늘 라이브에서 가져오므로, 배포하면 따로 손대지 않아도 최신이 된다. */
(function () {
  if (document.getElementById('qtyb-auto')) return;          // 두 번 꽂지 않는다
  var s = document.createElement('script');
  s.id = 'qtyb-auto';
  s.src = 'https://chanwha0221-cmyk.github.io/baljuseo/qty-bridge.js?v=' + Math.floor(Date.now() / 60000);
  s.onerror = function () { console.warn('[수량대조] 패널을 불러오지 못했습니다 — 북마크릿으로 띄워 주세요.'); };
  (document.head || document.documentElement).appendChild(s);
})();
