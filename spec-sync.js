/* ════════════════════════════════════════════════════════════════
   📝 스펙 최신화 (spec-sync.js) — 홍팀장 2026-10-01
   ────────────────────────────────────────────────────────────────
   카탈로그 카드 스펙은 도구시트 「상품이미지_v2」 D열 사본이다. masterc 상세를 나중에 고치면 사본이
   안 따라가서 「생물 갑오징어 1kg」이 4-6미(상세는 13미)로 나갔다 — 클레임 원인.
   이 파일 = 사본이 있는 상품 전부를 masterc 새 상세(xd)와 대조해 **다른 것만** D열 한 칸씩 고친다.

   누가 부르나: 카탈로그 마스터 [📝 스펙 최신화] → masterc.kr/board_eJGl96#specsync 를 새 창으로 →
               그 게시판에 심어 둔 dm-bridge.js 가 #specsync 를 보고 이 파일을 불러온다.
   (masterc 상세는 로그인 세션이 있어야 읽히고 다른 사이트에선 못 읽는다 — 그래서 그 창 안에서 돈다)
   끝나면 결과를 카탈로그(opener)로 보내고, 카탈로그가 캐시를 다시 굽는다.

   비교 규칙: ※·공백·원산지 줄을 빼고 비교. 새 상세에 원산지 줄이 없으면 기존 원산지 줄은 남긴다.
   사진·링크·다른 칸은 손대지 않는다. 사진·스펙 도구(media-updater.js)의 [📝 스펙 최신화]와 같은 규칙.

   ⏰ 자동 (2026-11-04 홍팀장 「30분에 한 번씩 8시 30분부터 15시 30분까지」): 변동 감시 창(mc-watch.js)이 SPECSYNC.run 을 부른다.
   📋 D열이 빈 상품 (2026-11-04): 카드 스펙은 보내기 딸깍이 모은 MC_SPEC 에서 온다(mc-spec.js) — 예전 대조는 D열 있는 것만 봐서
      9/30 이후 새 상품은 상세를 고쳐도 영영 안 따라갔다. 이제 그것도 상세에서 읽어, 지난번 보낸 값과 다를 때만 mcspec 으로 덮는다.
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__specSync) return; window.__specSync = 1;
  if (location.hostname !== 'masterc.kr') return;
  var TARGET = 'https://chanwha0221-cmyk.github.io';
  var DOGU = '1t1E8TZ9442OvgFV6Ah5nK6gexHv7xxVFf0jBVDXFUzM', TAB = '상품이미지_v2';
  var pkey = function (s) { return String(s || '').replace(/\s+/g, '').toLowerCase(); };
  var q = encodeURIComponent;
  var KEY = 'mc-zq3px7mypqwbfs3cfkjg';
  var EDGE = 'https://yzttmdrlujgstfjsbser.supabase.co/functions/v1/api';
  var SENT_KEY = 'spec_mc_sent_v1';

  function tell(o) { try { if (window.opener) window.opener.postMessage(Object.assign({ type: 'specsync' }, o), TARGET); } catch (e) {} }

  function proxy() {
    if (window.SheetsProxy) return Promise.resolve();
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = TARGET + '/baljuseo/sheets-proxy.js?v=' + Date.now();
      s.onload = function () { window.SheetsProxy ? res() : rej(new Error('시트 연결 도구 준비 실패')); };
      s.onerror = function () { rej(new Error('시트 연결 도구를 못 불러옴')); };
      document.head.appendChild(s);
    });
  }
  function sheet(path, opt) {
    var o = Object.assign({ headers: {} }, opt || {});
    o.headers = Object.assign({ Authorization: 'Bearer via-proxy' }, o.headers);
    return fetch('https://sheets.googleapis.com/v4/spreadsheets/' + DOGU + path, o).then(function (r) { return r.json(); });
  }
  function docHtml(srl) {
    return fetch('/xd/api.php?mid=board_eJGl96&a=doc&srl=' + q(srl), { credentials: 'include', cache: 'no-store' })
      .then(function (r) { return r.json(); }).then(function (j) { return (j && j.ok) ? String((j.doc && j.doc.html) || '') : null; });
  }
  function mcspecLib() {
    if (window.MCSPEC && window.MCSPEC.lines) return Promise.resolve();
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = TARGET + '/baljuseo/mc-spec.js?v=' + Date.now();
      s.onload = function () { res(); };
      s.onerror = function () { rej(new Error('스펙 읽기 도구를 못 불러옴')); };
      document.head.appendChild(s);
    });
  }
  function specOnly(srl) {
    return docHtml(srl).then(function (html) {
        if (html == null) return null;
        var t = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&plusmn;/g, '±').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        var si = t.indexOf('상품 스펙');
        return (si >= 0 ? t.slice(si, si + 900) : t).split('\n').map(function (s) { return s.trim().replace(/\s+/g, ' '); })
          .filter(function (s) { return s.indexOf('※') === 0 && s.length > 4; }).slice(0, 7);
      });
  }
  var norm = function (s) { return String(s || '').replace(/^※\s*/, '').replace(/\s+/g, ''); };
  var noOrg = function (a) { return a.filter(function (s) { return !/원산지/.test(s); }); };

  /* 대조 본체. say = 진행 글자 받을 함수. 실패하면 던진다 */
  async function run(say) {
      say('📝 masterc 상세 목록 읽는 중…');
      var B = await (await fetch('/xd/api.php?mid=board_eJGl96&a=list', { credentials: 'same-origin', cache: 'no-store' })).json();
      var sm = {}, nm = {}; (B && B.items || []).concat(B && B.today || []).forEach(function (p) { if (p && p.n && p.srl) { sm[pkey(p.n)] = p.srl; nm[pkey(p.n)] = p.n; } });
      if (!Object.keys(sm).length) throw new Error('masterc 상세 목록을 못 읽었습니다 — masterc 로그인 확인');
      await proxy();
      var v = await sheet('/values/' + q("'" + TAB + "'!A1:D3000"));
      if (v.error) throw new Error('스펙 사본을 못 읽었습니다: ' + (v.error.message || v.error));
      var rows = v.values || [], work = [], hasD = {};
      for (var i = 1; i < rows.length; i++) { var r = rows[i] || []; if (r[0] && r[3]) hasD[pkey(r[0])] = 1; if (r[0] && r[3] && sm[pkey(r[0])]) work.push({ row: i + 1, name: String(r[0]).trim(), old: String(r[3]), srl: sm[pkey(r[0])] }); }
      var k = 0, done = 0, fixed = [], fail = [];
      async function w() {
        while (k < work.length) {
          var x = work[k++];
          try {
            var sp = await specOnly(x.srl);
            if (sp && sp.length) {
              var oldL = x.old.split('\n');
              if (noOrg(oldL).map(norm).join('|') !== noOrg(sp).map(norm).join('|')) {
                var org = oldL.find(function (s) { return /원산지/.test(s); });
                var neu = (org && !sp.some(function (s) { return /원산지/.test(s); })) ? [org].concat(sp) : sp;
                var j = await sheet('/values/' + q("'" + TAB + "'!D" + x.row) + '?valueInputOption=RAW',
                  { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [[neu.join('\n')]] }) });
                if (j && j.error) fail.push(x.name);
                else {
                  var a = noOrg(oldL), b = noOrg(sp), ch = [];
                  for (var m = 0; m < Math.max(a.length, b.length); m++) if (norm(a[m]) !== norm(b[m])) ch.push((a[m] || '∅').replace(/^※\s*/, '') + ' → ' + (b[m] || '∅').replace(/^※\s*/, ''));
                  fixed.push({ name: x.name, ch: ch });
                }
              }
            }
          } catch (e) { fail.push(x.name); }
          done++;
          say('📝 스펙 대조 중 ' + done + '/' + work.length + ' — 고침 ' + fixed.length + '건');
        }
      }
      await Promise.all([0, 1, 2, 3, 4, 5].map(w));

      /* 📋 D열이 빈 상품 = MC_SPEC 쪽. 서버 값은 못 읽으니 이 브라우저가 지난번 보낸 값과 비교한다(처음 한 번은 전부 보낸다) */
      await mcspecLib();
      var sent = {}; try { sent = JSON.parse(localStorage.getItem(SENT_KEY) || '{}') || {}; } catch (e) {}
      var mcWork = Object.keys(sm).filter(function (key) { return !hasD[key]; }), c = 0, specs = {}, nextSent = {};
      async function w2() {
        while (c < mcWork.length) {
          var key = mcWork[c++];
          try {
            var html = await docHtml(sm[key]);
            var sp = html == null ? [] : window.MCSPEC.lines(html);
            if (!sp.length) { if (sent[key]) nextSent[key] = sent[key]; continue; }
            var sig = sp.join('\n'); nextSent[key] = sig;
            if (sent[key] !== sig) specs[nm[key]] = sp;
          } catch (e) { if (sent[key]) nextSent[key] = sent[key]; fail.push(nm[key]); }
          say('📝 스펙 대조 중(MC) ' + c + '/' + mcWork.length);
        }
      }
      await Promise.all([0, 1, 2, 3, 4, 5].map(w2));
      var names = Object.keys(specs), firstRun = !Object.keys(sent).length;
      if (names.length) {
        var sj = await (await fetch(EDGE, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'mcspec', key: KEY, specs: specs }) })).json();
        if (!sj || !sj.ok) throw new Error('스펙 저장 실패: ' + ((sj && sj.error) || '알 수 없음'));
      }
      try { localStorage.setItem(SENT_KEY, JSON.stringify(nextSent)); } catch (e) {}
      if (!firstRun) names.forEach(function (n) { fixed.push({ name: n, ch: ['상세 스펙 바뀜 → 카드 스펙 갱신'] }); });
      return { total: work.length + mcWork.length, fixed: fixed, fail: fail, firstRun: firstRun };
  }
  window.SPECSYNC = { run: run };

  /* 카탈로그 [📝 스펙 최신화] 로 연 창일 때만 화면을 띄우고 바로 돈다 */
  if (String(location.hash || '').indexOf('specsync') < 0) return;
  var box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:50%;top:20px;transform:translateX(-50%);z-index:2147483647;width:min(560px,92vw);max-height:80vh;overflow:auto;'
    + 'background:#fff;border:2px solid #15803d;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.25);font:13px/1.6 system-ui,sans-serif;color:#1f2937;padding:14px 16px;white-space:pre-wrap';
  box.textContent = '📝 스펙 최신화 준비 중…';
  (document.body || document.documentElement).appendChild(box);
  function say(m) { box.textContent = m; }
  run(say).then(function (R) {
    say('✅ 스펙 최신화 — ' + R.total + '건 대조, ' + R.fixed.length + '건 고침' + (R.fail.length ? (' · 실패 ' + R.fail.length + '건: ' + R.fail.join(', ')) : '')
      + (R.fixed.length ? ('\n\n' + R.fixed.map(function (f) { return '■ ' + f.name + '\n   ' + f.ch.join('\n   '); }).join('\n')) : '\n\n바뀐 스펙 없음')
      + '\n\n이 창은 닫으셔도 됩니다.');
    tell({ ok: true, total: R.total, fixed: R.fixed, fail: R.fail });
  }).catch(function (e) {
    say('❌ ' + (e.message || e));
    tell({ ok: false, error: String(e.message || e) });
  });
})();
