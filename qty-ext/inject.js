/* 🧾 수량대조 패널 자동 주입 (2026-10-22 홍팀장 「최소화 해 놓는데 수량으로 돌아가면 꺼져 있다,
     그럼 감시도 꺼지는 건데 이러면 안 되지」).

   왜 필요한가:
     패널은 북마크릿이라 사람이 눌러야 뜬다. 그런데 수량 웹은 검색도, 창고 탭도 전부 «페이지 이동» 이라
     그때마다 패널과 타이머가 통째로 날아간다. 감시 예약은 브라우저에 적어 두지만(qtybWatch),
     북마크릿을 다시 눌러야 이어받기 때문에 누르는 걸 잊으면 감시가 조용히 끊긴다
     (10-22 09:27 알도루묵 감시가 그렇게 끊겼다).
   이 확장이 하는 일은 하나다 — 수량 웹이 뜰 때마다 북마크릿을 대신 눌러 준다.
   패널 코드는 늘 라이브에서 가져오므로, 배포하면 따로 손대지 않아도 최신이 된다.

   🔴🔴 `<script src=…>` 로 꽂으면 안 된다 — 그 요청만 503 이 돌아온다 (2026-10-22 실측).
      같은 탭 같은 순간에 `fetch` 는 200 인데 확장이 넣은 script 태그는 503 이었다(맨 주소·버스터 둘 다).
      처음엔 캐시 버스터 탓인 줄 알고 그걸 뺐는데 그대로였다 — 요청을 어떻게 내느냐의 문제였다.
      → **fetch 로 코드를 받아 `textContent` 로 꽂는다.** 그러면 script 태그가 네트워크를 타지 않는다.
      (cross-origin fetch 라 manifest 에 host_permissions 가 필요하다.) */
(function () {
  var SRC = 'https://chanwha0221-cmyk.github.io/baljuseo/qty-bridge.js';
  var MAX = 4;

  function up() { return !!document.getElementById('qtyb-panel'); }

  function run(code) {
    var s = document.createElement('script');
    s.id = 'qtyb-auto';
    s.textContent = code;
    (document.head || document.documentElement).appendChild(s);
  }

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
        run(code);
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
