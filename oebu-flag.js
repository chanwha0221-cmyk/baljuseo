/* 외부유통 현황(service.masterc.co.kr/mastercco-ext) 거래처 중복검색 → 문제 업체 표시
   (그룹 자회사 표는 미팅 페이지에서 뺐다 26-10-31 — 표가 없으면 그 박스는 안 뜬다)
   자료 = 외부유통 미팅 페이지 「문제 업체 공유」 탭 (Supabase app_config PAGE:oebu-tab-vendors, Edge pageget)
   붙이는 법: 그 페이지에 <script src="https://chanwha0221-cmyk.github.io/baljuseo/oebu-flag.js"></script> 한 줄 (2026-10-31) */
(function () {
  if (window.__oebuFlag) return;
  window.__oebuFlag = true;
  var API = 'https://yzttmdrlujgstfjsbser.supabase.co/functions/v1/api';
  var PAGE_URL = 'https://chanwha0221-cmyk.github.io/baljuseo/%EC%99%B8%EB%B6%80%EC%9C%A0%ED%86%B5%EB%AF%B8%ED%8C%85.html#vendors';
  var cache = null, cacheAt = 0;

  var txt = function (s) { return String(s || '').replace(/\s+/g, '').toLowerCase(); };
  var dig = function (s) { return String(s || '').replace(/\D/g, ''); };

  function load() {
    if (cache && Date.now() - cacheAt < 60000) return Promise.resolve(cache);
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'pageget', id: 'oebu-tab-vendors' }) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var out = { problem: [], group: [] };
        var html = j && j.page && j.page.html;
        if (!html) return out;
        var doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
        ['problem', 'group'].forEach(function (k) {
          var t = doc.querySelector('table[data-list="' + k + '"]');
          if (!t) return;
          var heads = [].map.call(t.tHead.rows[0].cells, function (c) { return c.textContent.trim(); });
          [].forEach.call(t.tBodies[0].rows, function (tr) {
            var o = {};
            heads.forEach(function (h, i) { o[h] = tr.cells[i] ? tr.cells[i].textContent.trim() : ''; });
            if (o['사업자명'] || o['사업자번호'] || o['판매채널명'] || o['연락처'] || o['메일주소']) out[k].push(o);
          });
        });
        cache = out; cacheAt = Date.now();
        return out;
      });
  }

  function hit(o, q) {
    var qt = txt(q), qd = dig(q);
    if (!qt) return false;
    if (qd.length >= 4 && qd.length === qt.replace(/[-.()]/g, '').length) {
      return [o['사업자번호'], o['연락처']].some(function (v) { var d = dig(v); return d && (d.indexOf(qd) >= 0 || qd.indexOf(d) >= 0); });
    }
    if (qt.length < 2) return false;
    return [o['사업자명'], o['판매채널명'], o['메일주소']].some(function (v) {
      var t = txt(v); return t && (t.indexOf(qt) >= 0 || (t.length >= 2 && qt.indexOf(t) >= 0));
    });
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function line(o, keys) {
    return keys.map(function (k) { return o[k] ? '<b>' + esc(k) + '</b> ' + esc(o[k]) : ''; }).filter(Boolean).join(' · ');
  }

  function render(q, data) {
    var res = document.getElementById('dupSearchResult');
    if (!res) return;
    var box = document.getElementById('oebuFlagBox');
    if (!box) { box = document.createElement('div'); box.id = 'oebuFlagBox'; res.parentNode.insertBefore(box, res.nextSibling); }
    var p = data.problem.filter(function (o) { return hit(o, q); });
    var g = data.group.filter(function (o) { return hit(o, q); });
    var h = '';
    if (p.length) {
      h += '<div style="margin-top:12px;padding:14px 16px;border-radius:10px;border:1.5px solid #c2303f;background:#fbecee;color:#5a1219;font-size:14px;line-height:1.6">'
        + '<div style="font-weight:700;margin-bottom:6px">⚠️ 문제 업체 — 외부유통 미팅에서 공유된 업체예요</div>'
        + p.map(function (o) { return '<div>' + line(o, ['사업자명', '사업자번호', '판매채널명', '연락처', '메일주소', '문제 내용']) + '</div>'; }).join('')
        + '<div style="margin-top:6px;font-size:12px"><a href="' + PAGE_URL + '" target="_blank" rel="noopener" style="color:inherit">문제 업체 공유 보기 ↗</a></div></div>';
    }
    if (g.length) {
      h += '<div style="margin-top:12px;padding:14px 16px;border-radius:10px;border:1.5px solid #2f5fb3;background:#eaf1fc;color:#13284d;font-size:14px;line-height:1.6">'
        + '<div style="font-weight:700;margin-bottom:6px">🏢 그룹 자회사</div>'
        + g.map(function (o) { return '<div>' + line(o, ['사업자명', '사업자번호', '판매채널명', '연락처', '메일주소']) + '</div>'; }).join('')
        + '</div>';
    }
    box.innerHTML = h;
  }

  function run() {
    var inp = document.getElementById('dupSearchInput');
    var q = inp ? inp.value.trim() : '';
    if (!q) { var b = document.getElementById('oebuFlagBox'); if (b) b.innerHTML = ''; return; }
    load().then(function (d) { setTimeout(function () { render(q, d); }, 300); }).catch(function () {});
  }

  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('#dupSearchBtn')) run(); }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target && e.target.id === 'dupSearchInput') run(); }, true);
})();
