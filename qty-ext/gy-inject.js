/* 📤 공유서 다리 자동 주입 (2026-11-02 홍팀장 「비서에서 제목이랑 내용 그대로 저기에 옮겨 쓸 수 있냐」).
   게시판 「하단 내용」 에 심으려 했는데 그룹웨어 관리자 권한이 없다(「관리자만 접속이 가능합니다」) → 이 확장이 대신 꽂는다.

   글쓰기는 그룹웨어 틀(service.masterc.co.kr/gw2/go.php) 안 iframe(masterc.co.kr) 에 있다. 두 사이트라 틀이 값을 건네준다:
     바깥 틀 : 주소 #gysend= 를 읽어 지우고, 안쪽이 받았다고 할 때까지 postMessage.
     안쪽    : 그룹웨어 틀에서 온 값만 받아 gy-bridge.js(라이브) 를 꽂는다. 꽂는 방식은 inject.js 와 같다(fetch + textContent). */
(function () {
  var GW = 'https://service.masterc.co.kr', BOARD = 'https://masterc.co.kr', TAG = '#gysend=';

  if (location.origin === GW) {
    if (location.hash.indexOf(TAG) !== 0) return;
    var data;
    try { data = JSON.parse(decodeURIComponent(location.hash.slice(TAG.length))); } catch (e) { return; }
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    var acked = false, n = 0;
    window.addEventListener('message', function (ev) { if (ev.origin === BOARD && ev.data && ev.data.gyack) acked = true; });
    (function send() {
      if (acked) return;
      if (++n > 60) { alert('공유서를 못 넘겼습니다 — 비서 [📋 게시판 HTML] 로 넣어주세요.'); return; }
      var f = Array.prototype.filter.call(document.querySelectorAll('iframe'), function (x) { return (x.src || '').indexOf(BOARD + '/') === 0; })[0];
      if (f && f.contentWindow) f.contentWindow.postMessage({ gysend: data }, BOARD);
      setTimeout(send, 500);
    })();
    return;
  }

  if (!/[?&]mid=board_mJof66(&|$)/.test(location.search) || !/[?&]act=dispBoardWrite(&|$)/.test(location.search)) return;
  var got = false;
  window.addEventListener('message', function (ev) {
    if (ev.origin !== GW || !ev.data || !ev.data.gysend) return;
    if (ev.source) ev.source.postMessage({ gyack: 1 }, GW);
    if (got) return;
    got = true;
    window.__gysend = ev.data.gysend;
    fetch('https://chanwha0221-cmyk.github.io/baljuseo/gy-bridge.js', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (code) {
        var s = document.createElement('script');
        s.textContent = code;
        (document.head || document.documentElement).appendChild(s);
      })
      .catch(function (e) { alert('공유서를 못 채웠습니다 — 비서 [📋 게시판 HTML] 로 넣어주세요. (' + (e && e.message || e) + ')'); });
  });
})();
