/* ════════════════════════════════════════════════════════════════
   📤 공유서 다리 (gy-bridge.js) — 그룹웨어 [마][공유서] 게시판에 심는 스크립트
   홍팀장 2026-11-02 「비서에서 완료 누르면 제목이랑 내용 그대로 저기에 옮겨 쓸 수 있냐」
   ────────────────────────────────────────────────────────────────
   왜 필요한가:
     비서(github.io)와 글쓰기 화면(masterc.co.kr)은 다른 사이트라 비서가 직접 못 채운다.
     → 비서가 값을 주소 # 뒤에 실어 글쓰기 창을 열고, 이 파일이 그 페이지 안에서 칸을 채운다.
       # 뒤는 서버로 안 간다(금액이 서버 기록에 안 남는다). 읽자마자 주소에서도 지운다.

   누가 꽂는가:
     수량대조 확장(qty-ext/gy-inject.js). 게시판 「하단 내용」 은 그룹웨어 관리자 권한이 없어 못 쓴다.

   안전장치:
     · 공유서 게시판 글쓰기 + #gysend= 일 때만 깨어난다. 그 밖의 방문에는 아무 일도 안 한다.
     · 값은 글자로만 받아 여기서 이스케이프해 마크업을 짓는다 — 링크에 스크립트를 실어도 안 돈다.
     · 🔴 채우기만 한다. [등록]은 사람이 누른다. 이미 적힌 글이 있으면 묻고 나서 덮는다.
   ════════════════════════════════════════════════════════════════ */
(function () {
  var TAG = '#gysend=';
  if (location.hash.indexOf(TAG) !== 0) return;
  if (!/[?&]mid=board_mJof66(&|$)/.test(location.search) || !/[?&]act=dispBoardWrite(&|$)/.test(location.search)) return;

  var data;
  try { data = JSON.parse(decodeURIComponent(location.hash.slice(TAG.length))); } catch (e) { return; }
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  if (!data || !data.b) return;

  /* 비서 copyBoardFull 과 같은 마크업 */
  function toHtml(raw) {
    var BASE = 'text-align:center;font-size:18px;line-height:180%;';
    var lines = String(raw).trim().split('\n');
    var fo = -1;
    for (var i = 0; i < lines.length; i++) { if (lines[i].trim().indexOf('○') === 0) { fo = i; break; } }
    if (fo > 0) lines = lines.slice(fo);   // 제목 줄은 제목칸으로 따로 간다
    return lines.map(function (l) {
      var t = l.trim();
      if (t === '') return '<p style="' + BASE + '">&nbsp;</p>';
      return '<p style="' + BASE + '">' + t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>';
    }).join('\n');
  }
  function notice(msg, bad) {
    var d = document.createElement('div');
    d.textContent = msg;
    d.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:99999;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:700;color:#fff;background:' + (bad ? '#c0392b' : '#2d6a4f');
    document.body.appendChild(d);
    if (!bad) setTimeout(function () { d.remove(); }, 6000);
  }

  var tries = 0;
  (function fill() {
    var title = document.getElementById('postTitle');
    var frame = document.querySelector('iframe[id^="editor_iframe_"]');
    var body = null;
    try { body = frame && frame.contentDocument && frame.contentDocument.body; } catch (e) {}
    if (!title || !body || !body.isContentEditable) {
      if (++tries > 40) { notice('공유서를 못 채웠습니다 — 글쓰기 칸을 찾지 못했습니다. 비서 [📋 게시판 HTML] 로 넣어주세요.', true); return; }
      setTimeout(fill, 250);
      return;
    }
    var written = title.value.trim() || (body.textContent || '').trim();
    if (written && !confirm('이미 적힌 글이 있습니다. 비서 공유서로 덮어쓸까요?')) return;
    title.value = String(data.t || '');
    body.innerHTML = toHtml(data.b);
    notice('✅ 비서 공유서를 옮겼습니다 — 확인하고 [등록] 을 눌러주세요');
  })();
})();
