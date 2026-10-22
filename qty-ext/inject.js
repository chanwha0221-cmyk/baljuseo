/* 🧾 수량대조 패널 자동 주입 (2026-10-22 홍팀장 「최소화 해 놓는데 수량으로 돌아가면 꺼져 있다,
     그럼 감시도 꺼지는 건데 이러면 안 되지」).

   왜 필요한가:
     패널은 북마크릿이라 사람이 눌러야 뜬다. 그런데 수량 웹은 검색도, 창고 탭도 전부 «페이지 이동» 이라
     그때마다 패널과 타이머가 통째로 날아간다. 감시 예약은 브라우저에 적어 두지만(qtybWatch),
     북마크릿을 다시 눌러야 이어받기 때문에 누르는 걸 잊으면 감시가 조용히 끊긴다
     (10-22 09:27 알도루묵 감시가 그렇게 끊겼다).
   이 확장이 하는 일은 하나다 — 수량 웹이 뜰 때마다 북마크릿을 대신 눌러 준다.
   패널 코드는 늘 라이브에서 가져오므로, 배포하면 따로 손대지 않아도 최신이 된다.

   🔴 한 번 실패하면 포기하지 않는다 (2026-10-22 설치 직후 실측): GitHub Pages 가 503 을 한 번 뱉어
      패널이 안 떴는데, 홍팀장 화면엔 «그냥 안 뜸» 으로만 보였다. 같은 분에 재시도하면 캐시 때문에
      같은 503 을 다시 받을 수 있어 재시도마다 주소를 바꾼다. */
(function () {
  var SRC = 'https://chanwha0221-cmyk.github.io/baljuseo/qty-bridge.js';
  var MAX = 4;
  var tries = 0;

  function up() { return !!document.getElementById('qtyb-panel'); }

  function load() {
    if (up()) return;                                   // 북마크릿으로 이미 띄워 뒀으면 건드리지 않는다
    var old = document.getElementById('qtyb-auto');
    if (old) old.remove();
    var s = document.createElement('script');
    s.id = 'qtyb-auto';
    s.src = SRC + '?v=' + Math.floor(Date.now() / 60000) + (tries ? '&r=' + tries : '');
    s.onerror = retry;
    s.onload = function () {
      /* 200 으로 받아 왔는데도 패널이 없으면(중간에 끊긴 파일 등) 한 번 더 */
      setTimeout(function () { if (!up()) retry(); }, 1500);
    };
    (document.head || document.documentElement).appendChild(s);
  }

  function retry() {
    if (up()) return;
    if (++tries > MAX) {
      console.warn('[수량대조] 패널을 불러오지 못했습니다 — 북마크릿으로 띄워 주세요.');
      return;
    }
    setTimeout(load, tries * 2000);                     // 2 · 4 · 6 · 8 초
  }

  load();
})();
