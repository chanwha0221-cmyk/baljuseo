/* ════════════════════════════════════════════════════════════════
   🖼 상세메이커 새 양식 (dm-ss.js) — 홍팀장 2026-11-04 "이걸로 가자"
   ────────────────────────────────────────────────────────────────
   상세메이커_업체용·팀용이 같이 쓴다. 고칠 땐 여기 한 곳만.
   · 긴 상세(build) + 한 장 요약(poster) 두 화면
   · 🔴 글은 상품 글(○ 원산지·스펙·먹는 법·매리트·Q&A)에 있는 문장만 쓴다.
        없는 말을 지어내지 않는다 — 판매 페이지에 그대로 나가는 글이라서.
   · 🔴 사진은 <img> 말고 배경 div(.gimg) 로 깐다. html2canvas 가 object-fit 을 몰라서
        <img> 로 하면 JPG 저장 때 사진이 찌그러진다. saveJpg 가 .gimg 를 weserv 로 바꿔 준다.
   · SVG 색은 속성으로 박는다(저장 때 CSS 가 안 먹음).
   ════════════════════════════════════════════════════════════════ */
window.DM_SS = (function () {
  var CSS = [
    '#dm-page .ss{font-family:"Gmarket","Malgun Gothic",sans-serif;color:#2a2420;word-break:keep-all;background:#fff}',
    '#dm-page .ss .ss-serif{font-family:"Noto Serif KR","Nanum Myeongjo",serif;font-weight:900}',
    '#dm-page .ss .ss-c{text-align:center}',
    '#dm-page .ss .ss-red{color:#a8151c}',
    '#dm-page .ss .ss-ph{background-size:cover;background-position:center;width:100%}',
    '#dm-page .ss .ss-p{padding:84px 56px}',
    '#dm-page .ss .ss-h2{font-size:50px;line-height:1.3;letter-spacing:-1.5px}',
    '#dm-page .ss .ss-lead{font-size:29px;line-height:1.65;color:#5b5048;font-weight:500}',
    /* 히어로 */
    '#dm-page .ss .ss-hero{background:#dcc9ae;padding:84px 40px 50px;text-align:center}',
    '#dm-page .ss .ss-hero h1{color:#2b1a10;line-height:1.16;letter-spacing:-3px;margin:0 0 10px}',
    '#dm-page .ss .ss-weight{font-size:58px;color:#5e4a3a;margin-bottom:24px}',
    '#dm-page .ss .ss-pill{display:inline-block;background:#2a2320;color:#fff;font-size:29px;font-weight:500;padding:12px 40px;border-radius:40px}',
    '#dm-page .ss .ss-quote{font-size:31px;line-height:1.5;color:#4a3a2c;margin-top:34px;font-weight:500}',
    /* 아이콘 칸 */
    '#dm-page .ss .ss-icons{background:#f5f5f3;padding:76px 36px;display:flex;flex-wrap:wrap;justify-content:center}',
    '#dm-page .ss .ss-ic{width:50%;text-align:center;padding:24px 8px}',
    '#dm-page .ss .ss-o{width:220px;height:220px;border-radius:50%;background:#7a4a2e;margin:0 auto 22px;display:flex;align-items:center;justify-content:center}',
    '#dm-page .ss .ss-ic p{font-size:27px;color:#5b5048;line-height:1.4}',
    '#dm-page .ss .ss-ic b{display:block;font-size:31px;font-weight:700;color:#2a2420}',
    /* 말풍선·체크포인트 */
    '#dm-page .ss .ss-bubble{display:inline-block;background:#1f2b3a;color:#fff;font-size:40px;font-weight:700;padding:22px 48px;border-radius:50px}',
    '#dm-page .ss .ss-hook{background:#efe5d6}',
    '#dm-page .ss .ss-hook .ss-lead{margin-top:42px;color:#3c332c}',
    '#dm-page .ss .ss-tag{display:inline-block;background:#1f5fa8;color:#fff;font-size:27px;font-weight:700;padding:8px 40px}',
    '#dm-page .ss .ss-cp{padding:80px 56px 44px;text-align:center;background:#fff}',
    '#dm-page .ss .ss-cp h3{font-size:42px;line-height:1.38;font-weight:900;color:#1f5fa8;margin:24px 0 14px;letter-spacing:-1.3px}',
    '#dm-page .ss .ss-cp p{font-size:28px;color:#5b5048;line-height:1.65;font-weight:500}',
    /* 구성 */
    '#dm-page .ss .ss-box{background:#fbf6ee}',
    '#dm-page .ss .ss-call{display:flex;gap:26px;margin-top:44px}',
    '#dm-page .ss .ss-dash{flex:1;min-width:0;border:4px dashed #c8423f;border-radius:26px;padding:14px;background:#fff}',
    '#dm-page .ss .ss-dash .ss-ph{height:338px;border-radius:14px}',
    '#dm-page .ss .ss-dash p{font-size:29px;font-weight:900;padding:18px 6px 8px;text-align:center;line-height:1.35}',
    /* 사진 칸 */
    '#dm-page .ss .ss-grid{display:flex;flex-wrap:wrap;gap:22px;margin-top:50px}',
    '#dm-page .ss .ss-grid .ss-ph{width:363px;height:363px;border-radius:26px;border:3px solid #cdb999}',
    '#dm-page .ss .ss-grid .ss-wide{width:100%;height:560px}',
    /* TIP·순서 */
    '#dm-page .ss .ss-tip{background:#ffe94a;display:inline-block;font-size:28px;font-weight:700;line-height:1.5;padding:8px 18px;margin-top:10px}',
    '#dm-page .ss .ss-step{display:flex;align-items:center;gap:28px;background:#fbf6ee;border-radius:26px;padding:28px 34px;margin-top:20px;text-align:left}',
    '#dm-page .ss .ss-num{flex:0 0 88px;height:88px;border-radius:50%;background:#7a4a2e;color:#fff;font-size:38px;font-weight:900;display:flex;align-items:center;justify-content:center}',
    '#dm-page .ss .ss-step span{font-size:29px;line-height:1.5;font-weight:500}',
    /* Q&A·표 */
    '#dm-page .ss .ss-qa{background:#f4eadb}',
    '#dm-page .ss .ss-q{background:#fff;border-radius:26px;padding:36px 40px;margin-top:24px}',
    '#dm-page .ss .ss-q b{font-size:32px;font-weight:900;display:block;margin-bottom:12px;line-height:1.4}',
    '#dm-page .ss .ss-q p{font-size:27.5px;line-height:1.62;color:#5b5048}',
    '#dm-page .ss table.ss-tb{width:100%;border-collapse:collapse;margin-top:44px;font-size:27px}',
    '#dm-page .ss .ss-tb th,#dm-page .ss .ss-tb td{border-bottom:2px solid #e8dfd2;padding:20px 8px;text-align:left;line-height:1.5;vertical-align:top;background:none;color:#2a2420}',
    '#dm-page .ss .ss-tb th{width:200px;font-weight:700;color:#7a4a2e}',
    '#dm-page .ss .ss-end{background:#f7f3ec;padding:86px 40px 56px;text-align:center;font-size:42px;line-height:1.5;font-weight:700;letter-spacing:-1px}',
    '#dm-page .ss .ss-foot{background:#2a2320;color:#fff;text-align:center;font-size:28px;padding:30px;font-weight:700}',
    /* ── 한 장 요약 ── */
    '#dm-page .sp{font-family:"Gmarket","Malgun Gothic",sans-serif;color:#25201c;background:#fbf7ef;word-break:keep-all;padding-bottom:12px}',
    '#dm-page .sp .sp-b{font-family:"Black Han Sans","Gmarket",sans-serif;font-weight:400}',
    '#dm-page .sp .sp-hero{position:relative;height:500px;background-size:cover;background-position:center}',
    '#dm-page .sp .sp-fade{position:absolute;left:0;top:0;bottom:0;width:620px;background:linear-gradient(90deg,rgba(255,255,255,.96) 0%,rgba(255,255,255,.88) 66%,rgba(255,255,255,0) 100%)}',
    '#dm-page .sp .sp-t{position:absolute;left:30px;top:30px;width:520px}',
    '#dm-page .sp .sp-t h1{color:#111;line-height:1.1;letter-spacing:-1.5px;margin:0 0 12px}',
    '#dm-page .sp .sp-w{display:inline-block;background:#b5121b;color:#fff;font-size:30px;padding:0 16px;border-radius:8px;font-weight:900;margin-bottom:12px}',
    '#dm-page .sp .sp-chk{display:block;width:max-content;max-width:510px;font-size:25px;font-weight:900;padding:6px 18px;margin-top:9px;line-height:1.35}',
    '#dm-page .sp .sp-r{background:#b5121b;color:#fff}',
    '#dm-page .sp .sp-y{background:#ffd93b;color:#111}',
    '#dm-page .sp .sp-four{display:flex;gap:8px;padding:12px 10px 0}',
    '#dm-page .sp .sp-f{flex:1;min-width:0;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #e6dccb}',
    '#dm-page .sp .sp-f .ss-ph{height:150px;background-size:cover;background-position:center}',
    '#dm-page .sp .sp-f h3{background:#b5121b;color:#fff;font-size:21px;text-align:center;padding:7px 0;font-weight:900;margin:0}',
    '#dm-page .sp .sp-f p{font-size:18.5px;line-height:1.42;padding:11px 10px 13px;font-weight:500;color:#4e463f}',
    '#dm-page .sp .sp-row{display:flex;gap:10px;padding:14px 10px 0;align-items:stretch}',
    '#dm-page .sp .sp-pn{flex:1;min-width:0;background:#fff;border-radius:12px;border:1px solid #e6dccb;padding:12px;overflow:hidden;position:relative}',
    '#dm-page .sp .sp-ttl{display:block;width:max-content;background:#17407f;color:#fff;font-size:24px;padding:3px 18px 3px 12px;margin:-2px 0 11px -12px}',
    '#dm-page .sp .sp-ph{min-height:290px;padding:0;background-size:cover;background-position:center}',
    '#dm-page .sp .sp-comp{text-align:center;font-size:21px;font-weight:900;line-height:1.35}',
    '#dm-page .sp .sp-comp .ss-ph{height:176px;border-radius:8px;margin-bottom:8px;background-size:cover;background-position:center}',
    '#dm-page .sp .sp-li div{font-size:18.5px;padding:8px 0;border-bottom:1px dotted #c9bda9;display:flex;gap:8px;line-height:1.3}',
    '#dm-page .sp .sp-li b{flex:0 0 66px;font-weight:900;color:#17407f}',
    '#dm-page .sp .sp-text{font-size:20px;line-height:1.55;font-weight:500}'
  ].join('\n');

  /* 아이콘 — 색을 속성으로 박는다 */
  function svg(body, size) {
    var s = size || 120;
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 64 64" fill="none" stroke="#ffffff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">' + body + '</svg>';
  }
  var ICON = {
    origin: '<path d="M32 58C20 42 13 33 13 24a19 19 0 0 1 38 0c0 9-7 18-19 34Z"/><circle cx="32" cy="24" r="7"/>',
    weight: '<rect x="10" y="20" width="44" height="36" rx="5"/><circle cx="32" cy="38" r="11"/><path d="M32 38l6-6M18 20l4-10h20l4 10"/>',
    keep: '<path d="M32 6v52M9 19l46 26M55 19 9 45M32 15l-7-6M32 15l7-6M32 49l-7 6M32 49l7 6"/>',
    pack: '<path d="M8 20 32 8l24 12v26L32 58 8 46Z"/><path d="M8 20l24 12 24-12M32 32v26"/>',
    set: '<rect x="12" y="10" width="40" height="46" rx="5"/><path d="M22 24h20M22 34h20M22 44h12"/>'
  };

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function attr(s) { return esc(s).replace(/'/g, '%27').replace(/"/g, '%22'); }
  /* 숫자+% 는 빨갛게 — 글은 안 바꾸고 강조만 */
  function hi(s) { return esc(s).replace(/(\d[\d.,]*\s*%)/g, '<span class="ss-red">$1</span>'); }
  function ph(u, cls, style) { return u ? '<div class="gimg ss-ph ' + (cls || '') + '" style="background-image:url(\'' + attr(u) + '\');' + (style || '') + '"></div>' : ''; }
  function nameParts(title) {
    var t = String(title || '').trim();
    var m = t.match(/^(.+?)\s+(\d[\d.,~\-]*\s*(?:kg|g|ml|l|미|팩|개|마리|봉|입|세트|통|장|ea).*)$/i);
    return m ? { name: m[1], weight: m[2] } : { name: t, weight: '' };
  }
  function heroSize(name) { var n = name.length; return n <= 8 ? 94 : n <= 12 ? 76 : n <= 18 ? 62 : 50; }

  /* 상품 글 → 칸별로 나눈다 */
  function read(DATA) {
    var secs = DATA.sections || [], origin = [], rows = [], merit = [], qa = [], etc = [];
    secs.forEach(function (s) {
      var h = s.header || '', b = s.block || {};
      if (/원산지/.test(h)) origin = origin.concat(s.items || []);
      else if (b.type === 'spec') rows = rows.concat(b.rows || []);
      else if (b.type === 'qa') qa = qa.concat(b.items || []);
      else if (/매리트|메리트|장점/.test(h)) merit = merit.concat(s.items || []);
      else etc.push(s);
    });
    rows = rows.filter(function (r) { return r[1]; });
    var how = etc.shift() || null, steps = [], tips = [];
    if (how) {
      if (how.block && how.block.type === 'steps') { steps = how.block.steps || []; tips = how.block.intro || []; }
      else tips = how.items || [];
    }
    tips = tips.filter(function (l) { return !/^\[.*\]$/.test(l); });
    /* 매리트 → 앞부분 + CHECK POINT 최대 3개 (한 묶음 첫 줄이 제목) */
    var lead = merit.slice(), cps = [], n = merit.length;
    if (n > 3) {
      var ln = Math.min(3, Math.ceil(n * 0.3)), rest = merit.slice(ln), k = Math.min(3, Math.max(1, Math.floor(rest.length / 2))), size = Math.ceil(rest.length / k);
      lead = merit.slice(0, ln);
      for (var i = 0; i < k; i++) {
        var g = rest.slice(i * size, (i + 1) * size);
        if (g.length) cps.push({ head: g[0], body: g.slice(1) });
      }
    }
    function row(re) { for (var i = 0; i < rows.length; i++) if (re.test(rows[i][0])) return rows[i][1]; return ''; }
    var originPairs = origin.map(function (l) { return l.replace(/\s*[:：]\s*/, ' '); });
    return { origin: originPairs, rows: rows, lead: lead, cps: cps, qa: qa, steps: steps, tips: tips, etc: etc,
      weight: row(/중량|사이즈/), keep: row(/생물/), pack: row(/포장/), set: row(/구성/) };
  }
  /* 사진 나누기: 1번=실물, 3번=히어로, 끝 2장=중량·포장(메이커 원래 약속), 나머지=본문 */
  function split(photos) {
    var p = (photos || []).slice(), tail = [];
    if (p.length >= 6) tail = p.splice(-2);
    var pack = p[0] || '', hero = p[2] || p[0] || '';
    var mid = p.filter(function (u, i) { return i !== 0 && i !== 2; });
    return { pack: pack, hero: hero, tail: tail, mid: mid };
  }
  function short(v, n) { v = String(v || ''); return v.length > n ? v.slice(0, n - 1) + '…' : v; }

  function build(DATA, photos, brand, noticeHtml) {
    var d = read(DATA), P = split(photos), np = nameParts(DATA.title), mid = P.mid.slice(), h = '';
    var sub = DATA.subtitle || '';
    /* 1 히어로 */
    h += '<div class="ss"><div class="ss-hero">';
    if (brand) h += '<div class="ss-serif ss-ed" style="font-size:34px;margin-bottom:8px">' + esc(brand) + '</div>';
    h += '<h1 class="ss-serif ss-ed" style="font-size:' + heroSize(np.name) + 'px">' + esc(np.name) + '</h1>';
    if (np.weight) h += '<div class="ss-serif ss-weight ss-ed">' + esc(np.weight) + '</div>';
    if (d.origin.length) h += '<span class="ss-pill ss-ed">' + esc(d.origin.slice(0, 2).join(' / ')) + '</span>';
    if (sub) h += '<div class="ss-quote ss-ed">“' + esc(sub) + '”</div>';
    h += '</div>' + ph(P.hero, '', 'height:680px');
    /* 아이콘 4칸 — 스펙에 있는 것만 */
    var ics = [];
    if (d.origin[0]) ics.push(['origin', '원산지', d.origin[0]]);
    if (d.weight) ics.push(['weight', '중량', d.weight]);
    if (d.keep) ics.push(['keep', '보관 상태', d.keep]);
    if (d.pack) ics.push(['pack', '포장', d.pack]);
    if (ics.length < 4 && d.set) ics.push(['set', '구성', d.set]);
    if (ics.length) {
      h += '<div class="ss-icons">' + ics.slice(0, 4).map(function (c) {
        return '<div class="ss-ic"><div class="ss-o">' + svg(ICON[c[0]]) + '</div><p class="ss-ed">' + esc(c[1]) + '<b>' + esc(short(c[2], 22)) + '</b></p></div>';
      }).join('') + '</div>';
    }
    /* 2 매리트 앞부분 */
    if (d.lead.length) {
      h += '<div class="ss-hook ss-p ss-c"><div class="ss-bubble ss-ed">이 상품, 이래서 좋습니다! 😄</div><p class="ss-lead ss-ed">' + d.lead.map(hi).join('<br>') + '</p></div>';
      if (mid.length) h += ph(mid.shift(), '', 'height:640px');
    }
    /* 3 CHECK POINT */
    d.cps.forEach(function (c, i) {
      h += '<div class="ss-cp"><span class="ss-tag">CHECK POINT 0' + (i + 1) + '</span><h3 class="ss-ed">' + hi(c.head) + '</h3>';
      if (c.body.length) h += '<p class="ss-ed">' + c.body.map(hi).join('<br>') + '</p>';
      h += '</div>';
      if (mid.length) h += ph(mid.shift(), '', 'height:640px');
    });
    /* 4 구성 */
    if (P.pack || P.tail.length) {
      h += '<div class="ss-box ss-p ss-c"><h2 class="ss-h2 ss-serif ss-ed">' + esc(np.name) + (np.weight ? ' <span class="ss-red">' + esc(np.weight) + '</span>' : '') + '</h2>';
      h += '<p class="ss-lead" style="margin-top:12px">이렇게 받으십니다</p>';
      if (P.pack) h += ph(P.pack, '', 'height:680px;border-radius:24px;margin-top:40px');
      if (P.tail.length) {
        var cap = [d.weight ? '중량 ' + d.weight : (d.set || '실제 모습'), d.pack || '포장 모습'];
        h += '<div class="ss-call">' + P.tail.map(function (u, i) { return '<div class="ss-dash">' + ph(u) + '<p class="ss-ed">' + esc(short(cap[i], 26)) + '</p></div>'; }).join('') + '</div>';
      }
      h += '</div>';
    }
    /* 5 더 맛있게 — 먹는 법 글 + 남은 사진(끝 한 장은 마무리로) */
    var endPhoto = mid.length > 1 ? mid.pop() : '';
    if (mid.length || d.tips.length) {
      h += '<div class="ss-p ss-c"><h2 class="ss-h2 ss-serif ss-ed">' + esc(np.name) + ',<br><span class="ss-red">더 맛있게 즐기기</span></h2>';
      if (d.tips.length) h += '<p class="ss-lead ss-ed" style="margin-top:22px">' + d.tips.map(hi).join('<br>') + '</p>';
      if (mid.length) {
        var odd = mid.length % 2 === 1;
        h += '<div class="ss-grid">' + mid.map(function (u, i) { return ph(u, odd && i === mid.length - 1 ? 'ss-wide' : ''); }).join('') + '</div>';
      }
      h += '</div>';
    }
    /* 6 순서 */
    if (d.steps.length) {
      h += '<div class="ss-p ss-c" style="background:#fff;padding-top:0"><h2 class="ss-h2 ss-serif ss-ed" style="margin-bottom:26px">이렇게 드세요</h2>';
      h += d.steps.map(function (t, i) { return '<div class="ss-step"><div class="ss-num">' + (i < 9 ? '0' : '') + (i + 1) + '</div><span class="ss-ed">' + hi(t) + '</span></div>'; }).join('') + '</div>';
    }
    /* 그 밖의 칸 — 글이 있으면 빠뜨리지 않는다 */
    d.etc.forEach(function (s) {
      if (!(s.items || []).length) return;
      h += '<div class="ss-p ss-c ss-box">' + (s.header ? '<h2 class="ss-h2 ss-serif ss-ed">' + esc(s.header) + '</h2>' : '') + '<p class="ss-lead ss-ed" style="margin-top:20px">' + s.items.map(hi).join('<br>') + '</p></div>';
    });
    /* 7 Q&A */
    if (d.qa.length) {
      h += '<div class="ss-qa ss-p"><h2 class="ss-h2 ss-serif ss-c ss-ed">알고 먹으면 더 맛있어요</h2><div style="margin-top:30px">';
      h += d.qa.map(function (q) { return '<div class="ss-q"><b class="ss-ed"><span class="ss-red">Q.</span> ' + esc(q[0]) + '</b><p class="ss-ed">' + esc(q[1]).replace(/\n/g, '<br>') + '</p></div>'; }).join('');
      h += '</div></div>';
    }
    /* 8 제품 정보 — 스펙 줄 전부 그대로 */
    if (d.rows.length || d.origin.length) {
      h += '<div class="ss-p" style="background:#fff"><h2 class="ss-h2 ss-serif ss-c ss-ed">제품 정보</h2><table class="ss-tb">';
      h += '<tr><th>제품명</th><td class="ss-ed">' + esc(DATA.title) + '</td></tr>';
      if (d.origin.length) h += '<tr><th>원산지</th><td class="ss-ed">' + esc(d.origin.join(' / ')) + '</td></tr>';
      h += d.rows.map(function (r) { return '<tr><th>' + esc(r[0]) + '</th><td class="ss-ed">' + esc(r[1]) + '</td></tr>'; }).join('');
      h += '</table></div>';
    }
    /* 9 마무리 */
    if (sub) h += '<div class="ss-end ss-ed">' + esc(np.name) + '<br><span class="ss-red">' + esc(sub) + '</span></div>';
    h += ph(endPhoto, '', 'height:680px');
    if (brand) h += '<div class="ss-foot ss-ed">' + esc(brand) + '</div>';
    h += '</div>';
    return h + (noticeHtml ? noticeHtml() : '');
  }

  function poster(DATA, photos) {
    var d = read(DATA), P = split(photos), np = nameParts(DATA.title), mid = P.mid.slice(), h = '<div class="sp">';
    var size = Math.min(84, heroSize(np.name));
    h += '<div class="gimg sp-hero" style="background-image:url(\'' + attr(P.hero) + '\')"><div class="sp-fade"></div><div class="sp-t">';
    if (d.origin[0]) h += '<div class="ss-ed" style="font-size:28px;color:#17407f;font-weight:900;margin-bottom:6px">' + esc(d.origin.slice(0, 2).join(' · ')) + '</div>';
    h += '<h1 class="sp-b ss-ed" style="font-size:' + size + 'px">' + esc(np.name) + '</h1>';
    if (np.weight) h += '<div class="sp-w ss-ed">' + esc(np.weight) + '</div>';
    var checks = [];
    if (DATA.subtitle) checks.push(DATA.subtitle);
    if (d.keep || d.pack) checks.push([d.keep, d.pack].filter(Boolean).join(' · '));
    checks.slice(0, 2).forEach(function (c, i) { h += '<span class="sp-chk ss-ed ' + (i ? 'sp-y' : 'sp-r') + '">✔ ' + esc(short(c, 44)) + '</span>'; });
    h += '</div></div>';
    /* POINT 4칸 */
    var pts = d.cps.map(function (c) { return c.head; });
    d.lead.forEach(function (l) { if (pts.length < 4) pts.push(l); });
    pts = pts.slice(0, 4);
    if (pts.length) {
      h += '<div class="sp-four">' + pts.map(function (t, i) {
        return '<div class="sp-f">' + ph(mid[i] || P.hero) + '<h3>POINT ' + (i + 1) + '</h3><p class="ss-ed">' + hi(short(t, 60)) + '</p></div>';
      }).join('') + '</div>';
    }
    mid = mid.slice(pts.length);
    /* 실물 · 구성 · 정보 */
    var infos = [['제품명', DATA.title]];
    if (d.origin.length) infos.push(['원산지', d.origin.join(', ')]);
    d.rows.forEach(function (r) { if (r[1].length <= 26) infos.push([r[0].replace(/\s*\/\s*사이즈|여부/g, ''), r[1]]); });
    h += '<div class="sp-row">';
    if (P.pack) h += '<div class="gimg sp-pn sp-ph" style="background-image:url(\'' + attr(P.pack) + '\')"></div>';
    h += '<div class="sp-pn sp-comp"><div class="sp-ttl sp-b">제품 구성</div>' + ph(P.tail[0] || P.pack) + '<span class="ss-ed">' + esc(short(d.set || np.name, 30)) + '</span></div>';
    h += '<div class="sp-pn"><div class="sp-ttl sp-b">제품 정보</div><div class="sp-li">' + infos.slice(0, 6).map(function (r) { return '<div><b>' + esc(short(r[0], 5)) + '</b><span class="ss-ed">' + esc(r[1]) + '</span></div>'; }).join('') + '</div></div>';
    h += '</div>';
    /* 먹는 법 · 사진 */
    var howLines = d.steps.length ? d.steps.map(function (t, i) { return (i + 1) + '. ' + t; }) : d.tips.slice(0, 5);
    if (howLines.length) {
      h += '<div class="sp-row"><div class="sp-pn sp-text" style="flex:1.5"><div class="sp-ttl sp-b">이렇게 드세요</div><span class="ss-ed">' + howLines.map(hi).join('<br>') + '</span></div>';
      var last = mid[mid.length - 1] || P.hero;
      h += '<div class="gimg sp-pn sp-ph" style="min-height:240px;background-image:url(\'' + attr(last) + '\')"></div></div>';
    }
    return h + '</div>';
  }

  return { CSS: CSS, build: build, poster: poster, read: read };
})();
/* 스타일은 #dm-style 에 붙인다 — 상세메이커 [HTML 복사] 가 거기서 CSS 를 가져간다 */
(function () {
  var st = document.getElementById('dm-style');
  if (st) st.appendChild(document.createTextNode('\n' + window.DM_SS.CSS + '\n'));
})();
