/* 📋 ※ 스펙 모으기 — 상시·당일 보내기 딸깍이 같이 부른다 (2026-09-30 홍팀장 「보내기에 기능 추가해」).
 * ─────────────────────────────────────────────────────────────────────────
 * 예전엔 📸 상품사진 채우기 버튼을 따로 눌러야 카드에 ※ 스펙이 들어왔다(알배기암게 사고).
 * 이제 보낼 때 한 번에 :
 *   ① 서버에 «스펙이 아직 없는 상품 + masterc 글번호» 를 묻고(mcspecneed)
 *   ② 그 상품만 masterc 상세(`/xd/api.php?mid=board_eJGl96&a=doc&srl=`)에서 ※ 줄을 긁어
 *   ③ 서버에 모아 둔다(mcspec) → 카탈로그가 구울 때 스펙 칸이 빈 상품에만 입힌다.
 * masterc.kr 페이지 위에서만 돈다(로그인 세션 필요). 이미 스펙이 있는 상품은 다시 안 긁는다 → 둘째 날부터는 거의 0건.
 * 🔴 여기서 실패해도 보내기 자체는 이미 끝났다 — 알림에 한 줄로만 남긴다.
 */
(function () {
  function linesOf(html) {
    var txt = String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '\n')
      .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
    var si = txt.indexOf('상품 스펙');
    var spec = (si >= 0 ? txt.slice(si, si + 900) : txt).split('\n')
      .map(function (s) { return s.trim().replace(/\s+/g, ' '); })
      .filter(function (s) { return s.indexOf('※') === 0 && s.length > 4; }).slice(0, 7);
    /* 🌏 원산지 — 「○ 원산지 공개 합니다.」 아래 줄에 따로 있다. ※ 줄에 없으면 맨 위에 붙인다(못 찾으면 안 붙인다). */
    if (!spec.some(function (s) { return s.indexOf('원산지') >= 0; })) {
      var m = txt.match(/원산지[^\n○※]*?합니다\.?\s*([^○※]{1,80})/);
      if (m) {
        var v = m[1].split('\n').map(function (s) { return s.trim(); }).filter(Boolean).join(' / ');
        if (v && v.length <= 40) spec.unshift('※ 원산지 : ' + v);
      }
    }
    return spec;
  }
  window.MCSPEC = {
    run: async function (API, KEY) {
      var nj = await (await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'mcspecneed', key: KEY }) })).json();
      if (!nj || !nj.ok) throw new Error((nj && nj.error) || '스펙 목록을 못 받았습니다');
      var need = nj.need || [], specs = {}, got = 0, miss = 0, i = 0;
      async function lane() {
        while (i < need.length) {
          var it = need[i++];
          try {
            var j = await (await fetch('/xd/api.php?mid=board_eJGl96&a=doc&srl=' + encodeURIComponent(it.srl),
              { credentials: 'include', cache: 'no-store' })).json();
            var sp = (j && j.ok && j.doc) ? linesOf(j.doc.html) : [];
            if (sp.length) { specs[it.n] = sp; got++; } else miss++;
          } catch (e) { miss++; }
        }
      }
      await Promise.all([lane(), lane(), lane(), lane()]);
      var saved = 0;
      if (got) {
        var sj = await (await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'mcspec', key: KEY, specs: specs }) })).json();
        if (!sj || !sj.ok) throw new Error((sj && sj.error) || '스펙 저장 실패');
        saved = sj.saved || 0;
      }
      return { need: need.length, total: nj.total || need.length, saved: saved, miss: miss };
    }
  };
})();
