/* 🧾 수량대조 패널 자동 주입 (2026-10-22 홍팀장 「최소화 해 놓는데 수량으로 돌아가면 꺼져 있다,
     그럼 감시도 꺼지는 건데 이러면 안 되지」).

   왜 필요한가:
     패널은 북마크릿이라 사람이 눌러야 뜬다. 그런데 수량 웹은 검색도, 창고 탭도 전부 «페이지 이동» 이라
     그때마다 패널과 타이머가 통째로 날아간다. 감시 예약은 브라우저에 적어 두지만(qtybWatch),
     북마크릿을 다시 눌러야 이어받기 때문에 누르는 걸 잊으면 감시가 조용히 끊긴다
     (10-22 09:27 알도루묵 감시가 그렇게 끊겼다).
   이 확장이 하는 일은 하나다 — 수량 웹이 뜰 때마다 북마크릿을 대신 눌러 준다.
   패널 코드는 늘 라이브에서 가져오므로, 배포하면 따로 손대지 않아도 최신이 된다.

   🔴 여기까지 오는 데 두 번 헛짚었다 (2026-10-22, 전부 실측):
     ① `<script src=…>` 로 꽂으면 **그 요청만 503** 이 온다 — 같은 탭 같은 순간에 `fetch` 는 200 이다
        (맨 주소든 캐시 버스터든 같다. 처음엔 버스터 탓인 줄 알고 뺐는데 그대로였다).
        → fetch 로 받아 `textContent` 로 꽂는다. script 태그가 네트워크를 타지 않는다.
     ② 그렇게 고쳤더니 코드는 176KB 그대로 꽂혔는데 **실행이 안 됐다**(콘솔 에러도 없음).
        기본 content script 는 페이지와 분리된 자리에서 돌기 때문이다.
        → `"world": "MAIN"` 으로 **페이지와 같은 자리**에서 돌린다. 북마크릿과 똑같은 조건이 된다
          (그 조건에서 fetch+inline 이 실제로 패널을 띄우는 것을 먼저 확인하고 이렇게 바꿨다). */
(function () {
  var SRC = 'https://chanwha0221-cmyk.github.io/baljuseo/qty-bridge.js';
  var MAX = 4;

  function up() { return !!document.getElementById('qtyb-panel'); }

  function attempt(n) {
    if (up()) return;                                   // 북마크릿으로 이미 띄워 뒀으면 건드리지 않는다
    fetch(n ? (SRC + '?r=' + n + '-' + Date.now()) : SRC, { cache: n ? 'reload' : 'default' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function (code) {
        if (!code || code.length < 1000) throw new Error('받은 내용이 너무 짧다 (' + (code ? code.length : 0) + ')');
        if (up()) return;
        var s = document.createElement('script');
        s.id = 'qtyb-auto';
        s.textContent = code;
        (document.head || document.documentElement).appendChild(s);
      })
      .catch(function (e) {
        if (up()) return;
        if (n >= MAX) {
          console.warn('[수량대조] 패널을 불러오지 못했습니다 — 북마크릿으로 띄워 주세요. (' + (e && e.message || e) + ')');
          return;
        }
        setTimeout(function () { attempt(n + 1); }, (n + 1) * 2000);   // 2 · 4 · 6 · 8 초
      });
  }

  attempt(0);
})();
