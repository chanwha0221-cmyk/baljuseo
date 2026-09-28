/* qty-bridge.js — 수량 웹(service.masterc.co.kr/qty) 위에 얹는 발주 대조 패널
 * ─────────────────────────────────────────────────────────────────────────
 * 왜 여기(남의 페이지)에서 도느냐 :
 *   수량 웹은 마스터(본사) PHP 시스템이고 CORS 를 안 열어 준다 — 2026-09-28 실측:
 *   우리 도구(github.io)에서 fetch 하면 Failed to fetch. 로그인도 PHP 세션 쿠키뿐이라
 *   토큰 API 가 없다. 그래서 «수량 페이지 안에서» 도는 수밖에 없다(same-origin).
 *   다행히 그 페이지에 CSP 가 없어 외부 스크립트가 붙는다 → 북마크릿 한 줄로 이 파일을 싣는다.
 *
 * 쓰는 법 : 수량 화면에서 북마크릿 클릭 → 오른쪽 아래 패널.
 *
 * 🔴 이 파일은 «읽고 판정만» 한다. 잡기·대기·증량을 서버로 보내지 않는다.
 *    수량을 실제로 잡는 것은 홍팀장 손(숫자열 붙여넣기) — 자동 쓰기는 실증 뒤 2단계.
 *
 * 판정 규칙 (홍팀장 2026-09-28 확정) :
 *    부족분 = 필요수량 − 이미 잡은 수량(마찬 칸)
 *    부족분 ≤ 잔여              → 그냥 더 잡기(set)
 *    잔여로 못 채우는 몫 ≤ 5개  → 대기(wait)      ← 관리팀 일 안 만들고 남이 풀면 받는다
 *    잔여로 못 채우는 몫 > 5개  → 증량요청(more)
 */
