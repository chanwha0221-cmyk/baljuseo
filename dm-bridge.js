/* ════════════════════════════════════════════════════════════════
   📤 상세메이커 다리 (dm-bridge.js) — masterc 상품 게시판에 심는 스크립트
   홍팀장 2026-09-03
   ────────────────────────────────────────────────────────────────
   왜 필요한가:
     카탈로그 [🖼 상세페이지 만들기] 는 상품 글의 사진·본문이 필요하다. 그런데
     브라우저는 **다른 사이트의 내용을 읽는 것**을 원천 차단한다(CORS). 로그인해도 같다.
     서버가 대신 가져오면 로그인 세션이 없어 사진 0장짜리 껍데기만 온다(실측).
     → 남은 길은 하나뿐이다: **그 페이지 안에서** 소스를 읽어 넘겨주는 것.
        같은 사이트 안에서는 자기 소스를 로그인된 채로 그대로 읽을 수 있다
        (실측 2026-09-03: 200KB · 사진 21장).

   무엇을 하는가:
     주소 끝에 #dmgrab 이 붙어 있을 때만 깨어난다. 그 밖의 모든 방문에는 **아무 일도 하지 않는다.**
     깨어나면 자기 페이지 소스를 읽어 상세메이커 창으로 넘기고 스스로 닫힌다.

   어디에 심는가:
     게시판 레이아웃/스킨의 </body> 앞에 아래 한 줄.
       <script src="https://chanwha0221-cmyk.github.io/baljuseo/dm-bridge.js"></script>

   안전장치:
     · #dmgrab 이 없으면 즉시 끝난다 — 일반 방문자에겐 코드가 도는 일이 없다.
     · 보내는 곳을 **우리 카탈로그 주소로 못 박았다.** 다른 사이트로는 나가지 않는다.
     · 읽기만 한다. 게시판에 아무것도 쓰지 않고 화면도 건드리지 않는다.
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (String(location.hash || '').indexOf('dmgrab') < 0) return;   // 우리가 부른 경우만

  var TARGET = 'https://chanwha0221-cmyk.github.io';               // 넘길 곳 — 여기 말고는 안 나간다
  var sent = false;

  function say(msg) {
    try {
      var d = document.createElement('div');
      d.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:2147483647;background:#0d6efd;'
        + 'color:#fff;font:700 14px/1.6 system-ui,sans-serif;padding:10px;text-align:center';
      d.textContent = msg;
      document.body.appendChild(d);
    } catch (e) {}
  }

  function send(html) {
    if (sent) return;
    sent = true;
    try {
      if (window.opener) {
        window.opener.postMessage({ type: 'dm-source', url: location.href, html: html }, TARGET);
        say('✅ 상세메이커로 넘겼습니다 — 이 창은 곧 닫힙니다');
        setTimeout(function () { try { window.close(); } catch (e) {} }, 700);
        return;
      }
    } catch (e) {}
    // 상세메이커를 거치지 않고 직접 들어온 경우 — 조용히 아무것도 하지 않는다
  }

  // 자기 소스를 로그인된 채로 다시 받아온다. 실패하면 지금 화면의 DOM 이라도 넘긴다.
  try {
    fetch(location.href.split('#')[0], { credentials: 'include' })
      .then(function (r) { return r.text(); })
      .then(function (t) { send(t && t.length > 1000 ? t : document.documentElement.outerHTML); })
      .catch(function () { send(document.documentElement.outerHTML); });
  } catch (e) {
    send(document.documentElement.outerHTML);
  }
  // 그래도 응답이 없으면 8초 뒤 화면 DOM 으로 넘긴다 — 빈손으로 두지 않는다
  setTimeout(function () { send(document.documentElement.outerHTML); }, 8000);
})();
