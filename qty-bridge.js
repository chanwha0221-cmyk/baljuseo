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
      editable: !!mineCell,
      free: free,
      // 총수량 0 인 줄은 오늘 못 파는 줄이다(수량 웹도 [한꺼번에]에서 건너뛴다) — 단 「넉넉」은 빼고.
      closed: total <= 0 && !free
    };
  }

  /* ── 창고 칩 모으기 ──────────────────────────────────────────────
     전체 창고 탭은 200줄에서 끊긴다(2026-09-28 실측 : 1,778건 중 200줄만 렌더).
     창고별로는 안 끊긴다(단독(유) 291줄 확인) → 창고 칩을 하나씩 돌아 긁는다.
     🔴 창고 코드는 tab 파라미터다(경기28 · 단독(유)28 …). sec 은 당일/상시 구분이고
        sec=* 가 «전부»다 — 여기를 바꿔 잡으면 빈 표가 온다(첫 판에 한 번 틀렸다). */
  function chips() {
    var out = [], seen = {};
    [].forEach.call(document.querySelectorAll('a[href]'), function (a) {
      var u;
      try { u = new URL(a.getAttribute('href'), location.href); } catch (e) { return; }
      if (u.pathname !== location.pathname) return;
      var tab = u.searchParams.get('tab');
      if (!tab || tab === '*' || seen[tab]) return;
      seen[tab] = 1;
      out.push({ tab: tab, label: (a.textContent || '').replace(/[\d,]+\s*$/, '').trim() });
    });
    return out;
  }

  /* 창고 한 곳 긁기 — 같은 오리진이라 쿠키가 실려 간다(로그인 세션 그대로). */
  function fetchSec(tab) {
    var p = new URLSearchParams();
    p.set('tab', tab);
    p.set('sec', '*');
    return fetch(location.pathname + '?' + p.toString(), { credentials: 'same-origin' })
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
          var c = [].map.call(tr.children, function (e) { return (e.textContent || '').replace(/\s+/g, ' ').trim(); });
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

  /* ── 판정 ───────────────────────────────────────────────────────── */
  function judge(row, need) {
    var mine = row.mine || 0;
    var short = need - mine;
    var r = { row: row, need: need, mine: mine, set: 0, wait: 0, more: 0, over: 0, act: 'ok', why: '' };

    /* 「넉넉」 — 수량을 안 잡고 써도 되는 상품. 손댈 일이 없다. */
    if (row.free) {
      r.act = 'free';
      r.why = '넉넉 — 수량 안 잡고 써도 되는 상품';
      return r;
    }

    /* 총수량이 0인 줄 — 오늘 안 올라온 상품이다. 잡을 칸이 없으니 대기로도 안 되고
       관리팀이 총수량을 올려 줘야 한다 → 부족분 전부 증량요청. */
    if (row.closed && short > 0) {
      r.more = short;
      r.act = 'more';
      r.why = '총수량 0 — 오늘 안 올라온 상품' + (row.leftRaw && !/^\d/.test(row.leftRaw) ? ' (잔여 "' + row.leftRaw + '")' : '');
      return r;
    }

    if (short <= 0) {
      r.over = mine - need;
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

    var canSet = Math.min(short, row.left);
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
    var base = '잔여 ' + row.left + '개로 ' + rest + '개 부족';

    if (mo && mo.no && wa && wa.pend) {
      // 갓성비 암게 꼴 — 증량은 까였고 대기는 걸어 뒀지만 아직 못 받았다
      r.hunt = hole;
      r.act = 'hunt';
      r.why = base + ' · 증량 거부 + 대기 ' + wa.qty + '개 걸어 둠(아직 못 받음)'
        + (mo.ans ? ' · 「' + mo.ans + '」' : '');
    } else if (mo && mo.no) {
      // 증량은 막혔다 → 소량이면 대기로 돌리고, 많으면 따로 구해야 한다
      if (hole <= WAIT_MAX) { r.wait = hole; r.act = 'wait'; r.why = base + ' · 증량 거부됨 → 대기로'; }
      else { r.hunt = hole; r.act = 'hunt'; r.why = base + ' · 증량 거부됨' + (mo.ans ? ' 「' + mo.ans + '」' : ''); }
    } else if (mo && mo.pend) {
      r.act = 'moreP';
      r.why = base + ' · 증량 ' + mo.qty + '개 요청해 두고 답 기다림';
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
    var cs = chips();
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
    var keys = Object.keys(parsed.map).filter(function (k) { return k.indexOf('#raw:') !== 0; });
    if (!keys.length) { el('qtyb-out').innerHTML = '<div class="warn">필요수량을 붙여넣어 주세요.</div>'; return; }

    var go = IDX ? Promise.resolve() : scanAll();
    go.then(function () { return loadMy(); }).then(function () {
      var hits = [], miss = [];
      keys.forEach(function (k) {
        var row = IDX[k];
        if (!row) { miss.push(parsed.map['#raw:' + k] || k); return; }
        hits.push(judge(row, parsed.map[k]));
      });
      draw(hits, miss, parsed.bad);
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

  function draw(hits, miss, bad) {
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
        '<td>' + (x.set ? '<b>' + (x.mine + x.set) + '</b>' : '') + '</td>' +
        '<td>' + (x.wait || '') + '</td>' +
        '<td>' + (x.more || '') + '</td>' +
        '<td class="mut">' + esc(x.row.dlRaw.replace(/^.*?:\s*/, '')) + (ml != null && ml <= 120 ? ' <b>' + ml + '분</b>' : '') + '</td>' +
        '</tr>';
    });
    h += '</tbody></table>';

    // 붙여넣기용 — 지금 화면 표 순서 그대로 세로 한 줄
    h += '<div style="display:flex;gap:6px;margin-top:9px;flex-wrap:wrap">' +
      '<button class="pri" id="qtyb-cp">📋 이 화면 순서로 숫자열 복사</button>' +
      '<button id="qtyb-cpw">📋 대기 목록</button>' +
      '<button id="qtyb-cpm">📋 증량요청 목록</button></div>' +
      '<div class="mut" style="margin-top:5px">숫자열은 <b>지금 보이는 표 순서</b>에 맞춥니다 — 복사한 뒤 정렬·필터·창고를 바꾸지 마시고, ' +
      '첫 줄 마찬 칸을 누른 다음 Ctrl+V 하십시오. 대상이 아닌 줄은 <b>지금 값 그대로</b> 채워 두므로 남의 줄이 풀리지 않습니다.</div>' +
      (mixedView() ? '<div class="warn">⚠️ 지금은 창고가 섞인 화면입니다 — 전체 창고 탭은 200줄에서 끊깁니다. ' +
        '붙여넣기는 <b>창고 탭을 하나 열고</b> 하십시오.</div>' : '');

    el('qtyb-out').innerHTML = h;

    var byKey = {};
    hits.forEach(function (x) { byKey[x.row.key] = x; });

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
