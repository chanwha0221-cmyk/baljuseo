/* 🚚 발주 웹 넣기 — 시트 창(gs-dialog.js)이 보낸 wk.php#gsbalju=… 주소를 연다 (2026-11-13 홍팀장
   「안 열려 있음 새 창 열고 열려 있음 그냥 그 페이지에다가」 · 「꼭 2단계로 해야 되냐」).
   열려 있는 wk.php 탭이 있으면 그 탭 주소(#)만 바꾸고 앞으로 가져온다 → wk-inject.js 가 hashchange 로 받는다.
   없으면 새 탭. 확장 배경은 사람 클릭 없이도 탭을 열 수 있어서 시트 창 버튼을 안 눌러도 된다. */
chrome.runtime.onMessage.addListener(function (msg, sender, reply) {
  if (!msg || typeof msg.gsbalju !== 'string' || msg.gsbalju.indexOf('https://service.masterc.co.kr/gw2/wk.php#gsbalju=') !== 0) return;
  chrome.tabs.query({ url: 'https://service.masterc.co.kr/gw2/wk.php*' }, function (tabs) {
    var t = (tabs || []).filter(function (x) { return !x.discarded; })
      .sort(function (a, b) { return (b.lastAccessed || 0) - (a.lastAccessed || 0); })[0];
    if (t) {
      chrome.tabs.update(t.id, { url: msg.gsbalju, active: true }, function () {
        chrome.windows.update(t.windowId, { focused: true });
        reply({ ok: true, reused: true });
      });
    } else {
      chrome.tabs.create({ url: msg.gsbalju, active: true }, function () { reply({ ok: true, reused: false }); });
    }
  });
  return true;
});
