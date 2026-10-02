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
  /* 🔴 북마크릿을 다시 누르면 «언제나 새 코드» 로 갈아 끼운다 (2026-09-28 사고).
     예전엔 `if (window.__QTYB) { open(); return; }` 이라 패널을 한 번 띄운 탭에서는
     북마크릿을 다시 눌러도 옛 코드가 그대로 돌았다 — 고쳐서 배포해도 홍팀장 화면은
     계속 옛 판정(증량요청)을 내고 있었다. 새로고침을 시키지 말고 여기서 갈아 끼운다.
     붙여넣은 필요수량은 localStorage 에 있으니 새로 떠도 그대로 채워진다. */
  var QTYB_VER = '2026-10-02a';
  try {
    var oldPanel = document.getElementById('qtyb-panel'); if (oldPanel) oldPanel.remove();
    var oldCss = document.getElementById('qtyb-css'); if (oldCss) oldCss.remove();
  } catch (e) {}
  window.__QTYB = null;

  var WAIT_MAX = 5;                 // 이 개수까지는 증량요청 대신 대기 (패널에서 바꿀 수 있다)
  /* 총수량에서 못 채운 몫이 이 비율을 넘으면 개수가 적어도 증량요청으로 간다.
     10개짜리에서 5개(50%)가 비면 대기로는 안 메워진다 — 풀 물건이 없다(2026-09-28 홍팀장). */
  var WAIT_SHARE = 0.2;
  /* 수량이 풀리는 시각(KST). 이 시각이 지나도 「품절 안 풀림」 이면 대기가 아니라 증량요청으로 간다(2026-09-29). */
  var OPEN_HOUR = 10;
  var PANEL_ID = 'qtyb-panel';

  /* 🔴 화면을 가리지 않는다 (홍팀장 2026-09-28 : 「그냥 수량 사이트 어디서나 나오게 해야지」).
     수량 화면이든 마이페이지든 공지든, 북마크릿을 누르면 «같은 패널·같은 기능»이 뜬다.
     잡기·사용·대기·증량은 전부 POST 로 걸고, 잡은 현황·안 쓴 것은 마이페이지를 긁어 오므로
     그 화면에 서 있을 필요가 없다. */
  var DONE_MAP = {};                // 기준 날짜 시트에서 «이미 나간 수량» (상품키 → 개수)
  /* 「재고 없음」 탭에 내려가 대기·증량을 기다리는 주문 수량 (상품키 → 개수) — 대조할 때마다 새로 읽는다.
     걸어 둔 대기는 이 주문들 몫이 먼저다(2026-09-29 알도루묵). */
  var NONE_MAP = {};
  /* 🧾 수량 점검의 «나간 것» 은 날짜 시트에 실제로 들어간 발주만 센다 (2026-09-29 홍팀장 전어 90개).
     시트를 제대로 읽었으면 시트에 없는 상품 = 0 개 나감. 수량 웹 «사용» 칸으로 메우지 않는다
     (대조 실행이 잡으면서 사용 칸을 같이 적어서, 시트로 안 넘긴 전어가 90개 나간 걸로 떴다). */
  var DONE_OK = false, DONE_TAB = '', DONE_LINES = 0;
  function parkedTxt(n) { return ' (그중 ' + n + '개는 재고 없음에 있는 주문 몫)'; }
  var DROPPED = {};                 // ✕ 로 뺀 줄(중복이라고 판단한 것) — 대조할 때마다 비운다
  var NKEY = 'qtybNeed';            // 발주 필요수량 — 화면이 바뀌어도 이어 쓴다(같은 오리진)

  /* ══ 📄 마찬 월 시트 직접 읽기 ═══════════════════════════════════════
     홍팀장 2026-09-28 : 「내 시트와 저 웹이 지금 하나도 유기적으로 안 돌아가잖아.
                          나 지금 솔직히 오늘 발주를 어떻게 했는지도 모르겠다」
     → 복사·붙여넣기 왕복을 없앤다. 패널이 시트를 직접 읽는다.
       수량 웹은 남의 서버라 구글 토큰을 실을 수 없다 → 우리 sheets-proxy 를 경유한다
       (2026-09-28 실측 : 수량 웹에서 CORS 통과, path 는 «시트ID/values/탭!범위»).
     🔴 여기서는 «읽기만» 한다. 시트를 고치는 것은 시트 메뉴가 한다. */
  /* 📄 발주 시트는 달마다 바뀐다 (2026-10-02 홍팀장 「10월로 업데이트 됐거든 주소 변경하는 거 넣어줘」).
     패널 [📄 발주 시트] 칸에 주소를 붙여넣으면 이 브라우저에 기억하고, 읽기·옮기기 전부 그 시트로 간다.
     시트를 고치는 웹앱은 9월 시트에 붙어 있지만 요청마다 sheet 를 받아 그 시트를 연다. */
  var SKEY = 'qtybSheetId';
  var SHEET_ID_DEFAULT = '1w5HYxmaovLADK23OhBAubxzbVJjHeTYJt24jPyzgOTw';     // 마찬 9월
  var SHEET_ID = SHEET_ID_DEFAULT;
  try { SHEET_ID = localStorage.getItem(SKEY) || SHEET_ID_DEFAULT; } catch (e) {}
  function sheetIdFrom(v) {
    var s = String(v || '').trim();
    var m = s.match(/\/d\/([A-Za-z0-9_-]{20,})/);
    if (m) return m[1];
    return /^[A-Za-z0-9_-]{20,}$/.test(s) ? s : '';
  }
  var SHEET_DONE = '';              // 오늘 날짜 탭에서 읽은 «이미 나간 수량» (점검이 쓴다)
  var PROXY = 'https://script.google.com/macros/s/AKfycbx46saILixJ387TxLbfnsBwjdc5K93j-cqUFjHxQU8xPGL7DJ9S-YjUvw7kvHmGPe7mmg/exec';

  /* ✍️ 시트를 «고치는» 입구 — 마찬발주관리 스크립트의 웹앱 (2026-09-28 홍팀장 「이것까지 한번에」).
     읽기는 프록시로 되지만 줄 옮기기는 읽고·지우고·붙이는 일이라 시트 스크립트가 해야 한다.
     패널이 여기로 바로 보내므로 «복사해서 시트 창에 옮겨 붙이는» 왕복이 없다.
       out  = 못 나가는 것 → 「재고 없음」
       back = 구해진 것 → 「당일」 */
  var SHEET_API = 'https://script.google.com/macros/s/AKfycbwD0AdIFedunOCz39nmkQhAde26WNNkkRK7Mc-t4XKRW5kW9ORE6HvNk_fdXRZzyI50/exec';
  var SHEET_TOKEN = 'qtyb-2026-hcw';

  /* 🔴 IDX 는 긁기를 시작할 때 {} 로 비운다 — 그래서 «있다/없다» 로 보면 빈 것도 «있다» 가 된다.
     한 번 0줄로 끝나면 영영 다시 안 긁어, 대조가 전부 «못 찾음» 으로 나왔다(2026-09-28 21:18 실측).
     반드시 «줄 수» 로 볼 것. */
  function haveIdx() { return !!(IDX && Object.keys(IDX).length); }

  function sheetPost(action, rows, extra) {
    var body = { token: SHEET_TOKEN, action: action, rows: rows || [], sheet: SHEET_ID };
    if (extra) Object.keys(extra).forEach(function (k) { body[k] = extra[k]; });
    return fetch(SHEET_API, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.text(); }).then(function (t) {
      var j = null;
      try { j = JSON.parse(t); } catch (e) { throw new Error('시트가 응답하지 않습니다'); }
      if (!j.ok) throw new Error(j.error || '시트가 거절했습니다');
      return j;
    });
  }

  function sheetRead(tabRange) {
    var path = SHEET_ID + '/values/' + encodeURIComponent(tabRange);
    return fetch(PROXY, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'public', path: path, method: 'GET' })
    }).then(function (r) { return r.text(); }).then(function (t) {
      var j = null;
      try { j = JSON.parse(t); } catch (e) { throw new Error('시트를 읽지 못했습니다'); }
      if (!j || j.status !== 200) throw new Error('시트를 읽지 못했습니다 (' + (j && j.status) + ')');
      var b = null;
      try { b = JSON.parse(j.body); } catch (e) { throw new Error('시트 응답을 읽지 못했습니다'); }
      return b.values || [];
    });
  }

  /* 시트 한 탭을 상품별 합계로 — 당일 탭도 날짜 탭도 같은 자다.
     8행부터 · J열(10번째) 상품명 · 합포장 " / " · 「x N」 · 성함(K)·주소(L) 없는 메모 줄과 머리글 줄 제외. */
  /* 탭 하나를 상품별 합계로.
     🔴 2026-09-28 : 공용 sheets-proxy 가 45초 넘게 안 오는 일이 있다(구글 대기줄, 낮엔 1초).
        그래서 «우리 전용 웹앱» 을 먼저 부르고, 그게 안 되면 프록시로 되돌아간다. */
  function tallyTab(tab, startRow) {
    return sheetPost('tally', [], { tab: tab }).then(function (j) {
      var map = {};
      (j.rows || []).forEach(function (r) { map[nk(r.name)] = { name: r.name, qty: r.qty }; });
      return { map: map, lines: j.lines || 0, tab: j.tab || tab };
    }, function () {
      return tallyTabViaProxy(tab, startRow);       // 전용 입구가 막히면 예전 길로
    });
  }

  function tallyTabViaProxy(tab, startRow) {
    var from = startRow || 8;
    return sheetRead(tab + '!A' + from + ':N600').then(function (v) {
      var map = {}, lines = 0;
      v.forEach(function (row) {
        var prod = S(row[9]);
        if (!prod) return;
        var nm = S(row[10]), ad = S(row[11]);
        if (!nm && !ad) return;
        if (prod === '상품명' || nm === '성함') return;
        lines++;
        prod.split(' / ').forEach(function (part) {
          var t = S(part);
          if (!t) return;
          var m = t.match(/^(.*?)\s*[xX×]\s*(\d+)\s*(?:[(（][^)）]*[)）]?\s*)*$/);
          var name = m ? S(m[1]) : t;
          var q = m ? parseInt(m[2], 10) : 1;
          if (!name) return;
          var k = nk(name);
          if (!map[k]) map[k] = { name: name, qty: 0 };
          map[k].qty += q;
        });
      });
      return { map: map, lines: lines, tab: tab };
    });
  }
  /* 기준 날짜 — 칸에 적힌 값이 있으면 그것, 없으면 오늘. 칸은 사람이 고칠 수 있다. */
  function dayTab() {
    var e = document.getElementById('qtyb-day');
    var v = e ? String(e.value || '').replace(/[^0-9]/g, '') : '';
    return (v.length === 4) ? v : todayTab();
  }

  function todayTab() {
    var p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' })
      .format(new Date()).split('/');
    return p[1] + p[0];                       // dd/mm → mmdd
  }

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
      stuck: /안\s*풀림/.test(name),
      /* 🔒 잠긴 줄 — 상품명 옆에 「품절」·「안 풀림」·「수량최신화 전」 배지가 붙은 것.
         🔴 잔여가 31개 남아 있어도 «잡기가 열려 있지 않다» — 눌러도 안 잡힌다(2026-09-28 실측:
            자반고등어 10미 대, 총31·잔여31인데 우리 잡음 0, 대기만 15가 걸려 있었다).
            잔여를 믿고 «잡기» 로 판정하면 «잡았다» 고 해 놓고 하나도 안 잡힌다.
            → 잔여를 «없는 것» 으로 치고 대기를 건다 (홍팀장 : 「중요한 건 대기를 거는 거라고」). */
      locked: /품절|안\s*풀림|수량최신화/.test(name)
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
        /* 🔴 로그인이 풀리면 창고 대신 «로그인 화면» 이 돌아온다 — 줄이 0개라 조용히 «상품 없음» 이 되고,
           대조가 전부 «못 찾음» 으로 나온다(2026-09-28 21:18 실측). 그 자리에서 알아채고 알린다. */
        if (/type="password"/.test(html)) throw new Error('LOGOUT');
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
        /* 🔴 마이페이지에는 표가 여럿이다(알림 팝업 등). 머리글만 첫 표에서 읽고 줄은 전부 긁으면
           엉뚱한 표의 줄이 같은 칸 이름으로 해석된다 — 57개 상품·사용 0 이 그렇게 나왔다(2026-09-28).
           → «상품명 칸이 있는 표» 하나만 골라 그 표의 머리글과 그 표의 줄만 쓴다. */
        var tbl = null, th = [];
        [].forEach.call(d.querySelectorAll('table'), function (t) {
          if (tbl) return;
          var hs = [].map.call(t.querySelectorAll('thead th'), function (e) { return (e.textContent || '').trim(); });
          if (hs.length && colOf(hs, /상품명/) >= 0) { tbl = t; th = hs; }
        });
        var out = [];
        if (!tbl) return { th: [], rows: [] };
        siteRows(tbl).forEach(function (tr) {
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
        /* 🔴 2026-09-29 등갈비 : «기다리는 중» 줄의 수량만 센다. 끝난 대기(어제 것 등)까지 더하면
           걸어 둔 대기가 부풀어 «덮힘» 이 된다. «받은 수량» 도 부족분에서 빼지 않는다 — 받은 건 이미
           우리 잡음에 들어갔거나 어제 발주로 나간 것이다(등갈비: 어제 받은 2 를 빼서 4 필요가 2 로 줄었다). */
        wait.rows.forEach(function (x) {
          var k = nk(x.c[jN]); if (!k) return;
          var o = WAIT[k] || { qty: 0, got: 0, pend: 0, done: 0 };
          var live = /기다리는/.test(S(x.c[jS]));
          if (live) { o.qty += num(x.c[jQ]); o.pend++; } else o.done++;
          o.got += num(x.c[jG]);                          // '—' 은 0 으로 읽힌다 — 화면 안내용
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
    /* «이미 쓴 몫» 은 기준 날짜 시트에서 실제로 나간 수량을 먼저 본다 — 그게 정본이다.
       수량 웹 «사용» 칸은 사람이 손으로 적는 값이라 안 맞을 수 있어 보조로만 쓴다. */
    /* 🔴 날짜 시트를 읽었으면 거기 없는 상품은 0 개 나감이다 (2026-09-29 전어 90개).
       사용 칸으로 메우면, 잡으면서 적어 둔 사용 90 때문에 «이미 다 썼다» 가 되어 또 90 을 잡으려 든다. */
    var mineUsed = (DONE_MAP[row.key] != null)
      ? DONE_MAP[row.key]
      : (DONE_OK ? 0 : ((OURS[row.key] && OURS[row.key].used) || 0));
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
    /* ⚠️ 위의 avail(우리가 쓸 수 있는 몫)과 다른 것 — 창고 잔여다.
       🔒 잠긴 줄은 잔여가 남아 있어도 잡기가 안 열려 있다 → 0 으로 보고 대기로 돌린다. */
    var leftAvail = row.locked ? 0 : Math.max(0, row.left);
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
    /* 🔴 걸어 둔 대기·증량은 «이미 재고 없음에 내려가 있는 주문» 몫이 먼저다 (2026-09-29 홍팀장 알도루묵).
       「3개 기다리는 중에 2개가 더 들어왔으면 대기를 5개로 늘려야지」 — 예전엔 걸어 둔 3개로
       새 2개를 «덮힘» 처리했다. 그 3개는 재고 없음 탭의 주문 3개를 위해 건 것이다.
       → 걸어 둔 수에서 재고 없음 탭 수량을 빼고 남는 것만 지금 발주에 쓴다. */
    var parked = NONE_MAP[row.key] || 0;
    function freeOf(have) { return Math.max(0, have - parked); }
    var got = wa ? wa.got : 0;                 // 대기로 받은 것 — 안내용(부족분에서 빼지 않는다, loadMy 참고)
    var hole = rest;                           // 아직 못 메운 몫
    r.rest = rest;
    r.hole = hole;
    /* 총수량 0 인 줄(오늘 안 올라온 상품)도 여기로 온다 — 증량요청·대기 현황을 봐야 하기 때문이다.
       예전에는 이 줄을 먼저 잘라 증량요청으로 보냈다가, 이미 «거부» 맞은 갑오징어를 또 증량으로 냈다. */
    var base = (row.locked && row.left > 0)
      ? ('🔒 잠긴 줄 — 잔여 ' + row.left + '개가 남아 있어도 잡기가 안 열려 있습니다')
      : (ghost
          ? ('창고에 물건이 없는 줄 — 잡아 둔 ' + mine + '개는 못 받습니다'
             + (row.left < 0 ? ' (총수량 0 · 잔여 ' + row.left + ')' : '') )
          : (row.closed
              ? ('총수량 0 — 오늘 안 올라온 상품' + (row.left < 0 ? ' (잔여 ' + row.left + ')' : ''))
              : ('잔여 ' + row.left + '개로 ' + rest + '개 부족')));

    /* ⏰ 마감이 지났으면 무조건 «대기» 다 (홍팀장 2026-09-28 22시) :
         「수량은 오전 9시 전후해서 풀린다. 지금 저녁 10시잖아.
          16시 이후에 못 나간 거 포함해서 수량 구합니다 할 때는 이거 다 대기로 올려」
       ─ 오늘 장이 끝난 뒤의 증량요청은 관리팀이 받을 일이 없다. 대기를 걸어 두면 내일 아침 풀릴 때 받는다.
       ─ 「품절 안 풀림」·「아직 안 열림」 도 마감 뒤에는 똑같이 대기다.
       ─ 기준은 한국 시간. 그 상품 마감시각이 지났거나, 16시를 넘겼으면 마감 뒤로 본다.
       🔴 수량 웹이 대기를 못 받는 때가 있을 수 있다 — 그때는 실행이 서버 메시지를 그대로 보여 준다. */
    var ml0 = minsLeft(dlHour(row.dlRaw));
    /* ⏰ 그 상품 발주마감이 지났다(16시 전) → 대기도 증량도 걸지 않고 «재고 없음» 으로 (2026-09-29 홍팀장 :
         「동물복지 난각 2번 유정란 40구는 10시 마감 상품이잖아, 이런 건 그냥 재고 없음으로 넘기고
          마감시간 걸렸다고 해줘」). hole 은 그대로라 [🚫 재고 없음으로 이동] 에 같이 실린다.
       16시가 넘으면 아래 규칙(내일 몫으로 대기)이 그대로 산다. */
    if (kstNow() < 16 && ml0 != null && ml0 < 0) {
      r.set = 0; r.hole = short;               // 마감 지난 물건은 잔여가 있어도 잡지 않는다 — 모자란 몫 전부 내린다
      r.act = 'late';
      r.why = base + ' · ⏰ 발주마감(' + dlHour(row.dlRaw) + '시) 지남 — 오늘 못 나감, 재고 없음으로';
      return r;
    }
    if (kstNow() >= 16 || (ml0 != null && ml0 < 0)) {
      var hadW = (wa && wa.pend) ? freeOf(wa.qty) : 0;
      var addW0 = Math.max(0, hole - hadW);
      if (!addW0) {
        r.act = 'waitP';
        r.why = base + ' · 마감 뒤 — 이미 대기 ' + wa.qty + '개 걸어 둠' + (parked ? parkedTxt(parked) : '');
      } else {
        r.wait = addW0; r.haveW = (wa && wa.pend) ? wa.qty : 0;   // 실행 때 비교용 = 수량 웹에 걸린 실제 개수
        r.act = r.set ? 'set+wait' : 'wait';
        r.why = base + ' · 마감(' + (dlHour(row.dlRaw) || 16) + '시) 뒤라 내일 몫으로 대기'
          + (hadW ? (' · 걸어 둔 ' + hadW + '개 빼고 ' + addW0 + '개 추가') : '')
          + (parked && wa && wa.pend ? parkedTxt(parked) : '');
      }
      return r;
    }

    /* ⏰ 「품절 안 풀림」 인데 이미 풀릴 시간(10시)이 지났다 → 대기가 아니라 «증량요청» (2026-09-29 홍팀장 급냉 갑오징어) :
         「지금 10시 52분이잖아. 이미 열릴 건 다 열린 상황인데 이건 오히려 증량 요청 빨리 해서
          나오면 받고 안 나오면 그냥 포기 해야지」
       ─ 10시 전엔 아직 열릴 수 있으니 예전처럼 대기(잠긴 줄 규칙).
       ─ 증량이 거부됐으면 포기(🎯 구해야 → 업체에 없다고 안내). 걸어 둔 대기는 세지 않는다. */
    /* 🔴 단, 잔여가 남아 있는 줄은 증량요청을 걸 수 없다 — 수량 웹 규칙(「잔여가 남아 있으면 증량요청을 못 건다」,
          서버 morelib.php 도 거절). 2026-09-29 급냉 갑오징어 1kg : 총 50 · 잔여 50 인데 「품절 안 풀림」 이라
          잡기도 안 열리고 증량도 거절됐다. 이런 줄은 아래 잠긴 줄 규칙(대기)으로 간다. */
    if (row.stuck && kstNow() >= OPEN_HOUR && !(row.left > 0)) {
      var mFree = (mo && mo.pend) ? freeOf(mo.qty) : 0;
      if (mo && mo.no && !mo.pend) {
        r.hunt = hole; r.act = 'hunt';
        r.why = base + ' · ' + OPEN_HOUR + '시 지나도 안 풀림 · 증량 거부됨 → 포기(업체 안내)' + (mo.ans ? ' 「' + mo.ans + '」' : '');
      } else if (mFree >= hole) {
        r.act = 'moreP';
        r.why = base + ' · ' + OPEN_HOUR + '시 지나도 안 풀림 · 증량 ' + mo.qty + '개 요청해 두고 답 기다림';
      } else {
        r.more = hole - mFree; r.haveM = (mo && mo.pend) ? mo.qty : 0;
        r.act = 'more';
        r.why = base + ' · ' + OPEN_HOUR + '시 지나도 안 풀림 → 대기 말고 증량요청으로 빨리 확인'
          + (mFree ? (' · 걸어 둔 증량 ' + mFree + '개 빼고 ' + r.more + '개 추가') : '');
      }
      return r;
    }

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
    } else if (mo && mo.pend && freeOf(mo.qty) >= hole) {
      // 걸어 둔 증량요청이 지금 부족분을 이미 덮는다 → 그대로 기다린다
      r.act = 'moreP';
      r.why = base + ' · 증량 ' + mo.qty + '개 요청해 두고 답 기다림';
    } else if ((mo && mo.pend) || (wa && wa.pend)) {
      /* 이미 걸어 둔 대기·증량이 있는데 발주가 «더» 들어왔다 → 차액만큼만 «추가» 로 건다
         (홍팀장 2026-09-28 : 「처음에 10개가 필요했는데 12개로 늘어났으면
          대기 2개 추가하고 증량 2개를 추가하는 형태로」).
         🔴 걸어 둔 것을 무시하고 새로 부족분 전체를 거는 것도, 걸려 있다고 아무것도 안 하는 것도 틀렸다. */
      var haveW = (wa && wa.pend) ? freeOf(wa.qty) : 0;
      var haveM = (mo && mo.pend) ? freeOf(mo.qty) : 0;
      var addW = (wa && wa.pend) ? Math.max(0, hole - haveW) : 0;
      var addM = (mo && mo.pend) ? Math.max(0, hole - haveM) : 0;
      if (!addW && !addM) {
        r.act = (haveM ? 'moreP' : 'waitP');
        r.why = base + ' · 이미 걸어 둔 것으로 덮힘(대기 ' + haveW + ' · 증량 ' + haveM + ')' + (parked ? parkedTxt(parked) : '');
      } else {
        r.wait = addW; r.more = addM;
        /* 실행할 때 «그 사이 남이 더 걸었나» 를 보려고 들고 간다 — 🔴 이건 수량 웹에 걸린 «실제» 개수다.
           재고 없음 몫을 뺀 값을 넘기면 실행이 «그 사이 늘었다» 로 오판해 추가분을 깎는다. */
        r.haveW = (wa && wa.pend) ? wa.qty : 0; r.haveM = (mo && mo.pend) ? mo.qty : 0;
        r.act = addM ? (addW ? 'set+more' : (r.set ? 'set+more' : 'more')) : (r.set ? 'set+wait' : 'wait');
        r.why = base + ' · 걸어 둔 것(대기 ' + r.haveW + ' · 증량 ' + r.haveM + ')'
          + (parked ? parkedTxt(parked) : '') + '보다 늘어 '
          + (addW ? ('대기 ' + addW + '개') : '') + (addW && addM ? ' · ' : '') + (addM ? ('증량 ' + addM + '개') : '') + ' 추가';
      }
    } else if (row.locked) {
      /* 🔒 잠긴 줄(품절·안 풀림·수량최신화 전) — 잔여가 있든 없든 잡기가 안 열려 있다.
         🔴 여기서 할 일은 «대기를 거는 것» 이다 (홍팀장 2026-09-28 : 「없는 걸로 치고
            내가 대기 걸라고 했잖아, 중요한 건 대기를 거는 거라고」).
            증량요청으로 보내던 것을 대기로 바꿨다 — 열리는 순간 줄 서 있어야 받는다.
         이미 걸어 둔 대기가 있으면 차액만 추가한다. */
      var hadL = (wa && wa.pend) ? freeOf(wa.qty) : 0;
      var addL = Math.max(0, hole - hadL);
      if (!addL) {
        r.act = 'waitP';
        r.why = base + ' · 이미 대기 ' + wa.qty + '개 걸어 둠' + (parked ? parkedTxt(parked) : '');
      } else {
        r.wait = addL; r.haveW = (wa && wa.pend) ? wa.qty : 0;
        r.act = r.set ? 'set+wait' : 'wait';
        r.why = base + ' · 열릴 때 받게 대기'
          + (hadL ? (' · 걸어 둔 ' + hadL + '개 빼고 ' + addL + '개 추가') : '')
          + (parked && wa && wa.pend ? parkedTxt(parked) : '');
      }
    } else if (wa && wa.pend) {
      r.act = 'waitP';
      r.why = base + ' · 대기 ' + wa.qty + '개 걸어 둠' + (got ? (' · ' + got + '개 받음') : '');
    } else if (dr && /당첨/.test(dr.state)) {
      r.act = 'waitP';
      r.why = base + ' · 사다리 당첨 — 들어온 수량 확인';
    } else if (row.closed && !row.stuck) {
      /* 총수량이 0인데 「품절 안 풀림」 표시도 없다 = «아직 안 열린 상품» 이다.
         내일 열릴 것이라 관리팀에 증량을 요청할 일이 아니다 — 열리면 받게 대기를 걸어 둔다.
         (홍팀장 2026-09-28 : 「아직 오픈 안 된 애들은 내일 열리는 건데 … 증량으로 가지 말고
          대기로 들어가자, 대기 걸어두는 패턴으로 고정해」)
         🔴 「품절 안 풀림」 은 오늘 안 나온다는 뜻이라 그대로 증량요청이다(위 분기). */
      r.wait = hole;
      r.act = r.set ? 'set+wait' : 'wait';
      r.why = base + ' · 아직 안 열린 상품 — 열리면 받게 대기';
    } else {
      /* 대기를 걸까, 증량요청을 할까 (홍팀장 2026-09-28 예시로 확정) :
           「A가 10개 나왔는데 누가 9개를 썼다. 1개 잡고 5개를 대기 거는 건 미련한 거잖아.
            이런 건 빨리 증량요청을 해보고 안 되면 없다고 업체에 안내를 해야지」
         ─ 대기는 «남이 잡아 둔 것을 풀 때» 받는 것이다. 이미 다 팔려 나간 상품은 풀 사람이 없다.
         ─ 그러니 개수가 아니라 «총수량에서 못 채운 몫이 차지하는 비중» 으로 가른다.
           10개 중 5개 부족(50%)은 대기로 못 메운다 → 증량요청.
           50개 중 2개 부족(4%)은 누가 조금만 풀어도 받는다 → 대기.
         ─ 총수량을 모르면(0) 대기가 의미 없으니 증량요청. */
      var share = row.total > 0 ? (hole / row.total) : 1;
      var smallEnough = (hole <= WAIT_MAX) && (share <= WAIT_SHARE);
      if (smallEnough) {
        r.wait = hole; r.act = r.set ? 'set+wait' : 'wait';
        r.why = base + ' · 총 ' + row.total + '개 중 ' + hole + '개라 누가 풀면 받을 만함';
      } else {
        r.more = hole; r.act = r.set ? 'set+more' : 'more';
        r.why = base + (row.total > 0
          ? (' · 총 ' + row.total + '개 중 ' + hole + '개(' + Math.round(share * 100) + '%) — 대기로는 못 메움')
          : ' · 총수량을 몰라 대기가 의미 없음');
      }
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
      /* 🔴 목표 = 이미 나간 것(x.used) + 이번 필요 (2026-09-29 알도루묵 : 잡음 5 · 이미 나감 5 · 추가 필요 4 → 9).
            예전엔 필요수량만 목표로 잡아서 «이미 5개 잡혀 있음» 으로 건너뛰었다 — 화면엔 잡기 9 라고 해 놓고. */
      var goal = Math.min((x.used || 0) + x.need, f.mine + f.left);
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
      /* 🔴 사용 = 이미 나간 것 + 이번 필요 (잡은 것까지). 예전엔 이번 필요(4)만 적어서 이미 5 나간 알도루묵의
            사용 칸을 4 로 줄여 놨다(2026-09-29). 사용 칸은 줄이지 않는다 — 더 크게 적혀 있으면 그대로 둔다. */
      var v = Math.min((x.used || 0) + x.need, f.mine);
      if (v <= 0) return { skip: '잡은 것이 없음' };
      if (v <= f.used) return { skip: '이미 ' + f.used + '개로 적혀 있음' };
      return qpost({ do: 'used', tab: whTab(x.row), nkey: x.row.key, co: x.row.co, val: v })
        .then(function () { return { done: v, was: f.used }; });
    });
  }

  /* 대기 — judge 가 «이번에 걸 양» 을 계산해 준다(이미 걸어 둔 것이 있으면 차액만).
     🔴 무조건 건너뛰지 않는다 — 발주가 늘면 그만큼 «추가» 로 걸어야 한다(2026-09-28 홍팀장).
        다만 긁은 뒤 남이 더 걸었으면 그만큼 뺀다. */
  function actWait(x) {
    return freshRow(x.row).then(function (f) {
      var q = x.wait || 0;
      if (!q) return { skip: '걸 것 없음' };
      var expect = x.haveW || 0;
      if (f.wait > expect) q -= (f.wait - expect);           // 그 사이 늘어난 만큼 뺀다
      if (q <= 0) return { skip: '이미 대기 ' + f.wait + '개 걸려 있음' };
      /* 🔴 do=wait 의 qty 는 «더할 값» 이 아니라 «그 회사 대기 총량» 이다 (2026-09-29 자반 고등어 :
            대기 1 에 «1개 추가» 를 qty=1 로 보내서 1 로 덮였다). 수량 웹 자기 버튼도
            「이미 건 대기가 있으면 적은 수를 더해 보낸다」 — 똑같이 지금 걸린 수에 더해서 보낸다. */
      var total = f.wait + q;
      return qpost({ do: 'wait', tab: whTab(x.row), nkey: x.row.key, co: x.row.co, qty: total })
        .then(function () { return { done: q, was: f.wait, now: total }; });
    });
  }
  /* 증량요청 — 같은 규칙. 답 기다리는 요청이 이미 부족분을 덮으면 judge 가 아예 안 보낸다. */
  function actMore(x, why) {
    return freshRow(x.row).then(function (f) {
      var q = x.more || 0;
      if (!q) return { skip: '걸 것 없음' };
      // 수량 웹 규칙 : 잔여가 남아 있으면 증량요청을 못 건다(서버도 거절) — 보내지 않고 이유를 남긴다
      if (f.left > 0) return { skip: '잔여 ' + f.left + '개 남아 있어 증량요청 불가(수량 웹 규칙) — 대기로' };
      var expect = x.haveM || 0;
      if (f.more > expect) q -= (f.more - expect);
      if (q <= 0) return { skip: '이미 증량요청 ' + f.more + '개가 답을 기다리는 중' };
      return qpost({ do: 'more', tab: whTab(x.row), nkey: x.row.key, co: x.row.co,
                     qty: q, why: why || WHY_DEFAULT })
        .then(function () { return { done: q, was: f.more }; });
    });
  }
  /* 창고 코드는 줄 키 앞머리에 있다 — data-k = 「경기28\t양평해장국600G」 */
  function whTab(row) { return (row.k || '').split('\t')[0] || row.wh; }

  /* ── 패널 ───────────────────────────────────────────────────────── */
  var IDX = null;          // key → row (전체 창고 인덱스)
  var LASTWH = null;       // 마지막으로 긁은 창고 목록

  function css() {
    /* 🔴 이미 있으면 «그냥 두지» 말고 내용을 갈아 끼운다 — 북마크릿을 다시 눌러도
       옛 스타일이 남아 새 레이아웃이 안 먹었다(2026-09-28 폭이 520px 그대로). */
    var s = document.getElementById('qtyb-css');
    if (!s) {
      s = document.createElement('style');
      s.id = 'qtyb-css';
      document.head.appendChild(s);
    }
    s.textContent = [
      /* 상품명이 길어 세로로 접히면 표가 통째로 깨진다 — 폭을 넓게 잡고, 모자라면 가로로 민다
         (홍팀장 2026-09-28 「가로로 더 길어져도 되니까」) */
      '#' + PANEL_ID + '{position:fixed;right:14px;bottom:14px;width:980px;max-width:calc(100vw - 28px);',
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
      '#' + PANEL_ID + ' table{border-collapse:collapse;width:100%;font-size:12px;margin-top:8px;table-layout:auto}',
      '#' + PANEL_ID + ' .tw{overflow-x:auto}',          // 표가 넘치면 가로로 민다(줄바꿈 대신)
      '#' + PANEL_ID + ' table th,#' + PANEL_ID + ' table td{white-space:nowrap}',
      '#' + PANEL_ID + ' th{background:#eef2f7;padding:5px 6px;border:1px solid #dde3ea;white-space:nowrap}',
      '#' + PANEL_ID + ' td{padding:4px 6px;border:1px solid #e6eaef;text-align:center}',
      '#' + PANEL_ID + ' td.nm{text-align:left;max-width:none}',
      '#' + PANEL_ID + ' td.nm .mut{white-space:normal}',   // 판정 이유만 접히게 둔다
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
      '#' + PANEL_ID + ' .drop{border:1px solid #e5e7eb;background:#fff;color:#9ca3af;border-radius:6px;padding:1px 6px;font-size:12px;cursor:pointer}',
      '#' + PANEL_ID + ' .drop:hover{background:#fee2e2;border-color:#fecaca;color:#b91c1c}',
      '#' + PANEL_ID + ' .mut{color:#6b7280;font-size:11.5px}'
    ].join('');
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
      '<div class="hd"><b>📊 발주 대조</b>' +
      '<span class="mut" style="font-size:11px">' + QTYB_VER + '</span><span class="sp"></span>' +
      '<span class="mut" id="qtyb-stat">준비</span>' +
      '<button id="qtyb-min">—</button><button id="qtyb-x">✕</button></div>' +
      '<div class="bd">' +
      '  <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">' +
      /* 「🔄 창고 전부 긁기」 버튼은 뺐다 (2026-09-29 홍팀장 「버튼 최대한 줄이자」) —
         가져오기_당일·가져오기_재고없음 이 누를 때마다 새로 긁고, 카탈로그 재고도 그 판으로 같이 보낸다. */
      '    <span class="mut">대기 한도</span>' +
      '    <input id="qtyb-wm" value="' + WAIT_MAX + '" style="width:44px;text-align:center;border:1px solid #cfd6e0;border-radius:6px;padding:4px">' +
      '    <span class="mut">개까지는 증량 대신 대기</span>' +
      /* 📅 기준 날짜 — 이 날짜 시트에서 «이미 나간 수량» 을 읽어, 그만큼은 또 안 잡는다.
         밤에 내일 것을 미리 잡는 일이 있어 오늘 날짜로 굳히지 않는다(홍팀장 2026-09-28).
         한 번 고쳐 놓으면 고칠 때까지 그 값으로 간다. */
      '    <span class="mut" style="margin-left:10px">📅 날짜 시트</span>' +
      '    <input id="qtyb-day" value="' + esc(dayTab()) + '" placeholder="0929" style="width:58px;text-align:center;border:1px solid #cfd6e0;border-radius:6px;padding:4px">' +
      '    <span class="mut">여기 나간 건 또 안 잡음</span>' +
      '  </div>' +
      '  <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:6px">' +
      '    <span class="mut">📄 발주 시트</span>' +
      '    <input id="qtyb-sid" value="' + esc(SHEET_ID) + '" placeholder="월 시트 주소 붙여넣기" style="flex:1;min-width:180px;border:1px solid #cfd6e0;border-radius:6px;padding:4px;font-size:11px">' +
      '    <span class="mut" id="qtyb-sname"></span>' +
      '  </div>' +
      '  <div class="mut" style="margin:8px 0 4px">필요수량 — 상품명 + 수량 (탭 또는 띄어쓰기). 같은 상품 여러 줄이면 합칩니다.</div>' +
      '  <textarea id="qtyb-in" placeholder="연안 활 숫게 1kg&#9;30&#10;맛상 닭목살 1kg&#9;12"></textarea>' +
      '  <div style="display:flex;gap:6px;margin-top:7px;flex-wrap:wrap">' +
      '    <button class="pri" id="qtyb-sheet">📄 가져오기_당일</button>' +
      '    <button class="pri" id="qtyb-none">📦 가져오기_재고없음</button>' +
      '    <button id="qtyb-check">🧾 수량 점검</button>' +
      /* 「↩️ 구해진 것 당일로」 는 뺐다 (2026-09-29 홍팀장 「이거 2개 같은 기능」) — 📦 가져오기_재고없음 이
         잔여·잡아 둔 여유를 보고 [↩️ 여유분 당일로 올리기] 로 같은 일을 한다. 함수는 남겨 둠(qtyb-back). */
      '    <button id="qtyb-clr">비우기</button>' +
      '  </div>' +
      /* 📤 카탈로그 재고 — 누르면 한 번, 이 탭이 켜져 있으면 09~16시 30분마다 알아서 */
      '  <div style="display:flex;gap:6px;align-items:center;margin-top:7px;flex-wrap:wrap">' +
      '    <button class="pri" id="qtyb-stockgo">📤 카탈로그 재고 보내기</button>' +
      '    <span class="mut" id="qtyb-stock">09~16시 30분마다 자동 (이 탭이 켜져 있을 때)</span>' +
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
    el('qtyb-clr').onclick = function () { el('qtyb-in').value = ''; el('qtyb-out').innerHTML = ''; };
    el('qtyb-stockgo').onclick = function () { stockPush(false); };
    function sheetName() {
      var s = el('qtyb-sname'); if (!s) return;
      s.textContent = '확인 중…'; s.style.color = '';
      sheetPost('ping').then(function (j) {
        if (!j.name) { s.textContent = '⚠️ 시트 웹앱이 옛 버전 — 아직 9월 시트만 만집니다'; s.style.color = '#c62828'; return; }
        s.textContent = '✅ ' + j.name; s.style.color = '#1a7f37';
      }, function (e) {
        s.textContent = '⚠️ ' + e.message; s.style.color = '#c62828';
      });
    }
    el('qtyb-sid').onchange = function () {
      var id = sheetIdFrom(this.value);
      if (!id) { el('qtyb-sname').textContent = '⚠️ 시트 주소가 아닙니다'; el('qtyb-sname').style.color = '#c62828'; return; }
      this.value = id;
      SHEET_ID = id;
      try { localStorage.setItem(SKEY, id); } catch (e) {}
      DONE_MAP = {}; NONE_MAP = {}; DONE_OK = false;
      sheetName();
    };
    sheetName();
    /* 📄 시트에서 가져오기 — 당일 탭(=넣을 발주)과 오늘 날짜 탭(=이미 나간 것)을 한 번에 읽는다.
       붙여넣기를 시키지 않는다(홍팀장 2026-09-28 「시트와 웹이 유기적으로 안 돌아간다」). */
    /* 📄 가져오기_당일 — 「당일」(넣을 발주) 과 «기준 날짜 시트»(이미 나간 것) 를 같이 읽는다.
       🔴 나간 만큼은 이미 쓴 몫이라 «또 잡지 않는다» — 같은 발주에 수량을 두 번 잡던 것을 막는다
          (홍팀장 2026-09-28 : 「오늘 날짜에 저걸 썼는지 확인하면 또 잡아야 되는지 아닌지를 판별할 수 있다」).
          기준 날짜는 위 칸에서 고른다 — 밤에 내일 것을 미리 잡을 때가 있어서다. */
    el('qtyb-sheet').onclick = function () {
      var b = this, old = b.textContent;
      var day = dayTab();
      b.disabled = true; b.textContent = '창고 긁고 당일 읽는 중…';
      /* 🔄 누를 때마다 창고를 새로 긁는다 — 예전엔 한 번 긁은 판을 계속 써서 [창고 전부 긁기] 를 따로 눌러야 했다.
         긁은 판으로 카탈로그 재고도 같이 보낸다(뒤에서, 실패해도 대조는 그대로 간다). */
      Promise.all([
        tallyTab('당일'),
        tallyTab(day).catch(function () { return null; }),
        scanAll().then(function () { if (haveIdx()) stockPush(true, IDX); }).catch(function (e) { alert(e.message || e); })
      ]).then(function (r) {
        var need = r[0], done = r[1];
        DONE_OK = !!done; DONE_TAB = day; DONE_LINES = done ? done.lines : 0;
        done = done || { map: {}, lines: 0, tab: day };
        DONE_MAP = {};
        Object.keys(done.map).forEach(function (k) { DONE_MAP[k] = done.map[k].qty; });
        SHEET_DONE = Object.keys(done.map)
          .map(function (k) { return done.map[k].name + '\t' + done.map[k].qty; }).join('\n');
        var dEl = el('qtyb-done'); if (dEl) dEl.value = SHEET_DONE;
        el('qtyb-in').value = Object.keys(need.map)
          .map(function (k) { return need.map[k].name + '\t' + need.map[k].qty; }).join('\n');
        needSave(el('qtyb-in').value);
        stat('당일 ' + need.lines + '줄 · 상품 ' + Object.keys(need.map).length + '개 · '
           + (DONE_OK ? (day + ' 나간 것 ' + Object.keys(done.map).length + '개') : ('⚠️ ' + day + ' 시트 못 읽음')));
        b.disabled = false; b.textContent = old;
        run();                                  // 바로 대조까지 간다
      }, function (e) {
        b.disabled = false; b.textContent = old;
        stat('시트를 못 읽음');
        alert(e.message || e);
      });
    };

    /* 📦 가져오기_재고없음 — 「재고 없음」 탭을 읽어, 지금 여유가 있는 것을 당일로 올린다.
       홍팀장 2026-09-28 : 「이유가 어찌 됐건 아직 여유분이 있다면 … 여유분 당일로 옮겨」
       여유 = 잡아 두고 안 쓴 몫(잡음 − 나감) + 창고 잔여. 「물건없음」 줄은 뺀다. */
    el('qtyb-none').onclick = function () {
      var b = this, old = b.textContent;
      b.disabled = true; b.textContent = '재고 없음 읽는 중…';
      // 검토는 언제나 새로 긁는다 — 대기·증량을 건 직후 다시 볼 때 옛 잔여로 판정하면 안 된다
      scanAll().then(function () {
          if (haveIdx()) stockPush(true, IDX);      // 긁은 판으로 카탈로그 재고도 같이 (뒤에서)
          return loadMy();
        })
        /* 🔴 «잡아둔 여유» 는 시트 기준으로 센다 (2026-09-30 홍팀장 전어 11개) — 수량 웹 «사용» 칸이 아니라
              당일 탭에 남은 그 상품 + 기준 날짜 시트에 나간 것. 아침에 1개 잡으며 사용 1 을 적었는데 그 주문까지
              재고 없음으로 내려가서, 여유를 11−1=10 으로 보고 1개를 남겼다. 시트를 못 읽으면 예전처럼 사용 칸. */
        .then(function () {
          return Promise.all([tallyTab('재고 없음', 2),
                              tallyTab('당일').catch(function () { return null; }),
                              tallyTab(dayTab()).catch(function () { return null; })]);
        })
        .then(function (rr) {
          var no = rr[0], dg = rr[1], dn = rr[2];
          var sheetOk = !!(dg && dn);
          function sheetUsed(k) { return ((dg.map[k] && dg.map[k].qty) || 0) + ((dn.map[k] && dn.map[k].qty) || 0); }
          var keys = Object.keys(no.map);
          if (!keys.length) { stat('재고 없음 비어 있음'); el('qtyb-out').innerHTML = '<div class="warn">「재고 없음」 탭이 비어 있습니다.</div>'; b.disabled = false; b.textContent = old; return; }
          /* 2026-09-29 홍팀장 보강 — 이 검토는 «① 올릴 게 있나 ② 대기·증량이 제대로 걸렸나» 두 가지를 본다.
             · 🟢 넉넉 : 수량을 안 잡고 써도 되는 상품 → 원하는 만큼 올릴 수 있는 것으로 본다(잔여 「넉넉」 을 0 으로 읽던 것)
             · 🔒 잠긴 줄(품절·안 풀림·수량최신화 전) : 잔여가 있어도 잡기가 안 열려 있다 → 창고 잔여 0
             · ⏰ 그 상품 발주마감이 지났으면(16시 전) 오늘은 못 나간다 → 올리지도, 대기·증량을 요구하지도 않는다
             · 못 올리는 몫은 걸어 둔 대기+증량(답 기다림)으로 덮였는지 본다.
               10시가 지난 「품절 안 풀림」 은 대기가 아니라 증량요청이 걸려 있어야 한다. */
          var nowH = kstNow();
          var rows = keys.map(function (k) {
            var want = no.map[k].qty;
            var idx = IDX && IDX[k], o = OURS[k];
            var ghost = idx ? (idx.stuck || (idx.closed && idx.left < 0)) : false;
            var spare = o ? Math.max(0, o.got - (sheetOk ? sheetUsed(k) : o.used)) : 0;
            var free = !!(idx && idx.free);
            var left = free ? want : ((idx && !idx.locked) ? Math.max(0, idx.left) : 0);
            var cut = idx ? dlHour(idx.dlRaw) : null;
            var late = nowH < 16 && cut != null && nowH >= cut;
            var can = (ghost || late) ? 0 : Math.min(want, spare + left);
            var w = WAIT[k], m = MORE[k];
            var wq = (w && w.pend) ? w.qty : 0, mq = (m && m.pend) ? m.qty : 0;
            var gap = want - can, chk = '', bad = false, act = null;
            /* 마감까지 1시간도 안 남았으면 대기로는 못 받는다고 본다 → 증량요청 (홍팀장 2026-09-29 뒷고기모듬 12시 마감) */
            var soon = cut != null && !late && (cut - nowH) <= 1;
            var refused = !!(m && m.no && !m.pend);
            if (late) chk = '⏰ 마감(' + cut + '시) 지남 — 오늘 못 나감';
            else if (gap <= 0) chk = '올리면 끝';
            else if (!idx) { chk = '수량 웹에서 못 찾음 — 이름 확인'; bad = true; }
            /* 🔴 잔여가 남은 줄은 수량 웹이 증량요청을 거절한다(「잔여가 남아 있으면 증량요청을 못 건다」 — 급냉 갑오징어
                  총 50·잔여 50·품절 안 풀림). 그런 줄은 대기만 걸 수 있다 → 아래 대기 판정으로 보낸다. */
            else if (((idx.stuck && nowH >= OPEN_HOUR) || soon) && !(idx.left > 0)) {
              /* 대기로는 안 올 물건 — 증량요청이 걸려 있어야 한다. 걸어 둔 대기는 세지 않는다. */
              var why0 = idx.stuck && nowH >= OPEN_HOUR ? OPEN_HOUR + '시 지나도 안 풀림' : '마감(' + cut + '시) 1시간 안';
              if (refused) chk = '증량 거부 — 업체 안내';
              else if (mq >= gap) chk = '증량 ' + mq + ' 걸림';
              else { act = { t: 'more', n: gap - mq }; chk = '🔴 증량요청 ' + act.n + '개 필요 (' + why0 + (wq ? ' · 대기 ' + wq + '만 걸림' : '') + ')'; bad = true; }
            } else if (wq + mq >= gap) chk = (wq ? '대기 ' + wq : '') + (wq && mq ? ' · ' : '') + (mq ? '증량 ' + mq : '') + ' 걸림'
                + (idx.locked && idx.left > 0 ? ' (잔여 ' + idx.left + ' 남아 증량 불가 — 안 풀리면 관리팀 문의)' : '');
            else {
              var n0 = gap - wq - mq;
              /* 무엇을 걸까 — 당일 대조(judge)와 같은 기준 : 잠긴 줄·아직 안 열린 줄은 대기,
                 그 밖엔 총수량 대비 비중이 작으면 대기, 크면 증량요청. 증량이 거부된 상품은 대기로. */
              var share = idx.total > 0 ? (n0 / idx.total) : 1;
              var useWait = refused || idx.locked || idx.left > 0 || (idx.closed && !idx.stuck) || (n0 <= WAIT_MAX && share <= WAIT_SHARE);
              act = { t: useWait ? 'wait' : 'more', n: n0 };
              chk = '🔴 ' + (wq + mq ? '대기·증량 ' + (wq + mq) + '개뿐 — ' : '안 걸림 — ') + (useWait ? '대기 ' : '증량요청 ') + n0 + '개 필요';
              bad = true;
            }
            return { key: k, name: no.map[k].name, wh: idx ? idx.wh : (o ? o.wh : ''),
                     want: want, spare: spare, left: free ? '넉넉' : left, ghost: ghost, free: free,
                     cut: idx ? (idx.dlRaw || '') : '', late: late, chk: chk, bad: bad, can: can,
                     act: act, idx: idx, wq: wq, mq: mq };
          }).sort(function (a, c) { return (c.can - a.can) || ((c.bad ? 1 : 0) - (a.bad ? 1 : 0)); });
          var ok = rows.filter(function (r) { return r.can > 0; });
          var bads = rows.filter(function (r) { return r.bad; });
          var lates = rows.filter(function (r) { return r.late; });
          stat('재고 없음 ' + rows.length + '개 · 올릴 수 있는 것 ' + ok.length + '개');

          var h = '<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:9px;padding:9px 11px;margin:8px 0;font-size:13px">'
            + '📦 재고 없음 <b>' + rows.length + '개 상품</b> · 지금 여유가 있어 올릴 수 있는 것 <b>' + ok.length + '</b>개'
            + (lates.length ? ' · ⏰ 마감 지남 <b>' + lates.length + '</b>개' : '')
            + (bads.length ? ' · <b style="color:#b91c1c">🔴 대기·증량 확인 필요 ' + bads.length + '개</b>' : ' · 대기·증량 빠진 것 없음') + '</div>'
            + '<div class="tw"><table><thead><tr><th>창고</th><th>상품명</th><th>재고없음</th><th>잡아둔 여유</th><th>창고 잔여</th><th>올릴 수</th><th>발주마감</th><th>대기·증량</th></tr></thead><tbody>'
            + rows.map(function (r) {
                return '<tr' + (r.can > 0 ? ' style="background:#f0fdf4"' : (r.bad ? ' style="background:#fff1f2"' : '')) + '>'
                  + '<td>' + esc(r.wh) + '</td>'
                  + '<td class="nm">' + esc(r.name) + cpName(r.name) + (r.ghost ? ' <span class="tag t-hunt">물건없음</span>' : '') + (r.free ? ' <span class="tag t-free">넉넉</span>' : '') + '</td>'
                  + '<td>' + r.want + '</td><td>' + r.spare + '</td><td>' + r.left + '</td>'
                  + '<td' + (r.can > 0 ? ' style="font-weight:800;color:#065f46"' : ' class="mut"') + '>' + r.can + '</td>'
                  + '<td' + (r.late ? ' style="color:#b91c1c;font-weight:700"' : ' class="mut"') + '>' + esc(r.cut) + '</td>'
                  + '<td' + (r.bad ? ' style="color:#b91c1c;font-weight:700"' : '') + '>' + esc(r.chk) + '</td></tr>';
              }).join('')
            + '</tbody></table></div>';
          var acts = rows.filter(function (r) { return r.act && r.act.n > 0 && r.idx && r.idx.co; });
          if (ok.length || acts.length) {
            h += '<div style="margin-top:9px;display:flex;gap:6px;flex-wrap:wrap">'
              + (ok.length ? '<button class="pri" id="qtyb-upgo">↩️ 여유분 ' + ok.length + '건 당일로 올리기</button>' : '')
              + (acts.length ? '<button class="pri" id="qtyb-actgo" style="background:#b91c1c;border-color:#b91c1c">🚀 빠진 대기·증량 ' + acts.length + '건 걸기</button>' : '')
              + '</div><div class="mut" id="qtyb-uplog" style="margin-top:6px"></div>';
          }
          el('qtyb-out').innerHTML = h;
          b.disabled = false; b.textContent = old;

          /* 🚀 빠진 대기·증량 걸기 (2026-09-29 홍팀장 「물건 없는 상품들이 증량 요청은 들어가 있는지 대기수량은 걸려 있는지
             체크해 줘야 해, 안 되어 있다면 그것도 진행해야겠지」). 당일 대조의 실행과 같은 함수(actWait·actMore)를 쓴다 —
             걸기 직전에 그 줄을 다시 읽어 그 사이 누가 더 걸었으면 그만큼 뺀다. 대기는 총량으로 보낸다. */
          var ag = el('qtyb-actgo');
          if (ag) ag.onclick = function () {
            if (!confirm('수량 웹에 실제로 겁니다 — ' + acts.length + '건\n\n'
                + acts.map(function (r) { return '· [' + (r.act.t === 'more' ? '증량요청' : '대기') + '] ' + r.name + ' ' + r.act.n + '개'; }).join('\n')
                + '\n\n증량요청 사유 : ' + WHY_DEFAULT)) return;
            var bb = this; bb.disabled = true;
            var done = [], fail = [];
            (function step(i) {
              if (i >= acts.length) {
                el('qtyb-uplog').innerHTML = '<b>건 것</b><br>' + (done.length ? done.join('<br>') : '없음')
                  + (fail.length ? '<br><br><b style="color:#b91c1c">안 된 것</b><br>' + fail.join('<br>') : '')
                  + '<br><br>다시 읽는 중…';
                setTimeout(function () { el('qtyb-none').click(); }, 900);     // 걸린 상태로 다시 검토
                return;
              }
              var r = acts[i];
              bb.textContent = '거는 중 ' + (i + 1) + '/' + acts.length;
              var x = { row: r.idx, wait: r.act.t === 'wait' ? r.act.n : 0, more: r.act.t === 'more' ? r.act.n : 0, haveW: r.wq, haveM: r.mq };
              (r.act.t === 'more' ? actMore(x, WHY_DEFAULT) : actWait(x)).then(function (res) {
                if (res && res.skip) done.push('· ' + esc(r.name) + ' — 건너뜀: ' + esc(res.skip));
                else done.push('· ' + esc(r.name) + ' — ' + (r.act.t === 'more' ? '증량요청 ' : '대기 ') + r.act.n + '개'
                  + (res && res.now != null ? ' (대기 합계 ' + res.now + ')' : ''));
              }, function (e) {
                fail.push('· ' + esc(r.name) + ' — ' + esc(e && e.message ? e.message : e));
              }).then(function () { setTimeout(function () { step(i + 1); }, 320); });
            })(0);
          };

          var up = el('qtyb-upgo');
          if (up) up.onclick = function () {
            var list = ok.map(function (r) { return { name: r.name, qty: r.can }; });
            if (!confirm('「재고 없음」 에서 「당일」 로 올립니다 — ' + list.length + '건\n\n'
                + list.slice(0, 15).map(function (r) { return '· ' + r.name + ' ' + r.qty + '개'; }).join('\n')
                + (list.length > 15 ? '\n…' : ''))) return;
            var bb = this, o2 = bb.textContent;
            bb.disabled = true; bb.textContent = '올리는 중…';
            /* 🔴 합포장 줄 짝 맞추기 (2026-10-01 「사각어묵 2kg x 1 / 봉어묵 2kg x 1」) — 다 못 올리는 상품(대기·증량 중)을
                  deny 로 같이 보낸다. 시트는 그 상품이 섞인 합포장 줄을 다른 상품 몫으로 올리지 않는다. */
            var deny = rows.filter(function (r) { return r.can < r.want; }).map(function (r) { return r.name; });
            sheetPost('back', list, { deny: deny }).then(function (j) {
              bb.disabled = false; bb.textContent = o2;
              el('qtyb-uplog').innerHTML = '<b>올린 것</b><br>'
                + (j.done.length ? j.done.map(function (d) { return '· ' + esc(d.name) + ' — ' + d.moved + '줄 (' + d.units + '개)'; }).join('<br>') : '없음')
                + (j.miss.length ? ('<br><br><b style="color:#b91c1c">못 올린 것</b><br>' + j.miss.map(function (d) { return '· ' + esc(d.name) + ' ' + d.want + '개'; }).join('<br>')) : '')
                + '<br><br>당일에 있는 주문 <b>' + j.left + '줄</b>';
            }, function (e) {
              bb.disabled = false; bb.textContent = o2;
              el('qtyb-uplog').innerHTML = '<span style="color:#b91c1c">' + esc(e.message || e) + '</span>';
            });
          };
        }, function (e) {
          b.disabled = false; b.textContent = old;
          stat('시트를 못 읽음');
          alert(e.message || e);
        });
    };
    /* 🧾 점검 — 잡은 것 대비 쓴 것을 훑는다. 창고를 안 긁었으면 긁고 나서 센다. */
    /* 🧾 수량 점검 — «오늘 날짜 시트에 실제로 나간 수량» 을 제 손으로 읽어
       잡은 수량을 넘치지 않는지 본다(홍팀장 2026-09-28). 가져오기와 엮지 않는다. */
    el('qtyb-check').onclick = function () {
      var b = this, old = b.textContent;
      b.disabled = true; b.textContent = '세는 중…';
      var day = dayTab();
      var go = haveIdx() ? Promise.resolve() : scanAll();
      go.then(function () { return loadMy(); })
        .then(function () { return tallyTab(day).catch(function () { return null; }); })
        .then(function (done) {
          DONE_OK = !!done; DONE_TAB = day; DONE_LINES = done ? done.lines : 0;
          done = done || { map: {}, lines: 0 };
          SHEET_DONE = Object.keys(done.map)
            .map(function (k) { return done.map[k].name + '\t' + done.map[k].qty; }).join('\n');
          var dEl = el('qtyb-done'); if (dEl) dEl.value = SHEET_DONE;   // 🔴 전에 채워진 칸이 남아 옛 값으로 세던 것
          stat(DONE_OK ? (day + ' 시트 ' + done.lines + '줄 · 상품 ' + Object.keys(done.map).length + '개')
                       : ('⚠️ ' + day + ' 시트를 못 읽음'));
          checkPaint();
        })
        .then(function () { b.disabled = false; b.textContent = old; },
              function (e) { b.disabled = false; b.textContent = old; alert(e.message || e); });
    };
    /* ↩️ 구해진 것 당일로 — 대기를 받았거나 증량이 됐을 때. 상품명·수량만 적으면
       「재고 없음」 에서 그 수량만큼 위에서부터 「당일」 로 올라간다(줄은 안 쪼갠다).
       시트 창을 열 일이 없게 여기서 바로 보낸다(홍팀장 2026-09-28). */
    if (el('qtyb-back')) el('qtyb-back').onclick = function () {
      var box = el('qtyb-out');
      box.innerHTML = '<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:9px;padding:10px 12px;margin:8px 0">'
        + '<b>↩️ 구해진 것 당일로</b>'
        + '<div class="mut" style="margin:3px 0 6px">상품명과 수량을 적으세요 — 「재고 없음」 에서 그 수량만큼 「당일」 로 올라갑니다. '
        + '창고를 앞에 붙여도 되고 안 붙여도 됩니다.</div>'
        + '<textarea id="qtyb-backin" style="height:96px" placeholder="연안 급냉 갓성비 암게 1kg&#9;20&#10;초대왕 반건조 갑오징어 500g급&#9;5"></textarea>'
        + '<div style="margin-top:7px"><button class="pri" id="qtyb-backgo">↩️ 당일로 되돌리기</button></div>'
        + '<div class="mut" id="qtyb-backlog" style="margin-top:6px"></div></div>';
      el('qtyb-backgo').onclick = function () {
        var parsed = parseNeed(el('qtyb-backin').value);
        var list = Object.keys(parsed.map).filter(function (k) { return k.indexOf('#raw:') !== 0; })
          .map(function (k) { return { name: parsed.map['#raw:' + k] || k, qty: parsed.map[k] }; });
        if (!list.length) { alert('읽을 줄이 없습니다. 「상품명 <탭> 수량」 으로 적어 주세요.'); return; }
        if (!confirm('「재고 없음」 에서 「당일」 로 되돌립니다 — ' + list.length + '건\n\n'
            + list.slice(0, 15).map(function (r) { return '· ' + r.name + ' ' + r.qty + '개'; }).join('\n'))) return;
        var btn = this, old = btn.textContent;
        btn.disabled = true; btn.textContent = '되돌리는 중…';
        sheetPost('back', list).then(function (j) {
          btn.disabled = false; btn.textContent = old;
          el('qtyb-backlog').innerHTML =
            '<b>올린 것</b><br>' + (j.done.length
              ? j.done.map(function (d) { return '· ' + esc(d.name) + ' — ' + d.moved + '줄 (' + d.units + '개)'; }).join('<br>')
              : '없음')
            + (j.miss.length ? ('<br><br><b style="color:#b91c1c">못 올린 것</b> — 재고 없음에 그 수량으로 맞는 줄이 없습니다<br>'
                + j.miss.map(function (d) { return '· ' + esc(d.name) + ' ' + d.want + '개'; }).join('<br>')) : '')
            + (j.errs.length ? ('<br><br><b style="color:#b91c1c">오류</b><br>' + j.errs.map(esc).join('<br>')) : '')
            + '<br><br>당일에 있는 주문 <b>' + j.left + '줄</b>';
        }, function (e) {
          btn.disabled = false; btn.textContent = old;
          el('qtyb-backlog').innerHTML = '<span style="color:#b91c1c">시트에 보내지 못했습니다 — ' + esc(e.message || e) + '</span>';
        });
      };
    };
    huntPaint();               // 아침에 담아 둔 «구해야 할 것» 을 열 때마다 다시 보여 준다
    var kept = needLoad();     // 아까 붙여넣은 필요수량이 있으면 다시 채워 둔다
    if (kept) el('qtyb-in').value = kept.text;
    return p;
  }


  function stat(t) { var s = el('qtyb-stat'); if (s) s.textContent = t; }

  /* ✍️ 적힌 사용 맞추기 (2026-09-29 홍팀장) :
     「실제로 3개를 잡았고 3개가 정상적으로 나갔는데 순서가 꼬였든 뭐가 잘못돼서 적힌 사용에 기재만
       안 된 거라 볼 수 있잖아. 저런 건 니가 그냥 적힌 사용도 수정해 줘」
     조건 — 전부 맞아야 고친다:
       · 날짜 시트를 제대로 읽었다(DONE_OK) — 붙여넣은 칸이나 못 읽은 날엔 안 한다
       · 시트에 나간 수량 > 적힌 사용  (적힌 게 모자란 쪽만. 전어처럼 «적힌 90 · 나감 0» 은 안 건드린다
                                        — 아직 날짜 시트로 안 넘긴 것이다)
       · 나간 수량 ≤ 잡은 수량          (잡은 것보다 많이 나간 건 기재 누락이 아니라 초과 사용 — 사람이 본다)
     쓰기 직전에 그 줄을 다시 읽어(freshRow) 그 사이 값이 바뀌었으면 건너뛴다.
     같은 줄·같은 값은 한 번만 시도한다(건너뛴 줄 때문에 점검이 계속 다시 도는 것을 막는다). */
  var USEDFIX_BUSY = false, USEDFIX_LOG = '', USEDFIX_TRIED = {};
  function usedFix(rows) {
    if (USEDFIX_BUSY || !DONE_OK) return;
    var todo = rows.filter(function (r) {
      return r.out != null && r.out > r.used && r.out <= r.got && !r.ghost
        && IDX && IDX[r.key] && IDX[r.key].co && !USEDFIX_TRIED[r.key + '#' + r.out];
    });
    if (!todo.length) return;
    todo.forEach(function (r) { USEDFIX_TRIED[r.key + '#' + r.out] = 1; });
    USEDFIX_BUSY = true;
    stat('✍️ 적힌 사용 ' + todo.length + '건 맞추는 중…');
    var done = [], skip = [];
    (function step(i) {
      if (i >= todo.length) {
        USEDFIX_BUSY = false;
        USEDFIX_LOG = '✍️ <b>적힌 사용을 시트에 나간 수량으로 맞췄습니다 — ' + done.length + '건</b>'
          + (done.length ? '<br>' + done.map(function (d) { return '· ' + esc(d.name) + ' ' + d.was + ' → ' + d.to; }).join('<br>') : '')
          + (skip.length ? '<br><span class="mut">건너뜀 ' + skip.length + '건 — ' + skip.map(esc).join(' · ') + '</span>' : '');
        stat('✍️ 적힌 사용 ' + done.length + '건 맞춤');
        checkPaint();
        USEDFIX_LOG = '';
        return;
      }
      var r = todo[i], row = IDX[r.key];
      freshRow(row).then(function (f) {
        if (f.used >= r.out) { skip.push(r.name + '(이미 ' + f.used + ')'); return; }
        if (f.mine < r.out) { skip.push(r.name + '(잡은 것 ' + f.mine + ' < 나감 ' + r.out + ')'); return; }
        return qpost({ do: 'used', tab: whTab(row), nkey: row.key, co: row.co, val: r.out }).then(function () {
          if (OURS[r.key]) OURS[r.key].used = r.out;
          done.push({ name: r.name, was: f.used, to: r.out });
        });
      }).catch(function (e) {
        skip.push(r.name + '(' + (e && e.message ? e.message : '실패') + ')');
      }).then(function () { step(i + 1); });
    })(0);
  }

  /* ══ 🧾 수량 점검 — 잡은 것 · 쓴 것 · 실제로 남은 것 ═══════════════════
     홍팀장 2026-09-28 : 「수량이 내가 얼마나 썼고 실질적으로 얼마나 남았는지를 검토해야겠다.
                          지금 나 잡은거보다 많이 쓴거 많다」
     → 우리가 잡아 둔 줄 전체를 훑어 «초과 사용»(쓴 것 > 잡은 것)을 제일 위로 올린다.
       필요수량을 붙여넣어 두었으면 발주까지 넣어 세 값을 나란히 본다. */
  function checkPaint() {
    var box = el('qtyb-out');
    if (!box) return;
    var parsed = parseNeed(el('qtyb-in').value);
    foldAlias(parsed.map);
    /* 🔴 «실제로 몇 개 나갔나» 는 오늘 날짜 시트가 정본이다 (홍팀장 2026-09-28).
       수량 웹의 «사용» 칸은 사람이 손으로 적은 숫자라 실제와 다를 수 있다.
       시트 「🌐 수량 웹 정리」 의 [📋 오늘 나간 수량 복사] 를 이 칸에 붙여넣으면 그걸로 센다. */
    var doneParsed = parseNeed((el('qtyb-done') || { value: SHEET_DONE }).value || SHEET_DONE);
    foldAlias(doneParsed.map);
    var hasDone = Object.keys(doneParsed.map).some(function (k) { return k.indexOf('#raw:') !== 0; });
    var sheetBased = DONE_OK || hasDone;        // 시트를 읽었으면(0줄이어도) 시트가 정본

    var rows = Object.keys(OURS).map(function (k) {
      var o = OURS[k];
      var idx = IDX && IDX[k];
      var need = parsed.map[k];
      var out = doneParsed.map[k];              // 오늘 날짜 시트에서 실제로 나간 수량
      if (out == null && sheetBased) out = 0;   // 시트를 읽었는데 없으면 «안 나감» 이다 — 사용 칸으로 메우지 않는다
      return {
        key: k,
        wh: o.wh || (idx ? idx.wh : ''),
        name: idx ? idx.name : k,
        got: o.got,
        used: o.used,                               // 수량 웹 «사용» 칸(손으로 적은 값)
        out: (out == null ? null : out),            // 오늘 날짜 시트에서 실제로 나간 수량
        // 실제 나간 수량을 아는 줄은 그것으로 센다 — 모르면 사용 칸으로
        rest: o.got - (out == null ? o.used : out),
        over: Math.max(0, (out == null ? o.used : out) - o.got),
        misfit: (out != null && out !== o.used),    // 사용 칸과 실제가 어긋난 줄
        need: (need == null ? null : need),
        total: idx ? idx.total : null,
        left: idx ? idx.left : null,
        ghost: idx ? (idx.stuck || (idx.closed && idx.left < 0)) : false
      };
    });
    if (!rows.length) { box.innerHTML = '<div class="warn">잡아 둔 수량이 없습니다. [🔄 창고 전부 긁기] 를 먼저 눌러 보세요.</div>'; return; }

    var over = rows.filter(function (r) { return r.over > 0; });
    var misfit = rows.filter(function (r) { return r.misfit; });
    rows.sort(function (a, b) { return (b.over - a.over) || (b.rest - a.rest); });

    var real = function (r) { return r.out == null ? r.used : r.out; };
    var sumGot = rows.reduce(function (n, r) { return n + r.got; }, 0);
    var sumUse = rows.reduce(function (n, r) { return n + real(r); }, 0);
    var sumRest = rows.reduce(function (n, r) { return n + Math.max(0, r.rest); }, 0);

    var h = '<div style="background:#eef4ff;border:1px solid #c7d9f5;border-radius:9px;padding:9px 11px;margin:8px 0;font-size:13px">'
      + '🧾 <b>' + rows.length + '개 상품</b> · 잡음 <b>' + sumGot + '</b> · 나간 것 <b>' + sumUse + '</b> · 남은 것 <b>' + sumRest + '</b>'
      + '<div class="mut" style="margin-top:3px">' + (sheetBased
          ? ('«나간 것» = <b>' + esc(DONE_TAB || dayTab()) + ' 시트</b>에 실제로 들어간 발주' + (DONE_OK ? ' (' + DONE_LINES + '줄)' : '')
             + ' — 시트에 없는 상품은 0 개로 셉니다. 기준 날짜는 위 📅 칸.')
          : '⚠️ 날짜 시트를 못 읽어 수량 웹 «사용» 칸(손으로 적은 값)으로 세고 있습니다 — 믿지 마세요. [🧾 수량 점검] 을 다시 누르세요.') + '</div></div>'
      + '<div class="mut" style="margin:6px 0 3px">📤 오늘 나간 수량 <span style="opacity:.8">(오늘 날짜 시트 — [📄 시트에서 가져오기] 로 자동)</span></div>'
      + '<textarea id="qtyb-done" style="height:70px" placeholder="[📄 시트에서 가져오기] 를 누르면 저절로 채워집니다">'
      + esc((el('qtyb-done') || { value: SHEET_DONE }).value || SHEET_DONE) + '</textarea>'
      + '<div style="margin:5px 0 0"><button class="pri" id="qtyb-recheck">🔁 이 값으로 다시 세기</button></div>';

    if (over.length) {
      h += '<div class="hunt">🚨 잡은 것보다 많이 나간 것 ' + over.length + '건 — 그만큼은 잡지 않고 나간 수량입니다<br>'
        + over.map(function (r) {
            return '· ' + esc(r.wh) + ' / ' + esc(r.name) + ' 잡음 ' + r.got + ' · 나감 ' + real(r) + ' → <b>' + r.over + '개 초과</b>';
          }).join('<br>') + '</div>';
    }
    if (misfit.length) {
      h += '<div class="warn">📋 수량 웹 «사용» 칸이 실제와 다른 것 ' + misfit.length + '건 — 칸을 실제 나간 수량으로 맞춰야 합니다<br>'
        + misfit.slice(0, 15).map(function (r) {
            return '· ' + esc(r.name) + ' 적힌 값 ' + r.used + ' · 실제 ' + r.out + ' (차이 ' + (r.out - r.used) + ')';
          }).join('<br>') + (misfit.length > 15 ? '<br>…' : '') + '</div>';
    }

    h += '<div class="tw"><table><thead><tr><th>창고</th><th>상품명</th><th>잡음</th><th>나감</th><th>적힌 사용</th><th>남은 것</th><th>발주</th><th>창고 잔여</th></tr></thead><tbody>'
      + rows.map(function (r) {
          return '<tr' + (r.over ? ' style="background:#fff1f2"' : '') + '>'
            + '<td>' + esc(r.wh) + '</td>'
            + '<td class="nm">' + esc(r.name) + cpName(r.name) + (r.ghost ? ' <span class="tag t-hunt">물건없음</span>' : '') + '</td>'
            + '<td>' + r.got + '</td>'
            + '<td' + (r.over ? ' style="color:#b91c1c;font-weight:800"' : '') + '>' + (r.out == null ? '<span class="mut">' + r.used + '</span>' : '<b>' + r.out + '</b>') + '</td>'
            + '<td' + (r.misfit ? ' style="color:#b45309;font-weight:700"' : ' class="mut"') + '>' + r.used + '</td>'
            + '<td' + (r.rest > 0 ? ' style="font-weight:700"' : '') + '>' + r.rest + '</td>'
            + '<td>' + (r.need == null ? '<span class="mut">—</span>' : r.need) + '</td>'
            + '<td class="mut">' + (r.left == null ? '' : r.left) + '</td>'
            + '</tr>';
        }).join('')
      + '</tbody></table></div>'
      + '<div style="display:flex;gap:6px;margin-top:9px;flex-wrap:wrap">'
      +   '<button id="qtyb-cpover">📋 초과 사용 목록</button>'
      +   '<button id="qtyb-cprest">📋 안 쓴 것 목록</button></div>';

    if (USEDFIX_LOG) h = '<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:9px;padding:8px 11px;margin:8px 0;font-size:13px">' + USEDFIX_LOG + '</div>' + h;
    box.innerHTML = h;
    el('qtyb-recheck').onclick = function () { checkPaint(); };
    usedFix(rows);
    el('qtyb-cpover').onclick = function () {
      copy(over.map(function (r) { return r.wh + '\t' + r.name + '\t잡음 ' + r.got + '\t나감 ' + real(r) + '\t초과 ' + r.over; }).join('\n'), this);
    };
    el('qtyb-cprest').onclick = function () {
      copy(rows.filter(function (r) { return r.rest > 0; })
        .map(function (r) { return r.wh + '\t' + r.name + '\t' + r.rest; }).join('\n'), this);
    };
  }

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
  var SCAN_FAIL = [];      // 마지막 긁기에서 못 읽은 창고 — 있으면 그 판으로 카탈로그 재고를 보내지 않는다

  function scanAll() {
    return getChips().then(function (cs) { return scanChips(cs); });
  }
  function scanChips(cs) {
    if (!cs.length) { stat('창고 칩을 못 찾음'); return Promise.resolve(); }
    IDX = {};
    var n = 0, dup = 0, done = 0, fail = [], loggedOut = false;
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
      }).catch(function (e) {
        if (e && e.message === 'LOGOUT') loggedOut = true;
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
      SCAN_FAIL = loggedOut ? ['(로그인 풀림)'] : fail.slice();
      if (loggedOut) {
        stat('🔒 로그인이 풀렸습니다');
        throw new Error('수량 웹 로그인이 풀렸습니다.\n\n이 화면에서 다시 로그인한 뒤 눌러 주세요.\n'
          + '(그냥 두면 상품을 하나도 못 찾아 전부 «못 채운 것» 으로 나옵니다)');
      }
      stat('전체 ' + n + '줄 · ' + hhmm() + ' 기준'
        + (dup ? ' · 이름중복 ' + dup + '건' : '')
        + (fail.length ? ' · ⚠️ 못 읽은 창고 ' + fail.join(',') : '')
        + ' (' + ((Date.now() - t0) / 1000).toFixed(1) + '초)');
    });
  }

  /* ══ 📤 카탈로그 재고 보내기 (2026-09-29 홍팀장) ══════════════════════════
     「20개 미만은 소량 발주 가능, 완전히 0은 문의·재고 없음으로 노출하고 0개는 발주도 막는다.
       30분에 한 번씩 9시부터 4시까지」
     수량 웹 잔여를 창고 전부 긁어 우리 서버(Supabase)로 보낸다 → 카탈로그가 다음 굽기에 반영.
     🔴 masterc 원가표의 잔여(remain)는 못 쓴다 — 쫄깃 창고 9종을 0 으로, 연어(예외)·쭈꾸미(빈칸)도
        0 으로 준다(09-29 실측). 그대로 막으면 멀쩡한 물건이 발주가 막힌다. 그래서 여기서 보낸다.
     🔴 대조용 IDX 는 건드리지 않는다 — 홍팀장이 대조하는 도중에 30분 타이머가 돌아도 판이 안 바뀐다.
     보내는 것 : 상시 상품만(당일은 등록 토글이 기준이라 수량으로 막지 않는다).
       · 잠긴 줄(품절·안 풀림·수량최신화 전) → 0
       · 잔여 숫자 → 그 숫자
       · 넉넉 → 9999(충분) · 예외·빈칸 → 안 보냄(수량 미관리 — 막지도, 소량 딱지도 안 붙인다)
       · 홍어 삭힘정도 4종 → 「흑산도 전통 홍어 500g」 잔여 그대로
       · 연어(생연어·몸뱃살연어) → 「연안 몸뱃살연어 1kg」 잔여(kg) ÷ 그 상품 무게 */
  var QTY_API = 'https://yzttmdrlujgstfjsbser.supabase.co/functions/v1/api';
  var QTY_KEY = 'qty-mupztjvw4lefx7hsorc6';
  var STOCK_LAST = 'qtybStockLast';        // 마지막으로 보낸 시각(ms) — 탭을 새로 띄워도 이어 센다

  function stockRows() {
    return getChips().then(function (cs) {
      if (!cs.length) throw new Error('창고 칩을 못 찾음');
      var all = {}, fail = [], loggedOut = false, q = cs.slice();
      function take() {
        if (!q.length) return Promise.resolve();
        var c = q.shift();
        return fetchSec(c.tab).then(function (rows) {
          rows.forEach(function (r) { if (!all[r.key]) all[r.key] = r; });
        }).catch(function (e) {
          if (e && e.message === 'LOGOUT') loggedOut = true;
          fail.push(c.label || c.tab);
        }).then(take);
      }
      var lanes = [];
      for (var i = 0; i < LANES; i++) lanes.push(take());
      return Promise.all(lanes).then(function () {
        if (loggedOut) throw new Error('수량 웹 로그인이 풀렸습니다');
        /* 🔴 창고를 하나라도 못 읽었으면 보내지 않는다 — 그 창고 물건이 전부 «모름»으로 빠진다. */
        if (fail.length) throw new Error('못 읽은 창고: ' + fail.join(','));
        return all;
      });
    });   // 줄 묶음 그대로 — stockPush 가 시트 집계와 같이 stockMap 에 넘긴다
  }
  /* 긁은 줄 묶음(상품키 → 줄) → 보낼 재고. 따로 긁은 것(stockRows)이든 가져오기가 긁은 IDX 든 같은 규칙. */
  /* 🟢 우리 몫도 재고다 (2026-09-30 홍팀장 활 새우 — 증량 20개를 받았는데 잔여 0 이라 카탈로그가 막았다).
       재고 = 창고 잔여(잠긴 줄은 0) + 마찬 칸 중 시트에 아직 안 쓰인 것.
       «시트에 쓰인 것» = 당일 + 재고 없음 + 기준 날짜 시트의 그 상품 주문 (수량 웹 «사용» 칸은 안 본다 — 전어 사고).
       used 가 없으면(시트를 못 읽음) 예전처럼 잔여만 본다 — 모르는 몫으로 발주를 열지 않는다. */
  function stockMap(all, used) {
      var m = {};
      Object.keys(all).forEach(function (k) {
        var r = all[k];
        if (r.kind !== '상시') return;
        var ghost = r.stuck || (r.closed && r.left < 0);
        var spare = (used && !ghost) ? Math.max(0, (r.mine || 0) - (used[k] || 0)) : 0;
        if (r.locked) { m[k] = spare; return; }
        /* 🟢 넉넉도 숫자로 보낸다 (2026-09-29 홍팀장 「넉넉도 혹시 모르니까 수량 넣고 가져와」) —
           «모름» 이 아니라 «충분» 이라는 게 서버에 남는다. 9999 = 넉넉 (소량·재고 없음 어디에도 안 걸림). */
        if (r.free && /넉넉/.test(r.leftRaw)) { m[k] = 9999; return; }
        if (!r.leftRaw || r.free) return;
        m[k] = Math.max(0, r.left) + spare;
      });
      ALIAS.forEach(function (a) {
        var base = m[nk(a.to)];
        if (base === undefined) return;
        Object.keys(all).forEach(function (k) {
          var r = all[k];
          if (r.kind !== '상시' || !a.hit(r.name)) return;
          m[k] = a.weight ? Math.floor(base / kgOf(r.name)) : base;
        });
      });
      return m;
  }

  /* preset = 방금 가져오기가 긁어 둔 IDX (2026-09-29 홍팀장 「카탈로그 재고 보내기도 가져오기 누를 때 같이」).
     그걸 그대로 쓰면 창고를 두 번 긁지 않는다. 🔴 창고를 하나라도 못 읽은 판이면 보내지 않는다. */
  function stockPush(auto, preset) {
    if (window.__QTYB_PUSHING) return Promise.resolve(false);
    window.__QTYB_PUSHING = true;
    var sEl = el('qtyb-stock');
    if (sEl) sEl.textContent = '📤 보내는 중…';
    // 시트에 쓰인 주문 — 셋 중 하나라도 못 읽으면 null(우리 몫은 안 더한다)
    var usedP = Promise.all([tallyTab('당일'), tallyTab('재고 없음', 2), tallyTab(dayTab())]).then(function (ts) {
      var u = {};
      ts.forEach(function (t) { Object.keys(t.map).forEach(function (k) { u[k] = (u[k] || 0) + (t.map[k].qty || 0); }); });
      return u;
    }, function () { return null; });
    var src = preset
      ? (SCAN_FAIL.length ? Promise.reject(new Error('못 읽은 창고: ' + SCAN_FAIL.join(','))) : Promise.resolve(preset))
      : stockRows();
    return Promise.all([src, usedP]).then(function (x) { return stockMap(x[0], x[1]); }).then(function (m) {
      var rows = Object.keys(m).map(function (k) { return [k, m[k]]; });
      return fetch(QTY_API, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'qtypush', key: QTY_KEY, rows: rows })
      }).then(function (r) { return r.json(); });
    }).then(function (j) {
      window.__QTYB_PUSHING = false;
      if (!j || !j.ok) throw new Error((j && j.error) || '서버가 거절했습니다');
      try { localStorage.setItem(STOCK_LAST, String(Date.now())); } catch (e) {}
      if (sEl) sEl.textContent = '📤 ' + hhmm() + ' 보냄 · ' + j.count + '개 (재고없음 ' + j.zero + ' · 소량 ' + j.low + ')'
        + (auto ? ' · 자동' : '');
      return true;
    }).catch(function (e) {
      window.__QTYB_PUSHING = false;
      if (sEl) sEl.textContent = '⚠️ ' + hhmm() + ' 재고 못 보냄 — ' + (e.message || e);
      if (!auto) alert('카탈로그 재고를 못 보냈습니다.\n\n' + (e.message || e));
      return false;
    });
  }

  /* ⏰ 30분마다 — 09:00~16:00 (KST). 이 탭이 켜져 있어야 돈다(서버가 수량 웹을 못 읽는다).
     숨은 탭은 크롬이 타이머를 1분에 한 번으로 묶지만 30분 간격이라 상관없다.
     실패하면 다음 1분에 다시 한다(같은 30분 칸 안에서). */
  function stockTimer() {
    if (window.__QTYB_TIMER) clearInterval(window.__QTYB_TIMER);
    function tick() {
      var mins = Math.round(kstNow() * 60);          // kstNow() = 시(소수) — 14.5 = 14:30
      if (mins < 9 * 60 || mins > 16 * 60) return;
      var last = 0;
      try { last = parseInt(localStorage.getItem(STOCK_LAST) || '0', 10) || 0; } catch (e) {}
      if (Date.now() - last < 29 * 60 * 1000) return;
      stockPush(true);
    }
    window.__QTYB_TIMER = setInterval(tick, 60 * 1000);
    tick();
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
    DROPPED = {};                       // 새로 대조하면 ✕ 로 뺐던 것도 다시 살린다

    var go = haveIdx() ? Promise.resolve() : scanAll();
    var noneWarn = '';
    return go.then(function () { return loadMy(); }).then(function () {
      /* 재고 없음 탭 — 걸어 둔 대기가 누구 몫인지 가르는 데 쓴다. 못 읽으면 예전처럼(0) 가고 화면에 알린다. */
      return tallyTab('재고 없음', 2).then(function (no) {
        NONE_MAP = {};
        Object.keys(no.map).forEach(function (k) { NONE_MAP[k] = no.map[k].qty; });
      }, function () {
        NONE_MAP = {};
        noneWarn = '⚠️ 「재고 없음」 탭을 못 읽었습니다 — 걸어 둔 대기가 전부 이번 발주 몫으로 계산됐습니다(실제보다 적게 걸 수 있음).';
      });
    }).then(function () {
      /* 창고를 하나도 못 읽었으면 대조를 하지 않는다 — 하면 전부 «못 찾음» 으로 나와
         그 목록이 그대로 「재고 없음」 으로 갈 뻔한다(2026-09-28). */
      if (!haveIdx()) {
        el('qtyb-out').innerHTML = '<div class="hunt">🔒 창고를 하나도 못 읽었습니다 — 대조하지 않았습니다.<br>'
          + '수량 웹 로그인이 풀렸는지 보고, 다시 로그인한 뒤 [🔄 창고 전부 긁기] 를 눌러 주세요.</div>';
        return;
      }
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
      if (noneWarn) notes.push(noneWarn);
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
    hunt: ['t-hunt', '🎯 구해야'], moreP: ['t-wait', '증량 답 기다림'], waitP: ['t-wait', '대기 중'],
    late: ['t-hunt', '⏰ 마감 지남']
  };

  function draw(hits, miss, bad, notes) {
    // 손봐야 할 것 먼저 : 증량 → 대기 → 잡기 → 풀어야 → 그대로
    var ord = { late: 0, hunt: 0, more: 1, 'set+more': 1, wait: 2, 'set+wait': 2, moreP: 3, waitP: 3,
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
    /* 🔴 2026-09-29 알도루묵 : 「사용」 칸(4)만 믿어서 «남음 1» 이라 했는데 날짜 시트엔 이미 5 가 나갔고
          이번 당일에 4 가 더 필요했다(아래 표는 잡기 9). 위아래가 딴소리를 했다.
          → 쓴 것 = max(사용 칸, 날짜 시트에 나간 것 + 이번 당일 필요). 같은 자로 센다. */
    var needBy = {};
    hits.forEach(function (x) { needBy[x.row.key] = (needBy[x.row.key] || 0) + (x.need || 0); });
    var idle = Object.keys(OURS).map(function (k) {
      var o = OURS[k];
      var out = (DONE_MAP[k] != null ? DONE_MAP[k] : 0) + (needBy[k] || 0);
      var spent = Math.max(o.used, out);
      return { key: k, wh: o.wh, got: o.got, used: spent, left: o.got - spent,
               name: (IDX && IDX[k]) ? IDX[k].name : k };
    }).filter(function (o) { return o.left > 0; }).sort(function (a, b) { return b.left - a.left; });
    if (idle.length) {
      var tot = idle.reduce(function (n, o) { return n + o.left; }, 0);
      h += '<div class="warn">⚠️ 잡았는데 안 쓴 것 ' + idle.length + '건 · ' + tot + '개 — 마감까지 안 나가면 그대로 우리 몫입니다.<br>'
        + idle.slice(0, 12).map(function (o) {
            return '· ' + esc(o.wh) + ' / ' + esc(o.name) + ' 잡음 ' + o.got + ' · 쓴 것(나감+이번 발주) ' + o.used + ' → 남음 <b>' + o.left + '</b>';
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

    h += '<div class="tw"><table><thead><tr><th>빼기</th><th>판정</th><th>창고</th><th>상품명</th><th>필요</th><th>잡음</th>' +
      '<th>잔여</th><th>잡기</th><th>대기</th><th>증량</th><th>마감</th></tr></thead><tbody>';
    hits.forEach(function (x) {
      var t = TAG[x.act] || TAG.ok;
      var ml = minsLeft(dlHour(x.row.dlRaw));
      h += '<tr>' +
        /* ✕ 중복이라고 판단한 줄은 실행 전에 뺀다 (홍팀장 2026-09-28 :
           「내가 중복인 걸 알면 판정대로 실행하기 전에 칸을 삭제할 수 있게 해줘」) */
        '<td><button class="drop" data-drop="' + esc(x.row.key) + '" title="이 줄 빼기">✕</button></td>' +
        '<td><span class="tag ' + t[0] + '">' + t[1] + '</span></td>' +
        '<td>' + esc(x.row.wh) + '</td>' +
        '<td class="nm">' + esc(x.row.name) + cpName(x.raw || x.row.name) + '<div class="mut">' + esc(x.why) + '</div></td>' +
        '<td><b>' + x.need + '</b></td>' +
        '<td>' + x.mine + '</td>' +
        '<td>' + x.row.left + '</td>' +
        '<td>' + (x.set ? '<b>' + ((x.ghost ? 0 : x.mine) + x.set) + '</b>' : '') + '</td>' +
        '<td>' + (x.wait || '') + '</td>' +
        '<td>' + (x.more || '') + '</td>' +
        '<td class="mut">' + esc(x.row.dlRaw.replace(/^.*?:\s*/, '')) + (ml != null && ml <= 120 ? ' <b>' + ml + '분</b>' : '') + '</td>' +
        '</tr>';
    });
    h += '</tbody></table></div>';

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
    /* 🔴 막는 것은 «잡을 수 있는데 아직 안 잡은 것(nSet)» 뿐이다.
       대기·증량요청은 걸어 두어도 오늘 물건이 오는 것이 아니니 못 채운 몫에 들어가는 것이 맞다.
       (2026-09-28 : 셋 다 막았더니 증량요청이 남아 목록을 영영 못 뽑았다) */
    var pending = nSet;
    h += '<div style="display:flex;gap:6px;margin-top:9px;flex-wrap:wrap">' +
      '<button class="pri" id="qtyb-send">🚫 재고 없음으로 이동' + (holes.length ? ' (' + holes.length + ')' : '') + '</button></div>' +
      '<div class="mut" style="margin-top:5px">잡고도 남은 몫 전부(대기·증량 걸어 둔 것 포함)가 시트 「당일」 에서 「재고 없음」 으로 내려갑니다.</div>';

    el('qtyb-out').innerHTML = h;

    var byKey = {};
    hits.forEach(function (x) { byKey[x.row.key] = x; });

    /* ✕ 줄 빼기 — 중복이라고 판단한 줄을 실행 전에 뺀다. 뺀 줄은 잡기·대기·증량·내리기에서 모두 빠진다. */
    [].forEach.call(document.querySelectorAll('#' + PANEL_ID + ' [data-drop]'), function (b) {
      b.onclick = function () {
        var k = this.getAttribute('data-drop');
        DROPPED[k] = 1;
        draw(hits.filter(function (x) { return !DROPPED[x.row.key]; }), miss, bad, notes);
      };
    });

    var runBtn = el('qtyb-run');
    if (runBtn) runBtn.onclick = function () {
      /* 할 일을 한 줄로 늘어놓는다 — 잡기부터. 잔여를 먼저 먹고 나서 대기·증량을 걸어야
         「잡을 수 있었는데 대기를 건」 일이 안 생긴다. */
      var jobs = [];
      hits.forEach(function (x) { if (x.set)  jobs.push({ t: '잡기',   x: x, n: x.mine + x.set, f: function () { return actSet(x); } }); });
      /* 잡은 뒤 «사용» 을 채운다 — 잡아만 두고 안 썼다고 잡히면 마감 때 풀라는 경고가 뜬다.
         잡기가 없던 줄(이미 넉넉히 잡아 둔 것)도 채워야 하므로 필요수량이 있는 줄 전부를 본다. */
      hits.forEach(function (x) { if (x.need > 0) jobs.push({ t: '사용', x: x, n: Math.min((x.used || 0) + x.need, x.mine + (x.set || 0)), f: function () { return actUsed(x); } }); });
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

    /* 🚫 시트에 바로 보내기 — 복사·붙여넣기 없이 「재고 없음」 으로 내린다 */
    el('qtyb-send').onclick = function () {
      if (!holes.length) { alert('못 채운 것이 없습니다 — 내릴 줄이 없습니다.'); return; }
      if (pending && !confirm('아직 «잡을 수 있는데 안 잡은 것» 이 ' + pending + '건 남아 있습니다.\n'
          + '이대로 내리면 그만큼도 「재고 없음」 으로 갑니다.\n\n그래도 내릴까요?')) return;
      var list = holes.map(function (x) { return { name: (x.raw || x.row.name), qty: x.hole }; });
      if (!confirm('「재고 없음」 으로 내립니다 — ' + list.length + '건\n\n'
          + list.slice(0, 15).map(function (r) { return '· ' + r.name + ' ' + r.qty + '개'; }).join('\n')
          + (list.length > 15 ? '\n…' : ''))) return;
      var btn = this, old = btn.textContent;
      btn.disabled = true; btn.textContent = '시트에 보내는 중…';
      sheetPost('out', list).then(function (j) {
        btn.disabled = false;
        btn.textContent = '✅ ' + j.done.length + '건 내림';
        var m = '🚫 재고 없음으로 내렸습니다\n\n'
          + (j.done.length ? j.done.map(function (d) { return '· ' + d.name + ' — ' + d.moved + '줄 (' + d.units + '개)'; }).join('\n') : '(없음)')
          + (j.miss.length ? ('\n\n못 내린 것(당일에 그 상품 줄이 없음)\n' + j.miss.map(function (d) { return '· ' + d.name + ' ' + d.want + '개'; }).join('\n')) : '')
          + (j.errs.length ? ('\n\n오류\n' + j.errs.join('\n')) : '')
          + '\n\n당일에 남은 주문 ' + j.left + '줄';
        alert(m);
      }, function (e) {
        btn.disabled = false; btn.textContent = old;
        alert('시트에 보내지 못했습니다 — ' + (e.message || e));
      });
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

  /* 📋 상품명 옆 복사 버튼 (2026-09-29 홍팀장) — 시트·수량 웹에서 찾을 때 쓴다.
     수량 웹 상품명에 붙는 「품절 안 풀림」·「수량최신화 전」 꼬리말은 떼고 복사한다(그대로면 검색이 안 걸린다). */
  function cpName(name) {
    var n = String(name || '').replace(/(\s*(품절|안\s*풀림|수량최신화\s*전))+\s*$/, '').trim();
    return ' <button type="button" class="qtyb-cp" data-cp="' + esc(n) + '" title="상품명 복사"'
      + ' style="border:1px solid #cfd6e0;background:#fff;border-radius:5px;padding:0 5px;font-size:11px;cursor:pointer;vertical-align:1px">📋</button>';
  }
  if (!window.__QTYB_CPBOUND) {
    window.__QTYB_CPBOUND = true;
    document.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('.qtyb-cp') : null;
      if (!b) return;
      e.preventDefault(); e.stopPropagation();
      var t = b.getAttribute('data-cp') || '';
      var fin = function (ok) { b.textContent = ok ? '✅' : '❌'; setTimeout(function () { b.textContent = '📋'; }, 1200); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { fin(true); }, function () { fin(false); });
      else fin(false);
    }, true);
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
    idx: function () { return IDX; },
    stockPush: stockPush, stockRows: stockRows
  };
  build();
  stockTimer();
})();