(function () {
  'use strict';
  if (window.__QTYB) { window.__QTYB.open(); return; }

  var WAIT_MAX = 5;                 // 이 개수까지는 증량요청 대신 대기 (패널에서 바꿀 수 있다)
  var PANEL_ID = 'qtyb-panel';

  /* 🔴 화면을 가리지 않는다 (홍팀장 2026-09-28 : 「그냥 수량 사이트 어디서나 나오게 해야지」).
     수량 화면이든 마이페이지든 공지든, 북마크릿을 누르면 «같은 패널·같은 기능»이 뜬다.
     잡기·사용·대기·증량은 전부 POST 로 걸고, 잡은 현황·안 쓴 것은 마이페이지를 긁어 오므로
     그 화면에 서 있을 필요가 없다. */
  var NKEY = 'qtybNeed';            // 발주 필요수량 — 화면이 바뀌어도 이어 쓴다(같은 오리진)

  /* ── 상품명 정규화 ────────────────────────────────────────────────
     수량 웹이 줄마다 박아 둔 data-k 가 "창고코드\t공백제거·대문자 상품명" 이다.
     우리 발주 상품명도 같은 자로 재야 맞는다.
     🔴 추측 매칭은 하지 않는다 — 한 글자라도 다르면 «못 찾음»으로 남겨 홍팀장이 본다.
        (상품명 완전일치 규칙. 창고명 접두어만 떼는 것이 유일한 예외) */
  function nk(s) {
    return String(s == null ? '' : s)
      .replace(/^\s*\[[^\]]*\]\s*/, '')        // [마스터/인천] 같은 머리표
      .replace(/^\s*\([^)]*\)\s*/, '')
      .replace(/ⓘ/g, '')
      .replace(/\s+/g, '')
      .toUpperCase();
  }
  function num(t) {
    var m = String(t == null ? '' : t).replace(/,/g, '').match(/-?\d+/);
    return m ? parseInt(m[0], 10) : 0;
  }

  /* ── 한 줄(tr) 읽기 ──────────────────────────────────────────────
     🟢 칸마다 data-c 이름이 박혀 있다(2026-09-28 실측) — 번호로 세지 말고 이름으로 집는다.
        gubun · exp · wh · name · price · courier · ship · tax · total · sold ·
        remain · cut(발주마감) · sum(잡힘 전체) · ours(우리 잡음) · wait · mine(마찬 편집칸)
        번호로 세면 칸 하나 늘 때 값이 통째로 밀린다. */
  /* 🔴 수량 웹의 표만 집는다. 내 패널에도 표가 있어서 'tbody tr' 로 쓸면 내 줄이 섞인다
     (2026-09-28 첫 판에 섞여서 붙여넣기 숫자열이 3줄 밀렸다 — 그대로 붙였으면 다른 상품이 잡혔다). */
  function siteRows(root) {
    var out = [];
    [].forEach.call((root || document).querySelectorAll('tbody'), function (tb) {
      if (tb.closest && tb.closest('#' + PANEL_ID)) return;
      [].forEach.call(tb.children, function (tr) { if (tr.tagName === 'TR') out.push(tr); });
    });
    return out;
  }

  function cell(tr, c) { return tr.querySelector('[data-c="' + c + '"]'); }
  function ctext(tr, c) { var e = cell(tr, c); return e ? (e.textContent || '').trim() : ''; }

  function readRow(tr, whFallback) {
    var nmCell = cell(tr, 'name');
    if (!nmCell) return null;
    var k = tr.getAttribute('data-k') || '';
    var name = (nmCell.textContent || '').replace(/ⓘ/g, '').trim();
    var mineCell = cell(tr, 'mine');
    var leftRaw = ctext(tr, 'remain');
    var total = num(ctext(tr, 'total'));
    /* 🟢 잔여가 「넉넉」 — 수량을 안 잡고 써도 되는 상품이다 (홍팀장 2026-09-28).
       총수량이 0으로 보이지만 품절이 아니다 → 증량요청도, 대기도 걸 일이 없다.
       숫자가 아닌 표시는 전부 여기로 본다(잔여를 0으로 읽어 증량요청을 내던 오판을 막는다). */
    var free = !!leftRaw && !/\d/.test(leftRaw);
    return {
      k: k,
      key: k ? k.split('\t')[1] || nk(name) : nk(name),
      wh: ctext(tr, 'wh') || whFallback || '',
      kind: ctext(tr, 'gubun'),                 // 당일 / 상시
      name: name,
      price: num(ctext(tr, 'price')),
      total: total,
      sold: num(ctext(tr, 'sold')),
      left: num(leftRaw),
      leftRaw: leftRaw,
      dlRaw: ctext(tr, 'cut'),
      held: num(ctext(tr, 'sum')),
      ours: num(ctext(tr, 'ours')),
      waiting: num(ctext(tr, 'wait')),
      mine: num(mineCell ? mineCell.textContent : ''),
      co: mineCell ? (mineCell.getAttribute('data-co') || '') : '',   // 우리 회사 이름(마찬) — 잡을 때 같이 보낸다
      editable: !!mineCell,
      free: free,
      // 총수량 0 인 줄은 오늘 못 파는 줄이다(수량 웹도 [한꺼번에]에서 건너뛴다) — 단 「넉넉」은 빼고.
      closed: total <= 0 && !free,
      /* 🚫 상품명에 창고가 「품절 안 풀림」 이라 적어 둔 줄 — 오늘은 안 나온다는 뜻이다.
         대기를 걸어 봐야 남이 풀 물건 자체가 없다 → 증량요청으로 빨리 찔러 보고, 거부되면 포기한다
         (홍팀장 2026-09-28 : 「안풀림 애들은 오늘 안나온다는 거거든, 증량 요청 올려서 빠르게
          확인해 보고 안되면 포기하는게 맞아」). */
      stuck: /안\s*풀림/.test(name)
    };
  }

  /* ── 창고 칩 모으기 ──────────────────────────────────────────────
     전체 창고 탭은 200줄에서 끊긴다(2026-09-28 실측 : 1,778건 중 200줄만 렌더).
     창고별로는 안 끊긴다(단독(유) 291줄 확인) → 창고 칩을 하나씩 돌아 긁는다.
     🔴 창고 코드는 tab 파라미터다(경기28 · 단독(유)28 …). sec 은 당일/상시 구분이고
        sec=* 가 «전부»다 — 여기를 바꿔 잡으면 빈 표가 온다(첫 판에 한 번 틀렸다). */
  function chipsFrom(doc) {
    var out = [], seen = {};
    [].forEach.call(doc.querySelectorAll('a[href]'), function (a) {
      var u;
      try { u = new URL(a.getAttribute('href'), location.origin + useUrl()); } catch (e) { return; }
      if (u.pathname !== useUrl()) return;
      var tab = u.searchParams.get('tab');
      if (!tab || tab === '*' || seen[tab]) return;
      seen[tab] = 1;
      out.push({ tab: tab, label: (a.textContent || '').replace(/[\d,]+\s*$/, '').trim() });
    });
    return out;
  }
  /* 마이페이지에는 창고 칩이 없다 — 그럴 때는 수량 화면을 한 번 불러와 칩을 가져온다.
     (홍팀장이 마이페이지에서 부족분을 잡으려 할 때 「창고 칩을 못 찾음」 으로 멈추던 것) */
  function getChips() {
    var c = chipsFrom(document);
    if (c.length) return Promise.resolve(c);
    return fetch(useUrl(), { credentials: 'same-origin' })
      .then(function (r) { return r.text(); })
      .then(function (html) { return chipsFrom(new DOMParser().parseFromString(html, 'text/html')); })
      .catch(function () { return []; });
  }

  /* 창고 한 곳 긁기 — 같은 오리진이라 쿠키가 실려 간다(로그인 세션 그대로). */
  function fetchSec(tab) {
    var p = new URLSearchParams();
    p.set('tab', tab);
    p.set('sec', '*');
    // 🔴 useUrl() 이다 — location.pathname 을 쓰면 마이페이지에 tab 을 붙여 빈 표를 받는다(2026-09-28)
    return fetch(useUrl() + '?' + p.toString(), { credentials: 'same-origin' })
      .then(function (r) { return r.text(); })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var rows = [];
        siteRows(doc).forEach(function (tr) {
          var o = readRow(tr, '');
          if (o && o.key) rows.push(o);
        });
        return rows;
      });
  }

  /* ── 마이페이지 — 증량요청 · 내가 건 대기 · 사다리 ─────────────────
     홍팀장 2026-09-28 : 「증량관리 · 사다리타기 · 내가 건 대기 를 전체적으로 다 보면 됨.
       갓성비 암게는 증량 요청했는데 까였고 대기까지 걸었잖아. 저게 몇 개라도 들어온다면 더 되겠지만
       오늘은 안 된다고 봐야겠지」
     → 부족분을 어떻게 메울지는 이 셋을 같이 봐야 정해진다. 이미 «거부» 맞은 것에 증량을 또 걸면 안 되고,
       이미 대기 걸어 둔 것에 대기를 또 걸 일도 없다. 둘 다 막힌 것이 「따로 구해야 할 수량」이다.
     🔴 이 표들엔 data-k · data-c 가 없다 — 머리글 이름으로 칸을 찾는다(번호로 세면 칸 하나 늘 때 밀린다). */
  var MORE = {}, WAIT = {}, OURS = {}, DRAW = {};

  function colOf(th, re) {
    for (var i = 0; i < th.length; i++) if (re.test(th[i])) return i;
    return -1;
  }
  function fetchMy(v) {
    var p = new URLSearchParams();
    p.set('v', v);
    return fetch('my.php?' + p.toString(), { credentials: 'same-origin' })
      .then(function (r) { return r.text(); })
      .then(function (html) {
        var d = new DOMParser().parseFromString(html, 'text/html');
        var th = [].map.call(d.querySelectorAll('thead th'), function (e) { return (e.textContent || '').trim(); });
        var out = [];
        siteRows(d).forEach(function (tr) {
          var c = [].map.call(tr.children, function (e) {
            /* 「사용」 칸은 <input> 이라 글자가 없다 — 적어 둔 값은 value 속성에 있다.
               이걸 안 보면 사용량이 전부 0 으로 읽혀 «잡고 안 썼다» 는 헛경고가 뜬다(2026-09-28). */
            var inp = e.querySelector && e.querySelector('input');
            if (inp) return (inp.getAttribute('value') || '').trim();
            return (e.textContent || '').replace(/\s+/g, ' ').trim();
          });
          if (!c.length) return;
          out.push({ th: th, c: c });
        });
        return { th: th, rows: out };
      })
      .catch(function () { return { th: [], rows: [] }; });
  }

  function loadMy() {
    MORE = {}; WAIT = {}; OURS = {}; DRAW = {};
    return Promise.all([fetchMy('more'), fetchMy('wait'), fetchMy('ours'), fetchMy('draw')])
      .then(function (r) {
        var more = r[0], wait = r[1], ours = r[2], draw = r[3];

        // 증량요청 — 「더 필요」 개수와 「상태」(거부 · 승인 · 빈값=답 기다림)
        var iN = colOf(more.th, /상품명/), iQ = colOf(more.th, /더 필요/), iS = more.th.length - 1,
            iA = colOf(more.th, /사유|답/), iW = colOf(more.th, /^창고/);
        more.rows.forEach(function (x) {
          var k = nk(x.c[iN]); if (!k) return;
          var st = S(x.c[iS]);
          var o = MORE[k] || { qty: 0, no: 0, ok: 0, pend: 0, wh: '', ans: '' };
          o.qty += num(x.c[iQ]);
          o.wh = o.wh || (iW >= 0 ? x.c[iW] : '');
          if (/거부|반려|안 ?됨/.test(st)) o.no++;
          else if (/승인|완료|늘림/.test(st)) o.ok++;
          else o.pend++;                                  // 답을 아직 안 준 것
          if (iA >= 0 && !o.ans) o.ans = x.c[iA].slice(0, 60);
          MORE[k] = o;
        });

        // 내가 건 대기 — 「기다리는 수량」과 「받은 수량」
        var jN = colOf(wait.th, /상품명/), jQ = colOf(wait.th, /기다리는/), jG = colOf(wait.th, /받은/),
            jS = wait.th.length - 1;
        wait.rows.forEach(function (x) {
          var k = nk(x.c[jN]); if (!k) return;
          var o = WAIT[k] || { qty: 0, got: 0, pend: 0, done: 0 };
          o.qty += num(x.c[jQ]);
          o.got += num(x.c[jG]);                          // '—' 은 0 으로 읽힌다
          if (/기다리는/.test(S(x.c[jS]))) o.pend++; else o.done++;
          WAIT[k] = o;
        });

        // 우리가 잡은 것 — 「사용」과 「안 쓴 것」. 2·3단계(실발주·안 쓴 것 감시)가 이걸 쓴다.
        var oN = colOf(ours.th, /상품명/), oG = colOf(ours.th, /잡은/), oU = colOf(ours.th, /^사용/),
            oL = colOf(ours.th, /안 쓴/), oW = colOf(ours.th, /^창고/);
        ours.rows.forEach(function (x) {
          var k = nk(x.c[oN]); if (!k) return;
          OURS[k] = {
            wh: oW >= 0 ? x.c[oW] : '',
            got: num(x.c[oG]),
            used: oU >= 0 ? num(x.c[oU]) : 0,
            unused: oL >= 0 ? num(x.c[oL]) : 0
          };
        });

        // 사다리 — 당첨 줄만 쓸모가 있다(참가 중은 결과가 없다)
        var dN = colOf(draw.th, /상품명/), dS = draw.th.length - 1;
        draw.rows.forEach(function (x) {
          var k = nk(x.c[dN]); if (!k) return;
          DRAW[k] = { state: S(x.c[dS]) };
        });
      });
  }
  function S(v) { return String(v == null ? '' : v).trim(); }

  /* ── 마감시각 ───────────────────────────────────────────────────
     "연장마감 : 16시" · "오후마감 : 14시" → 16 / 14. 남은 시간은 한국시간으로 센다. */
  function dlHour(s) {
    var m = String(s || '').match(/(\d{1,2})\s*시/);
    return m ? parseInt(m[1], 10) : null;
  }
  function kstNow() {
    var p = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date()).split(':');
    return parseInt(p[0], 10) + parseInt(p[1], 10) / 60;
  }
  function minsLeft(dl) {
    if (dl == null) return null;
    return Math.round((dl - kstNow()) * 60);
  }

  /* ── 필요수량 붙여넣기 읽기 ──────────────────────────────────────
     "상품명<탭>수량" 또는 "상품명 수량" 한 줄씩. 같은 상품이 여러 줄이면 더한다
     (발주가 업체별로 쪼개져 오므로 합산이 맞다). */
  function parseNeed(text) {
    var map = {}, bad = [];
    String(text || '').split(/\r?\n/).forEach(function (ln) {
      var s = ln.trim();
      if (!s) return;
      var parts = s.split('\t');
      var nm, q;
      if (parts.length >= 3) {
        /* 「창고 · 상품명 · 수량」 — 발주 도구의 [📋 창고까지] 가 이 꼴로 낸다.
           🔴 맨 앞을 상품명으로 잡으면 창고 이름을 찾게 되니 반드시 끝에서 두 번째를 쓴다. */
        nm = parts[parts.length - 2];
        q = num(parts[parts.length - 1]);
      } else if (parts.length === 2) {
        nm = parts[0];
        q = num(parts[1]);
      } else {
        var m = s.match(/^(.*?)[\s·|]+(\d+)\s*(?:개|EA)?$/i);
        if (!m) { bad.push(s); return; }
        nm = m[1]; q = num(m[2]);
      }
      if (!nm || !q) { bad.push(s); return; }
      var k = nk(nm);
      map[k] = (map[k] || 0) + q;
      map['#raw:' + k] = nm.trim();
    });
    return { map: map, bad: bad };
  }

  /* ── 예외 상품 — 한 줄에서 여럿을 컨트롤한다 (홍팀장 2026-09-28) ──────
     ① 연어 : 「연안 몸뱃살연어 1kg」 한 줄이 연어 전체를 쥔다. 생연어 1kg·500g·300g,
              몸뱃살연어 500g 은 수량 웹에 이름은 있어도 총수량 0·잔여 「넉넉」 — 관리를 안 한다.
              → 무게를 다 더해 kg 으로 올려서 몸뱃살연어 1kg 에서 잡는다 (2.8kg → 3개).
              🔴 올림은 «오늘 전체 무게» 로 한 번만 한다. 줄마다 올리면 0.5+0.4 가 2개가 된다.
              🔴 연어 스테이크 200g · 연어머리 1팩 · 연어배꼽살 1팩 은 «자기 총수량이 있다» → 손대지 않는다.
     ② 홍어 : 삭힘정도만 다른 「흑산도 전통 홍어 500g(고수/중수/초고수/초수)」 는 총수량이 0이고,
              실제 수량은 「흑산도 전통 홍어 500g」 한 줄이 쥔다. 개수 그대로 합친다(무게 아님).
              🔴 「흑산도 전통 홍어 600g」·「연안 대청홍어」 는 다른 상품이다. */
  var ALIAS = [
    { name: '연어', to: '연안 몸뱃살연어 1kg', weight: true,
      hit: function (s) { return /(생연어|몸뱃살연어)/.test(s); } },
    { name: '홍어', to: '흑산도 전통 홍어 500g', weight: false,
      hit: function (s) { return /^흑산도\s*전통\s*홍어\s*500\s*g\s*[(（]/i.test(s); } }
  ];

  /* 이름에서 무게를 kg 으로 — 「500g」 0.5 · 「1kg」 1 · 「1.2kg」 1.2. 없으면 1개로 본다. */
  function kgOf(name) {
    var m = String(name).match(/(\d+(?:\.\d+)?)\s*(kg|g)\b/i);
    if (!m) return 1;
    var v = parseFloat(m[1]);
    return /kg/i.test(m[2]) ? v : v / 1000;
  }

  /* 필요수량 묶음에 예외를 먹인다. 반환 : {map, notes} — notes 는 화면에 뭘 합쳤는지 알리는 줄 */
  function foldAlias(map) {
    var notes = [];
    ALIAS.forEach(function (a) {
      var toKey = nk(a.to), from = [], sum = 0;
      Object.keys(map).forEach(function (k) {
        if (k.indexOf('#raw:') === 0) return;
        var raw = map['#raw:' + k] || k;
        if (!a.hit(raw)) return;
        if (k === toKey && !a.weight) return;              // 대표 줄 자신은 그대로 둔다
        from.push({ k: k, raw: raw, qty: map[k] });
        sum += a.weight ? kgOf(raw) * map[k] : map[k];
      });
      if (!from.length) return;
      var want = a.weight ? Math.ceil(sum) : sum;          // 무게는 오늘 전체를 한 번에 올린다
      from.forEach(function (f) { delete map[f.k]; delete map['#raw:' + f.k]; });
      map[toKey] = (map[toKey] || 0) + want;
      map['#raw:' + toKey] = a.to;
      notes.push('⚖️ ' + a.name + ' ' + from.length + '종'
        + (a.weight ? (' · ' + (Math.round(sum * 10) / 10) + 'kg') : (' · ' + sum + '개'))
        + ' → <b>' + esc(a.to) + ' ' + want + '개</b>로 합쳤습니다 ('
        + from.map(function (f) { return esc(f.raw) + '×' + f.qty; }).join(' · ') + ')');
    });
    return notes;
  }

  /* ── 판정 ───────────────────────────────────────────────────────── */
  function judge(row, need) {
    var mine = row.mine || 0;
    /* 🔴 «잡은 수량» 을 그대로 쓸 수 있는 몫으로 보면 안 된다 (2026-09-28 갑오징어) :
       ① 이미 «사용» 으로 적어 둔 몫은 다른 발주로 나갔다 → 빼야 한다.
       ② 품절 안 풀림이거나 총수량 0인데 잔여가 «음수» 인 줄은 창고에 물건이 없다.
          숫자만 30 잡혀 있을 뿐 실제로는 못 받는다 → 잡은 것을 0 으로 본다.
          (홍팀장 : 「초대왕 반건조 갑오징어 500g급 4개 있냐?」 — 없다. 재고 없음으로 빠져야 한다) */
    var mineUsed = (OURS[row.key] && OURS[row.key].used) || 0;
    var ghost = row.stuck || (row.closed && row.left < 0);
    var avail = ghost ? 0 : Math.max(0, mine - mineUsed);
    var short = need - avail;
    var r = { row: row, need: need, mine: mine, used: mineUsed, avail: avail, ghost: ghost,
              set: 0, wait: 0, more: 0, over: 0, act: 'ok', why: '' };

    /* 「넉넉」 — 수량을 안 잡고 써도 되는 상품. 손댈 일이 없다. */
    if (row.free) {
      r.act = 'free';
      r.why = '넉넉 — 수량 안 잡고 써도 되는 상품';
      return r;
    }

    if (short <= 0) {
      r.over = avail - need;          // 남는 몫은 «쓸 수 있는 것» 기준으로 센다(이미 쓴 몫 제외)
      // 마감이 가까운데 잡아만 두고 안 나간 몫 → 풀어야 한다
      var ml = minsLeft(dlHour(row.dlRaw));
      if (r.over > 0 && ml != null && ml <= 60) {
        r.act = 'release';
        r.why = '마감 ' + ml + '분 전 · 안 나간 몫 ' + r.over + '개';
      } else if (r.over > 0) {
        r.act = 'over';
        r.why = '여유 ' + r.over + '개';
      } else {
        r.why = '딱 맞음';
      }
      return r;
    }

    /* 🔴 잔여는 음수로 나올 수 있다 — 총수량보다 많이 잡힌 줄(품절 안 풀림 등)에서 -30 을 봤다.
       그대로 Math.min 에 넣으면 «-30개 잡기» 가 나온다. 0 으로 바닥을 깐다. */
    var leftAvail = Math.max(0, row.left);      // ⚠️ 위의 avail(우리가 쓸 수 있는 몫)과 다른 것 — 창고 잔여다
    var canSet = Math.min(short, leftAvail);
    if (canSet > 0) r.set = canSet;
    var rest = short - canSet;                 // 잔여로 못 채우는 몫
    if (rest <= 0) {
      r.act = 'set';
      r.why = '잔여 ' + row.left + '개 안에서 해결';
      return r;
    }

    /* 부족분을 어떻게 메우나 — 증량요청·대기 현황을 먼저 본다(홍팀장 2026-09-28).
       🔴 이미 «거부» 맞은 것에 증량을 또 걸지 않는다. 이미 걸어 둔 대기도 또 걸지 않는다.
          둘 다 막혔으면 그 수량은 «따로 구해야 할 것»이다 — 그게 오늘 못 파는 몫이다. */
    var mo = MORE[row.key], wa = WAIT[row.key], dr = DRAW[row.key];
    var got = wa ? wa.got : 0;                 // 대기로 이미 받은 것
    var hole = Math.max(0, rest - got);        // 아직 못 메운 몫
    r.rest = rest;
    r.hole = hole;
    /* 총수량 0 인 줄(오늘 안 올라온 상품)도 여기로 온다 — 증량요청·대기 현황을 봐야 하기 때문이다.
       예전에는 이 줄을 먼저 잘라 증량요청으로 보냈다가, 이미 «거부» 맞은 갑오징어를 또 증량으로 냈다. */
    var base = ghost
      ? ('창고에 물건이 없는 줄 — 잡아 둔 ' + mine + '개는 못 받습니다'
         + (row.left < 0 ? ' (총수량 0 · 잔여 ' + row.left + ')' : '') )
      : (row.closed
          ? ('총수량 0 — 오늘 안 올라온 상품' + (row.left < 0 ? ' (잔여 ' + row.left + ')' : ''))
          : ('잔여 ' + row.left + '개로 ' + rest + '개 부족'));

    if (mo && mo.no && wa && wa.pend) {
      // 갓성비 암게 꼴 — 증량은 까였고 대기는 걸어 뒀지만 아직 못 받았다
      r.hunt = hole;
      r.act = 'hunt';
      r.why = base + ' · 증량 거부 + 대기 ' + wa.qty + '개 걸어 둠(아직 못 받음)'
        + (mo.ans ? ' · 「' + mo.ans + '」' : '');
    } else if (mo && mo.no) {
      /* 증량은 막혔다 → 소량이면 대기로 돌린다. 다만 «안 풀림» 줄은 대기가 무의미하다
         (남이 풀 물건 자체가 없다) → 바로 포기하고 따로 구한다. */
      if (!row.stuck && hole <= WAIT_MAX) { r.wait = hole; r.act = 'wait'; r.why = base + ' · 증량 거부됨 → 대기로'; }
      else {
        r.hunt = hole; r.act = 'hunt';
        r.why = base + ' · 증량 거부됨' + (row.stuck ? ' · 오늘 안 나오는 줄' : '') + (mo.ans ? ' 「' + mo.ans + '」' : '');
      }
    } else if (mo && mo.pend) {
      r.act = 'moreP';
      r.why = base + ' · 증량 ' + mo.qty + '개 요청해 두고 답 기다림';
    } else if (row.stuck) {
      /* 🔴 「품절 안 풀림」 은 대기보다 먼저 본다 — 대기를 이미 걸어 뒀어도 기다릴 물건이 없다.
         증량요청으로 빨리 물어보는 것이 맞다(홍팀장 2026-09-28). */
      r.more = hole;
      r.act = r.set ? 'set+more' : 'more';
      r.why = base + ' · 오늘 안 나오는 줄 — 대기 말고 증량요청으로 확인'
        + (wa && wa.pend ? (' (대기 ' + wa.qty + '개는 걸려 있음)') : '');
    } else if (wa && wa.pend) {
      r.act = 'waitP';
      r.why = base + ' · 대기 ' + wa.qty + '개 걸어 둠' + (got ? (' · ' + got + '개 받음') : '');
    } else if (dr && /당첨/.test(dr.state)) {
      r.act = 'waitP';
      r.why = base + ' · 사다리 당첨 — 들어온 수량 확인';
    } else {
      // 아직 아무것도 안 걸었다 → 원래 규칙 (5개까지는 대기, 넘으면 증량요청)
      if (hole <= WAIT_MAX) { r.wait = hole; r.act = r.set ? 'set+wait' : 'wait'; }
      else { r.more = hole; r.act = r.set ? 'set+more' : 'more'; }
      r.why = base;
    }
    return r;
  }

  /* ══ 실제로 잡기·대기·증량요청 ═══════════════════════════════════════
     홍팀장 2026-09-28 : 「안 잡아 놨으니까 수량에서 찾아서 니가 잡아 줘야지, 필요하면 구하고」
                        「증량요청이 어디 있는데, 전혀 안 되어 있잖아」
     → 판정만 내고 손 떼면 안 된다. 판정대로 수량 웹에 실제로 건다.
     🔴 요청 형식은 수량 웹이 쓰는 그대로다(2026-09-28 페이지 코드에서 확인) :
        POST /qty/  ·  FormData
          잡기   do=set   · tab · nkey · co · val(잡을 총량) · name(상품명) · how=pop
          대기   do=wait  · tab · nkey · co · qty(기다릴 개수)
          증량   do=more  · tab · nkey · co · qty(더 필요한 개수) · why(사유)
          사용   do=used  · tab · nkey · co · val
     ⚠️ val 은 «더할 값»이 아니라 «그 칸의 총량»이다 — 이미 잡은 것에 더해 보내야 한다.
        (여우 칸에 덮어쓰기로 9+5=14 를 4 로 엎은 사고가 있었다) */
  var WHY_DEFAULT = '실제 발주 들어온 수량입니다.';

  /* 수량 웹의 밑동 주소 — /qty/my.php 든 /qty/notice.php 든 «/qty/» 로 맞춘다.
     잡기·사용·대기·증량은 전부 이 주소로 POST 한다(마이페이지가 아니다 — 2026-09-28 실측). */
  function useUrl() { return location.pathname.replace(/[^/]*$/, ''); }

  function qpost(fields) {
    var fd = new FormData();
    Object.keys(fields).forEach(function (k) { fd.append(k, String(fields[k])); });
    return fetch(useUrl(), { method: 'POST', body: fd, credentials: 'same-origin' })
      .then(function (r) { return r.text(); })
      .then(function (t) {
        var j = null;
        try { j = JSON.parse(t); } catch (e) {}
        if (j && j.ok === false) throw new Error(j.msg || j.error || '서버가 거절했습니다');
        return j || {};
      });
  }
  /* 🔎 실행 직전에 그 줄을 다시 읽는다 — 중복으로 잡거나 두 번 거는 것을 막는 장치.
     do=row 가 그 줄의 «지금» 상태를 준다 : cos(회사별 잡은 값) · waits(대기) · mores(답 안 온 증량요청).
     ⚠️ 긁은 때와 누르는 때 사이에 값이 바뀔 수 있다 — 홍팀장이 손으로 잡았거나, 다른 회사가 가져갔거나.
        그때 옛 숫자로 덮어쓰면 남이 잡은 걸 깎거나 우리 것을 두 번 잡는다. */
  function freshRow(row) {
    return qpost({ do: 'row', tab: whTab(row), nkey: row.key }).then(function (j) {
      var mine = 0, wq = 0, mq = 0;
      (j.cos || []).forEach(function (c) { if (c.me == 1 || c.co === row.co) mine = num(c.val); });
      (j.waits || []).forEach(function (w) { if (w.mine == 1 || w.co === row.co) wq += num(w.qty); });
      (j.mores || []).forEach(function (m) { if (m.mine == 1 || m.co === row.co) mq += (num(m.qty) || 1); });
      var used = (j.used && row.co && j.used[row.co] != null) ? num(j.used[row.co]) : 0;
      return { mine: mine, left: Math.max(0, num(j.remain)), wait: wq, more: mq, used: used };
    });
  }

  /* 잡기 — «그 칸의 총량»을 보낸다. 목표는 필요수량, 다만 잔여를 넘을 수는 없다.
     이미 목표만큼 잡혀 있으면 아무것도 보내지 않는다(두 번 눌러도 안전). */
  function actSet(x) {
    return freshRow(x.row).then(function (f) {
      var goal = Math.min(x.need, f.mine + f.left);
      if (goal <= f.mine) return { skip: '이미 ' + f.mine + '개 잡혀 있음' };
      return qpost({ do: 'set', tab: whTab(x.row), nkey: x.row.key, co: x.row.co,
                     val: goal, name: x.row.name, how: 'pop' })
        .then(function () { return { done: goal, was: f.mine }; });
    });
  }
  /* 사용 — 잡았으면 «쓴 수량»도 같이 적어 둔다 (홍팀장 2026-09-28 :
     「잡고 썼으면 쓴 수량으로 되어 있어야지, 여기 수량 파악 안 해 놓으면 잡고 안 썼다고 경고 뜰 거 아녀」).
     잡은 것보다 많이 쓸 수는 없으니 min(필요수량, 지금 잡은 것). 이미 그 값이면 안 보낸다. */
  function actUsed(x) {
    return freshRow(x.row).then(function (f) {
      var v = Math.min(x.need, f.mine);
      if (v <= 0) return { skip: '잡은 것이 없음' };
      if (v === f.used) return { skip: '이미 ' + v + '개로 적혀 있음' };
      return qpost({ do: 'used', tab: whTab(x.row), nkey: x.row.key, co: x.row.co, val: v })
        .then(function () { return { done: v, was: f.used }; });
    });
  }

  /* 대기 — 이미 걸어 둔 것이 있으면 또 걸지 않는다(줄이 두 개 서면 남의 몫까지 먹는다) */
  function actWait(x) {
    return freshRow(x.row).then(function (f) {
      if (f.wait > 0) return { skip: '이미 대기 ' + f.wait + '개 걸려 있음' };
      var q = Math.max(0, x.need - f.mine - f.left);
      if (!q) return { skip: '더 필요 없음(잔여로 채워짐)' };
      return qpost({ do: 'wait', tab: whTab(x.row), nkey: x.row.key, co: x.row.co, qty: q })
        .then(function () { return { done: q }; });
    });
  }
  /* 증량요청 — 답 기다리는 요청이 이미 있으면 또 보내지 않는다(관리팀에 같은 건이 두 번 간다) */
  function actMore(x, why) {
    return freshRow(x.row).then(function (f) {
      if (f.more > 0) return { skip: '이미 증량요청 ' + f.more + '건이 답을 기다리는 중' };
      var q = Math.max(0, x.need - f.mine - f.left);
      if (!q) return { skip: '더 필요 없음(잔여로 채워짐)' };
      return qpost({ do: 'more', tab: whTab(x.row), nkey: x.row.key, co: x.row.co,
                     qty: q, why: why || WHY_DEFAULT })
        .then(function () { return { done: q }; });
    });
  }
  /* 창고 코드는 줄 키 앞머리에 있다 — data-k = 「경기28\t양평해장국600G」 */
  function whTab(row) { return (row.k || '').split('\t')[0] || row.wh; }

  /* ── 패널 ───────────────────────────────────────────────────────── */
  var IDX = null;          // key → row (전체 창고 인덱스)
  var LASTWH = null;       // 마지막으로 긁은 창고 목록

  function css() {
    if (document.getElementById('qtyb-css')) return;
    var s = document.createElement('style');
    s.id = 'qtyb-css';
    s.textContent = [
      '#' + PANEL_ID + '{position:fixed;right:14px;bottom:14px;width:520px;max-width:calc(100vw - 28px);',
      '  max-height:82vh;display:flex;flex-direction:column;background:#fff;border:1px solid #d6dbe3;',
      '  border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.18);z-index:99999;font:13px/1.55 Pretendard,',
      '  -apple-system,"Malgun Gothic",sans-serif;color:#1f2530}',
      '#' + PANEL_ID + ' .hd{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #eceff4;',
      '  background:#f7f9fc;border-radius:12px 12px 0 0}',
      '#' + PANEL_ID + ' .hd b{font-size:14px}',
      '#' + PANEL_ID + ' .hd .sp{flex:1}',
      '#' + PANEL_ID + ' .bd{padding:11px 12px;overflow:auto}',
      '#' + PANEL_ID + ' button{border:1px solid #cfd6e0;background:#fff;border-radius:7px;padding:6px 10px;',
      '  font:600 12.5px Pretendard,sans-serif;cursor:pointer;color:#1f2530}',
      '#' + PANEL_ID + ' button.pri{background:#2f6fd0;border-color:#2f6fd0;color:#fff}',
      '#' + PANEL_ID + ' button:hover{filter:brightness(.96)}',
      '#' + PANEL_ID + ' textarea{width:100%;height:96px;border:1px solid #cfd6e0;border-radius:8px;padding:8px;',
      '  font:12.5px/1.5 Pretendard,sans-serif;resize:vertical}',
      '#' + PANEL_ID + ' table{border-collapse:collapse;width:100%;font-size:12px;margin-top:8px}',
      '#' + PANEL_ID + ' th{background:#eef2f7;padding:5px 6px;border:1px solid #dde3ea;white-space:nowrap}',
      '#' + PANEL_ID + ' td{padding:4px 6px;border:1px solid #e6eaef;text-align:center}',
      '#' + PANEL_ID + ' td.nm{text-align:left}',
      '#' + PANEL_ID + ' .tag{display:inline-block;padding:1px 6px;border-radius:9px;font-size:11px;font-weight:700}',
      '#' + PANEL_ID + ' .t-set{background:#e0ecff;color:#1d4ed8}',
      '#' + PANEL_ID + ' .t-wait{background:#fff3cd;color:#92400e}',
      '#' + PANEL_ID + ' .t-more{background:#fee2e2;color:#b91c1c}',
      '#' + PANEL_ID + ' .t-ok{background:#e8f5e9;color:#1b7a3d}',
      '#' + PANEL_ID + ' .t-free{background:#eef2f7;color:#475569}',
      '#' + PANEL_ID + ' .t-hunt{background:#111827;color:#fff}',
      '#' + PANEL_ID + ' .hunt{background:#111827;color:#fff;border-radius:9px;padding:9px 11px;margin:8px 0}',
      '#' + PANEL_ID + ' .hunt b{color:#fde68a}',
      '#' + PANEL_ID + ' .t-rel{background:#ede9fe;color:#6d28d9}',
      '#' + PANEL_ID + ' .warn{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:8px;',
      '  padding:7px 9px;margin:8px 0;font-size:12px}',
      '#' + PANEL_ID + ' .mut{color:#6b7280;font-size:11.5px}'
    ].join('');
    document.head.appendChild(s);
  }

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ── 필요수량 담아 두기 — 수량 화면에서 붙여넣은 것을 마이페이지에서 그대로 쓴다 ── */
  function needSave(text) {
    try { localStorage.setItem(NKEY, JSON.stringify({ date: today(), at: hhmm(), text: text })); } catch (e) {}
  }
  function needLoad() {
    try {
      var o = JSON.parse(localStorage.getItem(NKEY) || 'null');
      if (o && o.date === today() && o.text) return o;
    } catch (e) {}
    return null;
  }


  function build() {
    css();
    var p = document.createElement('div');
    p.id = PANEL_ID;
    p.innerHTML =
      '<div class="hd"><b>📊 발주 대조</b><span class="sp"></span>' +
      '<span class="mut" id="qtyb-stat">준비</span>' +
      '<button id="qtyb-min">—</button><button id="qtyb-x">✕</button></div>' +
      '<div class="bd">' +
      '  <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">' +
      '    <button class="pri" id="qtyb-scan">🔄 창고 전부 긁기</button>' +
      '    <button id="qtyb-scan1">이 창고만</button>' +
      '    <span class="mut">대기 한도</span>' +
      '    <input id="qtyb-wm" value="' + WAIT_MAX + '" style="width:44px;text-align:center;border:1px solid #cfd6e0;border-radius:6px;padding:4px">' +
      '    <span class="mut">개까지는 증량 대신 대기</span>' +
      '  </div>' +
      '  <div class="mut" style="margin:8px 0 4px">필요수량 — 상품명 + 수량 (탭 또는 띄어쓰기). 같은 상품 여러 줄이면 합칩니다.</div>' +
      '  <textarea id="qtyb-in" placeholder="연안 활 숫게 1kg&#9;30&#10;맛상 닭목살 1kg&#9;12"></textarea>' +
      '  <div style="display:flex;gap:6px;margin-top:7px;flex-wrap:wrap">' +
      '    <button class="pri" id="qtyb-go">⚖️ 대조</button>' +
      '    <button id="qtyb-clr">비우기</button>' +
      '  </div>' +
      '  <div id="qtyb-hunt"></div>' +
      '  <div id="qtyb-out"></div>' +
      '</div>';
    document.body.appendChild(p);

    el('qtyb-x').onclick = function () { p.remove(); };
    el('qtyb-min').onclick = function () {
      var b = p.querySelector('.bd');
      b.style.display = b.style.display === 'none' ? '' : 'none';
    };
    el('qtyb-scan').onclick = function () { scanAll(); };
    el('qtyb-scan1').onclick = function () { scanHere(); };
    el('qtyb-clr').onclick = function () { el('qtyb-in').value = ''; el('qtyb-out').innerHTML = ''; };
    el('qtyb-go').onclick = function () { run(); };
    huntPaint();               // 아침에 담아 둔 «구해야 할 것» 을 열 때마다 다시 보여 준다
    var kept = needLoad();     // 아까 붙여넣은 필요수량이 있으면 다시 채워 둔다
    if (kept) el('qtyb-in').value = kept.text;
    return p;
  }


  function stat(t) { var s = el('qtyb-stat'); if (s) s.textContent = t; }

  function scanHere() {
    var rows = [];
    siteRows().forEach(function (tr) {
      var o = readRow(tr, '');
      if (o && o.key) rows.push(o);
    });
    IDX = {};
    rows.forEach(function (r) { if (!IDX[r.key]) IDX[r.key] = r; });
    LASTWH = ['(이 화면)'];
    stat('이 화면 ' + rows.length + '줄');
    return Promise.resolve();
  }

  /* 창고 18곳 × 250KB = 순차로 돌면 45초가 넘는다(2026-09-28 실측).
     4줄로 나눠 동시에 긁는다 — 남의 서버라 4줄까지만. 1,778줄이 10초 안에 들어온다. */
  var LANES = 4;

  function scanAll() {
    return getChips().then(function (cs) { return scanChips(cs); });
  }
  function scanChips(cs) {
    if (!cs.length) { stat('창고 칩을 못 찾음'); return Promise.resolve(); }
    IDX = {};
    var n = 0, dup = 0, done = 0, fail = [];
    var t0 = Date.now();
    stat('긁는 중 0/' + cs.length);

    function take(queue) {
      if (!queue.length) return Promise.resolve();
      var c = queue.shift();
      return fetchSec(c.tab).then(function (rows) {
        rows.forEach(function (r) {
          if (IDX[r.key]) { dup++; return; }   // 이름이 같으면 첫 것만 — 수량 웹도 이름중복은 건너뛴다
          IDX[r.key] = r; n++;
        });
      }).catch(function () {
        fail.push(c.label || c.tab);           // 한 창고가 실패해도 나머지는 긁는다
      }).then(function () {
        done++;
        stat('긁는 중 ' + done + '/' + cs.length + ' · ' + n + '줄');
        return take(queue);
      });
    }

    var q = cs.slice();
    var lanes = [];
    for (var i = 0; i < LANES; i++) lanes.push(take(q));
    return Promise.all(lanes).then(function () {
      LASTWH = cs.map(function (c) { return c.label; });
      stat('전체 ' + n + '줄 · ' + hhmm() + ' 기준'
        + (dup ? ' · 이름중복 ' + dup + '건' : '')
        + (fail.length ? ' · ⚠️ 못 읽은 창고 ' + fail.join(',') : '')
        + ' (' + ((Date.now() - t0) / 1000).toFixed(1) + '초)');
    });
  }

  function hhmm() {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date());
  }

  function run() {
    var wm = parseInt(el('qtyb-wm').value, 10);
    WAIT_MAX = isNaN(wm) ? 5 : wm;
    var parsed = parseNeed(el('qtyb-in').value);
    var notes = foldAlias(parsed.map);                 // 연어·홍어처럼 한 줄에서 잡는 것들을 먼저 합친다
    var keys = Object.keys(parsed.map).filter(function (k) { return k.indexOf('#raw:') !== 0; });
    if (!keys.length) { el('qtyb-out').innerHTML = '<div class="warn">필요수량을 붙여넣어 주세요.</div>'; return; }
    needSave(el('qtyb-in').value);      // 마이페이지에서 그대로 쓰도록 담아 둔다

    var go = IDX ? Promise.resolve() : scanAll();
    return go.then(function () { return loadMy(); }).then(function () {
      var hits = [], miss = [];
      keys.forEach(function (k) {
        var row = IDX[k];
        if (!row) { miss.push(parsed.map['#raw:' + k] || k); return; }
        var j = judge(row, parsed.map[k]);
        /* 🔴 붙여넣은 «원래 이름»을 들고 다닌다 (2026-09-28 사고).
           수량 웹 상품명에는 창고가 덧붙인 꼬리말이 있다 — 「… 500g급 품절 안 풀림」.
           그 이름으로 못 채운 목록을 내보냈더니 시트 J열과 안 맞아 한 줄도 못 내렸다.
           시트에서 줄을 찾을 때는 «시트에 적힌 이름», 즉 붙여넣은 원래 이름을 써야 한다. */
        j.raw = parsed.map['#raw:' + k] || row.name;
        hits.push(j);
      });
      draw(hits, miss, parsed.bad, notes);
    });
  }

  /* 지금 화면에 창고가 여러 곳 섞여 있나 — 전체 창고 탭은 200줄에서 끊기니 붙여넣기에 못 쓴다. */
  function mixedView() {
    var whs = {}, n = 0;
    siteRows().forEach(function (tr) {
      var w = ctext(tr, 'wh');
      if (w && !whs[w]) { whs[w] = 1; n++; }
    });
    return n > 1;
  }

  var TAG = {
    set: ['t-set', '잡기'], 'set+wait': ['t-wait', '잡기+대기'], 'set+more': ['t-more', '잡기+증량'],
    wait: ['t-wait', '대기'], more: ['t-more', '증량요청'],
    ok: ['t-ok', '그대로'], over: ['t-ok', '여유'], release: ['t-rel', '풀어야'],
    free: ['t-free', '넉넉'],
    hunt: ['t-hunt', '🎯 구해야'], moreP: ['t-wait', '증량 답 기다림'], waitP: ['t-wait', '대기 중']
  };

  function draw(hits, miss, bad, notes) {
    // 손봐야 할 것 먼저 : 증량 → 대기 → 잡기 → 풀어야 → 그대로
    var ord = { hunt: 0, more: 1, 'set+more': 1, wait: 2, 'set+wait': 2, moreP: 3, waitP: 3,
                set: 4, release: 5, over: 6, ok: 7, free: 8 };
    hits.sort(function (a, b) { return (ord[a.act] - ord[b.act]) || (b.need - a.need); });

    var h = '';

    /* 🎯 따로 구해야 할 수량 — 대기·증량 둘 다 막힌 몫. 오늘 못 파는 물량이라 제일 위에 둔다.
       홍팀장 2026-09-28 : 「대기 및 수량 요청 한번에 안될 경우 따로 구해야 할 수량 저장하여 노출」
       → 이 브라우저에 날짜와 함께 담아 두고, 패널을 다시 열어도 그대로 보인다. */
    huntSave(hits.filter(function (x) { return x.act === 'hunt'; }));
    huntPaint();               // 화면 표시는 한 곳에서만 — 담아 둔 것과 방금 나온 것이 갈리지 않게

    if (notes && notes.length) {
      h += '<div style="background:#eef2f7;border:1px solid #dde3ea;border-radius:8px;padding:7px 9px;margin:8px 0;font-size:12px">'
        + notes.join('<br>') + '</div>';
    }

    /* ⚠️ 잡았는데 안 쓴 것 — 마이페이지(우리가 잡은 것)를 긁어 만든다. 그래서 어느 화면에서도 보인다.
       홍팀장 2026-09-28 : 「잡은 수량 대비 사용한 상품 없는 것도 실시간으로 취합하여 알려줌」 */
    var idle = Object.keys(OURS).map(function (k) {
      var o = OURS[k];
      // 「안 쓴 것」 칸이 있으면 그 값을 믿는다(수량 웹이 직접 센 값) — 없으면 잡은 것에서 사용을 뺀다
      var left = (o.unused != null && o.unused !== 0) ? o.unused : (o.got - o.used);
      return { key: k, wh: o.wh, got: o.got, used: o.used, left: left,
               name: (IDX && IDX[k]) ? IDX[k].name : k };
    }).filter(function (o) { return o.left > 0; }).sort(function (a, b) { return b.left - a.left; });
    if (idle.length) {
      var tot = idle.reduce(function (n, o) { return n + o.left; }, 0);
      h += '<div class="warn">⚠️ 잡았는데 안 쓴 것 ' + idle.length + '건 · ' + tot + '개 — 마감까지 안 나가면 그대로 우리 몫입니다.<br>'
        + idle.slice(0, 12).map(function (o) {
            return '· ' + esc(o.wh) + ' / ' + esc(o.name) + ' 잡음 ' + o.got + ' · 사용 ' + o.used + ' → 남음 <b>' + o.left + '</b>';
          }).join('<br>')
        + (idle.length > 12 ? '<br>…' : '') + '</div>';
    }

    var rel = hits.filter(function (x) { return x.act === 'release'; });
    if (rel.length) {
      h += '<div class="warn">⏰ 마감 1시간 안 · 안 나간 몫 ' + rel.length + '건 — 풀지 않으면 그대로 우리 몫으로 남습니다.<br>' +
        rel.map(function (x) { return esc(x.row.name) + ' <b>' + x.over + '개</b>'; }).join(' · ') + '</div>';
    }
    if (miss.length) {
      h += '<div class="warn">🔎 수량 웹에서 못 찾은 상품 ' + miss.length + '건 — 이름이 한 글자라도 다르면 못 찾습니다(추측 매칭 안 함).<br>' +
        miss.map(esc).join(' · ') + '</div>';
    }
    if (bad && bad.length) {
      h += '<div class="warn">✂️ 수량을 못 읽은 줄 ' + bad.length + '건 : ' + bad.slice(0, 8).map(esc).join(' · ') + '</div>';
    }

    /* 🚀 판정대로 실제로 걸기 — 잡기 · 대기 · 증량요청 */
    var nSet = hits.filter(function (x) { return x.set; }).length;
    var nWait = hits.filter(function (x) { return x.wait; }).length;
    var nMore = hits.filter(function (x) { return x.more; }).length;
    var nUse = hits.filter(function (x) { return x.need > 0 && (x.mine + (x.set || 0)) > 0; }).length;
    if (nSet || nWait || nMore || nUse) {
      h += '<div style="background:#eef4ff;border:1px solid #c7d9f5;border-radius:9px;padding:9px 11px;margin:8px 0">'
        + '<div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap">'
        +   '<button class="pri" id="qtyb-run">🚀 판정대로 실행</button>'
        +   '<span style="font-size:12.5px">잡기 <b>' + nSet + '</b> · 사용 <b>' + nUse + '</b> · 대기 <b>' + nWait + '</b> · 증량요청 <b>' + nMore + '</b></span>'
        + '</div>'
        + '<div style="margin-top:6px"><span class="mut">증량요청 사유</span> '
        +   '<input id="qtyb-why" value="' + esc(WHY_DEFAULT) + '" style="width:calc(100% - 80px);border:1px solid #cfd6e0;border-radius:6px;padding:5px 8px;font:12.5px Pretendard,sans-serif"></div>'
        + '<div id="qtyb-runlog" class="mut" style="margin-top:6px"></div></div>';
    }

    h += '<table><thead><tr><th>판정</th><th>창고</th><th>상품명</th><th>필요</th><th>잡음</th>' +
      '<th>잔여</th><th>잡기</th><th>대기</th><th>증량</th><th>마감</th></tr></thead><tbody>';
    hits.forEach(function (x) {
      var t = TAG[x.act] || TAG.ok;
      var ml = minsLeft(dlHour(x.row.dlRaw));
      h += '<tr>' +
        '<td><span class="tag ' + t[0] + '">' + t[1] + '</span></td>' +
        '<td>' + esc(x.row.wh) + '</td>' +
        '<td class="nm">' + esc(x.row.name) + '<div class="mut">' + esc(x.why) + '</div></td>' +
        '<td><b>' + x.need + '</b></td>' +
        '<td>' + x.mine + '</td>' +
        '<td>' + x.row.left + '</td>' +
        '<td>' + (x.set ? '<b>' + ((x.ghost ? 0 : x.mine) + x.set) + '</b>' : '') + '</td>' +
        '<td>' + (x.wait || '') + '</td>' +
        '<td>' + (x.more || '') + '</td>' +
        '<td class="mut">' + esc(x.row.dlRaw.replace(/^.*?:\s*/, '')) + (ml != null && ml <= 120 ? ' <b>' + ml + '분</b>' : '') + '</td>' +
        '</tr>';
    });
    h += '</tbody></table>';

    // 붙여넣기용 — 지금 화면 표 순서 그대로 세로 한 줄
    /* 📋 못 채운 목록 — 시트에서 「재고 없음」 으로 내릴 몫.
       🔴 증량요청 건 것만 뽑으면 안 된다(홍팀장 2026-09-28) : 꽃게처럼 290개 필요한데 잔여가 모자라
          130개만 잡은 줄은 증량·대기 어디에도 안 걸려 있어도 «160개는 못 채운 것»이다.
          → 판정이 무엇이든 «못 메운 몫(hole)» 이 있으면 전부 여기 담는다. */
    var holes = hits.filter(function (x) { return (x.hole || 0) > 0; });
    /* 🔴 아직 «잡지 않은 것»이 남아 있으면 못 채운 목록을 못 뽑게 막는다 (2026-09-28 사고).
       잡기 전에 뽑으면 전 품목이 부족분으로 나온다 — 그 목록을 시트에 넣어 당일 271줄이
       통째로 「재고 없음」 으로 내려갔다. 잡을 수 있었던 것까지 빠졌다.
       먼저 [🚀 판정대로 실행] 으로 잡고, 그러고도 남는 몫만 내려야 한다. */
    var pending = nSet + nWait + nMore;
    h += '<div style="display:flex;gap:6px;margin-top:9px;flex-wrap:wrap">' +
      '<button class="pri" id="qtyb-cpno"' + (pending ? ' disabled title="먼저 [🚀 판정대로 실행] 을 누르십시오"' : '') + '>' +
        (pending ? '🔒 못 채운 목록 — 먼저 실행하세요' : ('📋 못 채운 목록 ' + (holes.length ? '(' + holes.length + ')' : ''))) + '</button>' +
      '<button id="qtyb-cp">📋 이 화면 순서로 숫자열</button>' +
      '<button id="qtyb-cpw">📋 대기</button>' +
      '<button id="qtyb-cpm">📋 증량요청</button></div>' +
      '<div class="mut" style="margin-top:5px">[못 채운 목록] 은 시트 「🌐 수량 웹 정리」 의 ③ 칸에 붙여넣는 것입니다 — ' +
      '잡고 남은 몫 전부(대기·증량 걸어 둔 것 포함)라 그만큼이 「재고 없음」 으로 내려갑니다.</div>' +
      '<div class="mut" style="margin-top:5px">숫자열은 <b>지금 보이는 표 순서</b>에 맞춥니다 — 복사한 뒤 정렬·필터·창고를 바꾸지 마시고, ' +
      '첫 줄 마찬 칸을 누른 다음 Ctrl+V 하십시오. 대상이 아닌 줄은 <b>지금 값 그대로</b> 채워 두므로 남의 줄이 풀리지 않습니다.</div>' +
      (mixedView() ? '<div class="warn">⚠️ 지금은 창고가 섞인 화면입니다 — 전체 창고 탭은 200줄에서 끊깁니다. ' +
        '붙여넣기는 <b>창고 탭을 하나 열고</b> 하십시오.</div>' : '');

    el('qtyb-out').innerHTML = h;

    var byKey = {};
    hits.forEach(function (x) { byKey[x.row.key] = x; });

    var runBtn = el('qtyb-run');
    if (runBtn) runBtn.onclick = function () {
      /* 할 일을 한 줄로 늘어놓는다 — 잡기부터. 잔여를 먼저 먹고 나서 대기·증량을 걸어야
         「잡을 수 있었는데 대기를 건」 일이 안 생긴다. */
      var jobs = [];
      hits.forEach(function (x) { if (x.set)  jobs.push({ t: '잡기',   x: x, n: x.mine + x.set, f: function () { return actSet(x); } }); });
      /* 잡은 뒤 «사용» 을 채운다 — 잡아만 두고 안 썼다고 잡히면 마감 때 풀라는 경고가 뜬다.
         잡기가 없던 줄(이미 넉넉히 잡아 둔 것)도 채워야 하므로 필요수량이 있는 줄 전부를 본다. */
      hits.forEach(function (x) { if (x.need > 0) jobs.push({ t: '사용', x: x, n: Math.min(x.need, x.mine + (x.set || 0)), f: function () { return actUsed(x); } }); });
      hits.forEach(function (x) { if (x.wait) jobs.push({ t: '대기',   x: x, n: x.wait,        f: function () { return actWait(x); } }); });
      var why = (el('qtyb-why') && el('qtyb-why').value.trim()) || WHY_DEFAULT;
      hits.forEach(function (x) { if (x.more) jobs.push({ t: '증량요청', x: x, n: x.more,      f: function () { return actMore(x, why); } }); });
      if (!jobs.length) return;
      if (!confirm('수량 웹에 실제로 겁니다 — ' + jobs.length + '건\n\n'
          + jobs.slice(0, 15).map(function (j) { return '· [' + j.t + '] ' + j.x.row.name + ' ' + j.n; }).join('\n')
          + (jobs.length > 15 ? '\n…' : '')
          + '\n\n증량요청 사유 : ' + why)) return;

      var btn = this, ok = 0, bad = [], skip = [];
      btn.disabled = true;
      var log = el('qtyb-runlog');
      (function step(i) {
        if (i >= jobs.length) {
          btn.textContent = (bad.length ? '⚠️ ' : '✅ ') + ok + '건 완료'
            + (skip.length ? ' · ' + skip.length + '건 건너뜀' : '')
            + (bad.length ? ' · ' + bad.length + '건 실패' : '');
          var h2 = '';
          if (bad.length)  h2 += '<b style="color:#b91c1c">안 된 것</b><br>' + bad.map(esc).join('<br>');
          if (skip.length) h2 += (h2 ? '<br><br>' : '') + '<b>건너뛴 것</b> — 이미 되어 있어 다시 걸지 않았습니다<br>' + skip.map(esc).join('<br>');
          log.innerHTML = h2 || '다 걸었습니다. 다시 세는 중…';
          /* 끝나면 바로 다시 긁어 판정을 새로 낸다 — 방금 건 것이 반영된 화면을 보여 주고,
             두 번 눌러도 «할 일 없음» 이 되게 한다. */
          scanAll().then(function () { return loadMy(); }).then(function () {
            btn.disabled = false;
            run();
          });
          return;
        }
        var j = jobs[i];
        btn.textContent = '거는 중 ' + (i + 1) + '/' + jobs.length;
        log.textContent = '[' + j.t + '] ' + j.x.row.name + ' ' + j.n;
        j.f().then(function (r) {
          if (r && r.skip) skip.push('· [' + j.t + '] ' + j.x.row.name + ' — ' + r.skip);
          else ok++;
        }, function (e) {
          bad.push('· [' + j.t + '] ' + j.x.row.name + ' — ' + (e.message || e));
        }).then(function () { setTimeout(function () { step(i + 1); }, 320); });
      })(0);
    };

    /* 📋 숫자열 — 지금 화면 줄 순서 그대로 세로 한 줄.
       🔴 빈 칸을 붙여넣으면 그 줄은 «풀린다»(수량 웹: 비우고 저장하면 풀림).
          그래서 대조 대상이 아닌 줄은 빈 칸이 아니라 «지금 잡고 있는 값 그대로» 채운다 —
          그래야 붙여넣기가 남의 줄(내가 이미 잡아 둔 다른 상품)을 풀어 버리지 않는다.
          아직 안 잡은 줄(0)만 빈 칸으로 둔다(빈 칸 → 빈 칸이라 변화가 없다). */
    el('qtyb-cp').onclick = function () {
      var col = [], hit = 0, seen = {};
      siteRows().forEach(function (tr) {
        var o = readRow(tr, '');
        if (!o) { col.push(''); return; }          // 상품 줄이 아니어도 자리는 지킨다(줄이 밀리면 딴 상품이 잡힌다)
        var x = byKey[o.key];
        var v = o.mine > 0 ? String(o.mine) : ''; // 기본은 «지금 값 그대로» — 빈 칸을 넣으면 그 줄이 풀린다
        if (x) {
          seen[o.key] = 1;
          if (x.set) { v = String(x.mine + x.set); hit++; }   // 새로 잡을 줄만 값을 바꾼다
        }
        col.push(v);
      });
      var missing = hits.filter(function (x) { return !seen[x.row.key]; });
      var note = hit ? hit + '줄 바뀜' : '바뀌는 줄 없음';
      if (missing.length) {
        note += ' · 이 화면에 없는 ' + missing.length + '건은 그 창고 탭에서';
        alert('이 화면에 없는 대상 ' + missing.length + '건은 빠집니다 — 해당 창고 탭을 열고 다시 복사하십시오.\n\n'
          + missing.slice(0, 12).map(function (x) { return '· ' + x.row.wh + ' / ' + x.row.name; }).join('\n')
          + (missing.length > 12 ? '\n…' : ''));
      }
      copy(col.join('\n'), this, note);
    };
    el('qtyb-cpno').onclick = function () {
      if (pending) {
        alert('아직 잡지 않은 것이 ' + pending + '건 있습니다.\n\n먼저 [🚀 판정대로 실행] 을 눌러 잡을 것을 잡으십시오.\n'
          + '지금 뽑으면 잡을 수 있는 것까지 「재고 없음」 으로 내려갑니다.');
        return;
      }
      if (!holes.length) { alert('못 채운 것이 없습니다 — 내릴 줄이 없습니다.'); return; }
      // 시트에 적힌 이름(붙여넣은 원래 이름)으로 낸다 — 수량 웹 꼬리말이 붙으면 시트에서 못 찾는다
      copy(holes.map(function (x) { return x.row.wh + '\t' + (x.raw || x.row.name) + '\t' + x.hole; }).join('\n'),
           this, holes.length + '건');
    };
    el('qtyb-cpw').onclick = function () {
      copy(hits.filter(function (x) { return x.wait; })
        .map(function (x) { return x.row.wh + '\t' + x.row.name + '\t대기 ' + x.wait; }).join('\n'), this);
    };
    el('qtyb-cpm').onclick = function () {
      copy(hits.filter(function (x) { return x.more; })
        .map(function (x) { return x.row.wh + '\t' + x.row.name + '\t증량 ' + x.more; }).join('\n'), this);
    };
  }

  /* 🎯 구해야 할 수량 담아 두기 — 브라우저에 오늘 날짜로만 남긴다(어제 것이 섞이면 헷갈린다).
     🔴 사생활 보호 창 등에서 localStorage 가 막히면 던진다 → 통째로 감싼다. 담지 못해도 화면은 돌아야 한다. */
  var HKEY = 'qtybHunt';
  function today() {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
  }
  function huntSave(list) {
    try {
      localStorage.setItem(HKEY, JSON.stringify({
        date: today(), at: hhmm(),
        items: list.map(function (x) {
          return { wh: x.row.wh, name: x.row.name, qty: x.hunt || x.hole || 0, why: x.why };
        })
      }));
    } catch (e) {}
  }
  function huntLoad() {
    try {
      var o = JSON.parse(localStorage.getItem(HKEY) || 'null');
      if (o && o.date === today() && o.items && o.items.length) return o;
    } catch (e) {}
    return null;
  }
  function huntPaint() {
    var box = el('qtyb-hunt');
    if (!box) return;
    var o = huntLoad();
    if (!o) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="hunt">🎯 오늘 따로 구해야 할 수량 ' + o.items.length + '건 <span style="opacity:.7;font-size:11.5px">('
      + esc(o.at) + ' 대조)</span><br>'
      + o.items.map(function (i) {
          return '· ' + esc(i.wh) + ' / ' + esc(i.name) + ' <b>' + i.qty + '개</b>';
        }).join('<br>')
      + '<div style="margin-top:6px"><button id="qtyb-hclr" style="background:#374151;color:#fff;border-color:#4b5563">구한 것 지우기</button></div></div>';
    var b = el('qtyb-hclr');
    if (b) b.onclick = function () { try { localStorage.removeItem(HKEY); } catch (e) {} huntPaint(); };
  }

  function copy(text, btn, extra) {
    var old = btn.textContent;
    function done(ok) {
      btn.textContent = ok ? ('✅ 복사됨' + (extra ? ' (' + extra + ')' : '')) : '❌ 복사 실패';
      setTimeout(function () { btn.textContent = old; }, 1800);
    }
    if (!text) { btn.textContent = '비어 있음'; setTimeout(function () { btn.textContent = old; }, 1400); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { fallback(); });
    } else fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove(); done(ok);
    }
  }

  window.__QTYB = {
    open: function () { if (!el(PANEL_ID)) build(); },
    scanAll: scanAll, scanHere: scanHere, judge: judge, nk: nk,
    idx: function () { return IDX; }
  };
  build();
})();
