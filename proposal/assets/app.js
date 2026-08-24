/* =========================================================
   상품 제안서 — 렌더링 로직
   - 구글 시트가 연결돼 있으면 시트에서 상품을 읽어옵니다.
   - 없거나 오류가 나면 기본 데이터(data/products.json)로 표시합니다.
   ========================================================= */
(function () {
  "use strict";

  var CFG = window.PROPOSAL_CONFIG || {};

  // accent 색에서 연한 배경색들을 계산
  function mix(hex, ratio) {
    hex = String(hex || "#0E8A8F").replace("#", "");
    if (hex.length === 3) hex = hex.split("").map(function (c) { return c + c; }).join("");
    var r = parseInt(hex.substr(0, 2), 16), g = parseInt(hex.substr(2, 2), 16), b = parseInt(hex.substr(4, 2), 16);
    if (isNaN(r)) { r = 14; g = 138; b = 143; }
    function m(c) { return Math.round(255 - (255 - c) * ratio); }
    function h(c) { return ("0" + m(c).toString(16)).slice(-2); }
    return "#" + h(r) + h(g) + h(b);
  }
  /* 🚨 고정 규칙 (2026-08-24 홍팀장): 카테고리 앞 네모 안은 «이모지»다. 한자(魚·肉·食…) 박지 말 것.
     catalog.html 의 분류 아이콘과 같은 것을 쓴다 — 카탈로그와 제안서에서 같은 그림이 보이게.
     시트(제안서카테고리)에 옛 한자가 남아 있어도 여기서 덮어쓴다. */
  var CAT_ICON = {
    "수산": "🐟", "축산": "🥩", "가공식품": "🥫", "김치·반찬": "🥬", "김치반찬": "🥬",
    "농산물": "🌾", "쌀·잡곡": "🌾", "채소": "🥕", "과일": "🍎", "생활용품": "🧴", "기타": "📦",
    // 옛 key 폴백
    "fish": "🐟", "meal": "🥫", "living": "🧴"
  };
  function catIcon(key, fallback) {
    if (CAT_ICON[key]) return CAT_ICON[key];
    var f = String(fallback || "").trim();
    // 한자 한 글자짜리 옛 표시는 버린다
    return (f && !/^[一-鿿]$/.test(f)) ? f : "📦";
  }
  function buildCat(row) {
    var accent = row.accent || "#0E8A8F";
    var fit = row.fit || "cover";
    return {
      key: row.key, name: row.name || "", mark: catIcon(row.key, row.mark), eyebrow: row.eyebrow || "",
      descr: row.descr || "", meta: row.meta || "", accent: accent, fit: fit,
      soft: mix(accent, 0.12), imgBg: fit === "contain" ? "#ffffff" : mix(accent, 0.12),
      rowBg: mix(accent, 0.06), pillBg: mix(accent, 0.18)
    };
  }
  // 기본 카테고리(테이블 없거나 비었을 때 폴백)
  var DEFAULT_CATS = [
    { key: "fish",   name: "신선 수산물", mark: "🐟", eyebrow: "SEAFOOD · 메인 카테고리", descr: "동해·군산·인천·충무 창고를 직접 운영하여 수산물 공급", meta: "동해 · 군산 · 인천 창고", accent: "#0E8A8F", fit: "cover" },
    { key: "meal",   name: "간편식품",   mark: "🥫", eyebrow: "CONVENIENCE FOOD",       descr: "탕·전골·튀김 등 회전율 높은 즉석·냉동 품목 (하남·김포).",       meta: "하남 · 김포 · 푸카 창고", accent: "#FF5B39", fit: "cover" },
    { key: "living", name: "생활용품",   mark: "🧴", eyebrow: "LIVING GOODS",           descr: "찐한국 위생·주방 소모품, 정기 납품에 유리한 저단가 구성.",       meta: "찐한국 · 위생/주방",     accent: "#3BA559", fit: "contain" }
  ];
  var CAT = {};
  var CAT_ORDER = [];
  function setCategories(rows) {
    CAT = {}; CAT_ORDER = [];
    (rows && rows.length ? rows : DEFAULT_CATS).forEach(function (row) {
      if (!row.key) return;
      if (row.show === false) return;   // 숨긴 카테고리는 공개 사이트에서 제외
      CAT[row.key] = buildCat(row);
      CAT_ORDER.push(row.key);
    });
  }
  setCategories(DEFAULT_CATS);

  // 창고 이름 → 배지 색
  var WH_COLOR = {
    "동해": "#0E8A8F", "군산": "#1AA0A6", "인천": "#0E7C86",
    "하남": "#FF5B39", "김포": "#F0713F", "푸카": "#C2410C", "찐한국": "#3BA559"
  };

  var wonKR = new Intl.NumberFormat("ko-KR");

  // ---------- 유틸 ----------
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function money(n) {
    var v = Number(n);
    if (!isFinite(v) || v === 0 && (n === "" || n == null)) return esc(n || "");
    return "₩" + wonKR.format(v);
  }
  function toNumber(s) {
    if (typeof s === "number") return s;
    var d = String(s || "").replace(/[^0-9.-]/g, "");
    return d === "" ? 0 : Number(d);
  }
  /* 카테고리 키는 2026-08-24부터 카탈로그 '상품분류'의 분류명 그대로다 ('수산','축산',…).
     옛 키(fish/meal/living)로 저장된 행이 남아 있어도 화면에서 빠지지 않게 여기서 흡수한다. */
  function normCat(v) {
    var s = String(v || "").trim().toLowerCase();
    var pick = function () {
      for (var i = 0; i < arguments.length; i++) if (CAT[arguments[i]]) return arguments[i];
      return null;
    };
    if (s.indexOf("fish") > -1 || s.indexOf("수산") > -1 || s.indexOf("seafood") > -1) return pick("수산", "fish");
    if (s.indexOf("축산") > -1 || s.indexOf("meat") > -1) return pick("축산");
    if (s.indexOf("meal") > -1 || s.indexOf("간편") > -1 || s.indexOf("가공") > -1 || s.indexOf("식품") > -1) return pick("가공식품", "meal");
    if (s.indexOf("김치") > -1 || s.indexOf("반찬") > -1) return pick("김치·반찬");
    if (s.indexOf("과일") > -1) return pick("과일");
    if (s.indexOf("농산") > -1 || s.indexOf("채소") > -1) return pick("농산물");
    if (s.indexOf("living") > -1 || s.indexOf("생활") > -1) return pick("생활용품", "living");
    return pick("기타");
  }
  function isShown(v) {
    if (v == null || v === "") return true;
    var s = String(v).trim().toLowerCase();
    return !(s === "false" || s === "n" || s === "no" || s === "x" || s === "0" || s === "숨김" || s === "비공개");
  }

  // 이미지 값 → 실제 URL (파일명 / 일반 URL / 구글드라이브 링크 모두 지원)
  function resolveImage(v) {
    var s = String(v || "").trim();
    if (!s) return "";
    if (/^https?:\/\//i.test(s)) {
      var m = s.match(/drive\.google\.com\/file\/d\/([^/]+)/) ||
              s.match(/drive\.google\.com\/open\?id=([^&]+)/) ||
              s.match(/[?&]id=([^&]+)/);
      if (m && /drive\.google\.com/.test(s)) {
        return "https://drive.google.com/thumbnail?id=" + m[1] + "&sz=w1000";
      }
      return s;
    }
    return "images/products/" + s.replace(/^\/+/, "");
  }

  /* 🚨 외부 사진은 «프록시»를 거쳐 불러온다 — 안 그러면 PDF·JPG에 사진이 통째로 빠진다.
     (2026-08-24 홍팀장: "PDF에 상품 사진이 없으면 만든 의미가 없잖아")
     masterc.co.kr 사진은 화면에는 잘 뜨지만 CORS 헤더가 없어서, 캡처(html2canvas)가
     crossOrigin 으로 다시 불러올 때 실패한다 → 캔버스에 안 담기고 빈칸으로 저장된다.
     images.weserv.nl 은 CORS 헤더를 붙여 주므로 화면·PDF·JPG 모두에서 나온다.
     ⚠️ 우리 사이트 안의 파일은 그대로 둔다. 프록시가 죽으면 <img onerror>가 원본으로 되돌린다. */
  function photoSrc(u) {
    var s = String(u || "").trim();
    if (!s) return "";
    if (s.indexOf("data:") === 0) return s;
    if (!/^https?:\/\//i.test(s)) return s;                    // images/products/... 는 같은 출처
    if (s.indexOf(location.origin) === 0) return s;
    return "https://images.weserv.nl/?url=" + encodeURIComponent(s.replace(/^https?:\/\//i, "")) +
           "&w=1000&we&output=jpg&q=88";
  }

  // ---------- CSV 파서 ----------
  function parseCSV(text) {
    var rows = [], row = [], field = "", inQ = false, i = 0, c;
    while (i < text.length) {
      c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { inQ = true; i++; continue; }
      if (c === ",") { row.push(field); field = ""; i++; continue; }
      if (c === "\r") { i++; continue; }
      if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      field += c; i++;
    }
    row.push(field); rows.push(row);
    return rows.filter(function (r) { return r.length > 1 || (r[0] || "").trim() !== ""; });
  }

  // 시트 헤더명 → 표준 키
  function headerKey(h) {
    var s = String(h || "").trim().replace(/\s+/g, "").toLowerCase();
    var map = {
      "카테고리": "category", "분류": "category", "category": "category",
      "상품명": "name", "이름": "name", "name": "name",
      "창고": "warehouse", "배지": "warehouse", "태그": "warehouse", "warehouse": "warehouse",
      "설명": "spec", "스펙": "spec", "spec": "spec",
      "공급가": "supplyPrice", "가격": "supplyPrice", "단가": "supplyPrice", "price": "supplyPrice",
      "택배사": "courier", "courier": "courier",
      "택배비": "shipFee", "배송비": "shipFee", "shipfee": "shipFee",
      "면과세": "tax", "과세": "tax", "tax": "tax",
      "사진": "image", "이미지": "image", "image": "image", "img": "image",
      "노출": "show", "표시": "show", "show": "show"
    };
    return map[s] || null;
  }

  function rowsToProducts(rows) {
    if (!rows.length) return [];
    var head = rows[0].map(headerKey);
    var out = [];
    for (var r = 1; r < rows.length; r++) {
      var obj = {};
      for (var c = 0; c < head.length; c++) {
        if (head[c]) obj[head[c]] = rows[r][c];
      }
      if (!obj.name || !String(obj.name).trim()) continue; // 빈 줄 스킵
      out.push(obj);
    }
    return out;
  }

  // ---------- 정규화 ----------
  function normalize(list) {
    var products = [];
    list.forEach(function (p) {
      if (!isShown(p.show)) return;
      var raw = String(p.category || "").trim();
      var cat = CAT[raw] ? raw : normCat(raw);
      if (!cat || !CAT[cat]) return;
      var wh = String(p.warehouse || "").trim();
      products.push({
        cat: cat,
        name: String(p.name || "").trim(),
        warehouse: wh,
        spec: String(p.spec || "").trim(),
        supplyPrice: toNumber(p.supplyPrice),
        courier: String(p.courier || "").trim(),
        shipFee: toNumber(p.shipFee),
        tax: String(p.tax || "").trim(),
        image: resolveImage(p.image),
        link: String(p.link || "").trim(),
        specialPrice: toNumber(p.specialPrice),   // 넣으면 공급가에 줄 긋고 이 값이 노출
        badgeColor: WH_COLOR[wh] || CAT[cat].accent
      });
    });
    return products;
  }

  // ---------- 렌더 ----------
  function cardHTML(p) {
    var c = CAT[p.cat];
    // loading="lazy" 금지 — 스크롤 안 한 상품은 로드가 안 돼서 PDF·JPG에 빈칸으로 찍힌다.
    // onerror = 프록시가 죽으면 원본 주소로 한 번 되돌린다(화면에라도 나오게).
    var imgHtml = p.image
      ? '<img src="' + esc(photoSrc(p.image)) + '" alt="' + esc(p.name) + '" decoding="async" crossorigin="anonymous"' +
        ' onerror="this.onerror=null;this.removeAttribute(\'crossorigin\');this.src=\'' + esc(p.image).replace(/'/g, "&#39;") + '\';">'
      : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#9aa7ad;font-size:13px;">사진 준비중</div>';
    /* 스펙은 '※ …' 줄을 그대로 목록으로 보여준다(게시물 스펙 요약을 옮겨온 것).
       ※ 가 없는 옛 설명은 한 줄 그대로 쓴다. */
    var specLines = String(p.spec || "").split(/\n|(?=※)/)
      .map(function (s) { return s.replace(/^\s*※\s*/, "").trim(); })
      .filter(function (s) { return s; });
    var specHtml = specLines.length
      ? '<ul class="prod-spec">' + specLines.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join("") + '</ul>'
      : '<div class="prod-spec empty"></div>';

    // 특별 제안가가 있으면 공급가에 줄을 긋고 그 값을 크게
    var hasSpecial = p.specialPrice > 0 && p.specialPrice !== p.supplyPrice;
    var priceHtml = CFG.hidePrice
      // 문의 섹션을 뺀 제안서에서는 누를 곳이 없으니 링크가 아니라 글씨로만
      ? (CFG.hideContact ? '<span class="val-ask">공급가 문의</span>'
                         : '<a class="val-ask" href="#contact">공급가 문의하기 →</a>')
      : (hasSpecial
          ? '<span class="lbl">특별 제안가</span>' +
            '<span class="val-was">' + money(p.supplyPrice) + '</span>' +
            '<span class="val display special">' + money(p.specialPrice) + '</span>'
          : '<span class="lbl">공급가</span><span class="val display">' + money(p.supplyPrice) + '</span>');

    return '' +
      '<div class="prod-card">' +
        '<div class="prod-img' + (c.fit === "contain" ? " contain" : "") + '" style="background:' + c.imgBg + ';">' +
          imgHtml +
          // 📦 창고명 노출 (2026-08-24 홍팀장: "업체들 혹시라도 합포장 할 수도 있어서")
          // 같은 창고 상품끼리만 한 박스로 묶이므로, 업체가 판단하려면 창고가 보여야 한다.
          (p.warehouse ? '<div class="badge-tag" style="background:' + p.badgeColor + ';" title="같은 창고 상품끼리 합포장 가능">📦 ' + esc(p.warehouse) + '</div>' : '') +
          (p.tax ? '<div class="badge-tax">' + esc(p.tax) + '</div>' : '') +
        '</div>' +
        '<div class="prod-body">' +
          '<h3>' + esc(p.name) + '</h3>' +
          specHtml +
          '<div class="price-row">' + priceHtml + '</div>' +
          '<div class="ship-row" style="background:' + c.rowBg + ';">' +
            (p.courier ? '<span class="pill" style="color:' + c.accent + ';background:' + c.pillBg + ';">' + esc(p.courier) + '</span>' : '') +
            // 택배비 0 = 무료배송으로 표기 (2026-08-20 홍팀장)
            (p.shipFee > 0
              ? '<span class="txt">택배비 ' + money(p.shipFee) + '</span>'
              : '<span class="txt free">무료배송</span>') +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function sectionHTML(cat, items) {
    var c = CAT[cat];
    var t = (CFG.categoryText && CFG.categoryText[cat]) || {};
    // 개요 카드를 없앤 뒤로 카테고리 '소개(카드 설명)'도 이 헤더 바에서 보여준다 (2026-08-20 홍팀장)
    var descr = c.descr || t.desc || "";
    // 우측 메타는 이름·소개와 겹쳐서 제거 (2026-08-20 홍팀장: "너무 중복 안내")
    var cards = items.map(cardHTML).join("");
    return '' +
      '<section id="' + cat + '" class="section">' +
        '<div class="sec-head" style="--acc:' + c.accent + ';">' +
          '<div class="left">' +
            '<div class="tile display" style="background:' + c.accent + ';">' + c.mark + '</div>' +
            '<div>' +
              '<div class="kicker">' + esc(c.eyebrow) + '</div>' +
              '<h2 class="display">' + esc(c.name) + '</h2>' +
              (descr ? '<p class="sec-descr">' + esc(descr) + '</p>' : '') +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="prod-grid">' + cards + '</div>' +
      '</section>';
  }

  /* 카테고리 개요 카드(cat-card, "○품목 · 바로가기 ↓")는 2026-08-20 홍팀장 지시로 삭제.
     제안서는 PDF로 돌리는 게 대부분이라 페이지 안 앵커 링크가 의미가 없다. */

  function heroHTML() {
    var lines = (CFG.heroTitleLines || ["바다에서", "식탁까지,", "한 번에 채우다"]);
    var h1 = lines.map(function (ln, i) {
      return (i === lines.length - 1) ? '<span class="hl">' + esc(ln) + '</span>' : esc(ln);
    }).join("<br>");
    return '' +
      '<section class="hero">' +
        '<div class="hero-circle c1"></div><div class="hero-circle c2"></div>' +
        '<div class="eyebrow"><span class="bar"></span>' + esc(CFG.heroEyebrow || "") + '</div>' +
        '<h1 class="display">' + h1 + '</h1>' +
        '<p class="hero-lead">' + esc(CFG.heroLead || "") + '</p>' +
        /* 숫자 3칸(엄선 품목·상품 카테고리·택배 배송)과 회사 명함 칩은
           2026-08-20 홍팀장 지시로 제거 — 표지가 길어지기만 했다.
           회사·담당자 정보는 맨 아래 문의 섹션에 그대로 있다. */
        // 표지 아래 파도 곡선 (바다 테마)
        '<svg class="hero-wave" viewBox="0 0 1440 130" preserveAspectRatio="none" aria-hidden="true" focusable="false">' +
          '<path class="w-back" d="M0,70 C220,116 430,26 700,54 C930,78 1180,120 1440,78 L1440,130 L0,130 Z"></path>' +
          '<path class="w-front" d="M0,92 C260,132 470,58 740,82 C980,103 1200,132 1440,100 L1440,130 L0,130 Z"></path>' +
        '</svg>' +
      '</section>';
  }

  function calloutHTML() {
    return '' +
      '<section class="callout-sec">' +
        '<div class="callout">' +
          '<div class="tile display">全</div>' +
          '<div style="flex:1;">' +
            '<div class="title">전체 상품은 약 500여 종 — 구글 시트로 실시간 공유합니다</div>' +
            '<p>이 제안서는 대표 품목만 추린 요약본입니다. 시세·재고에 따라 수시로 업데이트되는 <strong style="color:#08324B;">전체 품목·공급가 리스트</strong>는 구글 시트로 안내드리니, 아래 연락처로 요청 주시면 열람 링크를 바로 보내드립니다.</p>' +
          '</div>' +
          '<a class="cta" href="#contact">전체 리스트 요청 →</a>' +
        '</div>' +
      '</section>';
  }

  function contactHTML() {
    var phone = CFG.phone || "", email = CFG.email || "", kakao = CFG.kakao || "";
    return '' +
      '<section class="contact" id="contact">' +
        '<div class="contact-in">' +
          '<div>' +
            '<h2 class="display">지금 바로<br>거래 문의하세요</h2>' +
            '<p class="lead">맞춤 단가 제안이 가능합니다.<br>편하신 채널로 연락 주세요.</p>' +
          '</div>' +
          '<div class="contact-card">' +
            '<div class="who">' +
              '<div>' +
                '<div class="name">' + esc(CFG.managerName || "") + ' <small>' + esc((CFG.team || "") + " " + (CFG.managerTitle || "")) + '</small></div>' +
                '<div class="org">' + esc(CFG.company || "") + '</div>' +
              '</div>' +
            '</div>' +
            '<div class="contact-lines">' +
              (phone ? '<div class="line"><span class="k">전화</span><a class="v" href="tel:' + esc(phone.replace(/[^0-9+]/g, "")) + '">' + esc(phone) + '</a></div>' : '') +
              (email ? '<div class="line"><span class="k">이메일</span><a class="v" href="mailto:' + esc(email) + '">' + esc(email) + '</a></div>' : '') +
              (kakao ? '<div class="line"><span class="k">카카오톡</span><span class="v">' + esc(kakao) + '</span></div>' : '') +
              '<div class="line"><span class="k">전체 상품</span><span class="v">구글시트 · 요청 시 공유</span></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</section>';
  }

  function render(products) {
    var grouped = {};
    CAT_ORDER.forEach(function (k) { grouped[k] = []; });
    products.forEach(function (p) { if (grouped[p.cat]) grouped[p.cat].push(p); });

    var html = heroHTML();
    CAT_ORDER.forEach(function (k) {
      if (grouped[k].length) html += sectionHTML(k, grouped[k]);
    });
    /* 아래 두 블록은 버전마다 켜고 끈다 (2026-08-20 홍팀장).
       거래처가 '자기 거래처'에게 다시 돌리는 제안서에는 마스터 연락처가 붙으면 곤란하다. */
    if (!CFG.hideCallout) html += calloutHTML();
    if (!CFG.hideContact) html += contactHTML();

    html += '<div class="save-btns">' +
      '<button class="pdf-btn" id="jpg-btn" title="화면 그대로 이미지(JPG) 파일로 저장합니다">🖼 JPG 저장</button>' +
      '<button class="pdf-btn" id="pdf-btn" title="화면 그대로, 페이지가 안 끊기는 긴 PDF 한 장으로 저장합니다 (A4 여러 장으로 인쇄하려면 Ctrl+P)">🖨 PDF 저장 (한 장)</button>' +
      '</div>';

    document.getElementById("app").innerHTML = html;
    var pb = document.getElementById("pdf-btn");
    if (pb) pb.addEventListener("click", saveAsPDF);
    var jb = document.getElementById("jpg-btn");
    if (jb) jb.addEventListener("click", saveAsJPG);
    document.title = (CFG.company || "상품") + " 상품 제안서";
  }

  /* 화면 그대로 JPG 저장 (2026-08-20 홍팀장 — 업체엔 이미지로 돌린다)
     ⚠️ 상품 사진이 외부 주소(masterc)면 브라우저 보안 때문에 캔버스가 오염돼 저장이 통째로 막힌다.
        그래서 제안서 사진은 이 사이트 안(images/products/)에 두는 걸 원칙으로 한다.
        혹시 외부 사진이 섞여 있으면 그 장수를 세어 알려주고, 저장은 되게 한다. */
  /* ── 화면을 통째로 캔버스에 담는다 (JPG 저장 · PDF 저장 공용) ──
     캔버스에는 브라우저 한계가 있어서(높이 약 32,767px) 문서가 길면 배율을 알아서 낮춘다. */
  /* 사진이 다 뜰 때까지 기다렸다가 찍는다 — 로딩 중에 찍으면 그 자리가 빈칸으로 남는다 (2026-08-24) */
  function waitPhotos(root, done) {
    var imgs = [].slice.call(root.querySelectorAll("img"));
    var left = 0, finished = false;
    var tick = function () { if (--left <= 0 && !finished) { finished = true; done(); } };
    imgs.forEach(function (im) {
      if (im.complete) return;
      left++;
      im.addEventListener("load", tick, { once: true });
      im.addEventListener("error", tick, { once: true });
    });
    if (!left) { done(); return; }
    setTimeout(function () { if (!finished) { finished = true; done(); } }, 12000);   // 너무 오래 걸리면 그냥 진행
  }
  function captureApp(cb, fail) {
    var app = document.getElementById("app");
    var run = function () {
      var box = document.querySelector(".save-btns");
      if (box) box.style.visibility = "hidden";                 // 버튼은 빼고 찍는다
      waitPhotos(app, function () {
      var h = app.scrollHeight, scale = 2;
      while (scale > 1 && h * scale > 15000) scale -= 0.5;      // 길면 배율을 낮춰 안전하게
      window.html2canvas(app, {
        backgroundColor: "#fdf8ef", scale: scale, useCORS: true, logging: false,
        windowWidth: app.scrollWidth, width: app.scrollWidth, height: h
      }).then(function (canvas) {
        if (box) box.style.visibility = "";
        cb(canvas);
      }).catch(function (e) { if (box) box.style.visibility = ""; fail(e); });
      });
    };
    if (window.html2canvas) return run();
    var s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
    s.onload = run;
    s.onerror = function () { fail(new Error("html2canvas 로드 실패")); };
    document.head.appendChild(s);
  }
  /* «실제로 안 뜬 사진»만 센다. 프록시를 거치면 외부 주소도 잘 담기므로,
     예전처럼 «외부 주소면 경고»하면 멀쩡한데도 매번 겁주는 안내가 뜬다. (2026-08-24) */
  function brokenPhotos() {
    return [].slice.call(document.querySelectorAll("#app .prod-img img")).filter(function (im) {
      return !im.complete || !im.naturalWidth;
    }).length;
  }
  function outsideNote() {
    var n = brokenPhotos();
    return n ? ("저장했습니다.\n다만 사진 " + n + "장은 불러오지 못해 빈칸입니다.\n하비서에게 '제안서 사진 확인해줘'라고 하세요.") : "";
  }
  /* 파일명 = 마스터_상품제안서_<업체명>_MMDD  (2026-08-24 홍팀장)
     ⚠️ 업체명은 팀장님이 관리자에서 입력한 «제안서 이름»이다. 내부 주소(slug: v2 …)를 쓰면
        받는 쪽에서 무슨 파일인지 알 수 없다 — slug 는 최후 폴백으로만 쓴다. */
  function downloadBlob(blob, ext) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    var name = (CURRENT_VERSION && String(CURRENT_VERSION.name || "").trim()) ||
               (new URLSearchParams(location.search)).get("v") || "제안서";
    name = name.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();   // 파일명에 못 쓰는 문자 제거
    var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
    a.download = "마스터_상품제안서_" + name + "_" + p(d.getMonth() + 1) + p(d.getDate()) + "." + ext;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

  /* 화면 그대로 JPG 저장 (2026-08-20 홍팀장 — 업체엔 이미지로 돌린다) */
  function saveAsJPG() {
    var btn = document.getElementById("jpg-btn");
    var done = function (msg, err) {
      btn.disabled = false; btn.textContent = "🖼 JPG 저장";
      if (msg) alert(msg); if (err) console.warn(err);
    };
    btn.disabled = true; btn.textContent = "만드는 중…";
    captureApp(function (canvas) {
      canvas.toBlob(function (blob) {
        if (!blob) { done("이미지를 만들지 못했습니다. 하비서에게 알려주세요."); return; }
        downloadBlob(blob, "jpg");
        done(outsideNote());
      }, "image/jpeg", 0.92);
    }, function (e) { done("이미지를 만들지 못했습니다. 하비서에게 알려주세요.", e); });
  }

  /* 📄 PDF 저장 — "페이지가 안 끊기는 한 장" (2026-08-24 홍팀장: "그냥 한장 쭉 길게 만들순 없냐")
     브라우저 인쇄(window.print)는 A4에 맞춰 무조건 여러 장으로 잘린다. 그래서 인쇄를 안 쓰고,
     화면을 찍은 JPEG 하나를 그 비율만큼 «길쭉한 페이지» 하나에 담은 PDF를 직접 만든다.
     외부 PDF 라이브러리 없음 — 이미지 한 장짜리 PDF는 구조가 단순해서 손으로 조립하는 게 더 가볍다.
     ※ A4 여러 장으로 인쇄하고 싶으면 예전처럼 Ctrl+P (인쇄용 CSS는 style.css 에 그대로 있다). */
  function jpegToOnePagePDF(jpeg, pxW, pxH) {
    var W = 595.28, H = W * pxH / pxW;                 // A4 폭 기준, 높이는 이미지 비율 그대로
    if (H > 14000) { H = 14000; W = H * pxW / pxH; }   // PDF 한 페이지 한계(200inch=14400pt) 안으로
    var enc = function (s) {
      var a = new Uint8Array(s.length);
      for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 0xff;
      return a;
    };
    var chunks = [], size = 0, offs = [];
    var put = function (x) { var b = (typeof x === "string") ? enc(x) : x; chunks.push(b); size += b.length; };
    var obj = function (n, body) { offs[n] = size; put(n + " 0 obj\n" + body + "\nendobj\n"); };
    var f2 = function (v) { return v.toFixed(2); };

    put("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    obj(1, "<</Type/Catalog/Pages 2 0 R>>");
    obj(2, "<</Type/Pages/Kids[3 0 R]/Count 1>>");
    obj(3, "<</Type/Page/Parent 2 0 R/MediaBox[0 0 " + f2(W) + " " + f2(H) + "]" +
           "/Resources<</XObject<</Im0 4 0 R>>>>/Contents 5 0 R>>");
    offs[4] = size;
    put("4 0 obj\n<</Type/XObject/Subtype/Image/Width " + pxW + "/Height " + pxH +
        "/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length " + jpeg.length + ">>\nstream\n");
    put(jpeg);
    put("\nendstream\nendobj\n");
    var content = "q " + f2(W) + " 0 0 " + f2(H) + " 0 0 cm /Im0 Do Q\n";
    obj(5, "<</Length " + content.length + ">>\nstream\n" + content + "endstream");

    var xref = size, pad = function (n) { var s = String(n); while (s.length < 10) s = "0" + s; return s; };
    var x = "xref\n0 6\n0000000000 65535 f \n";
    for (var i = 1; i <= 5; i++) x += pad(offs[i]) + " 00000 n \n";
    put(x + "trailer\n<</Size 6/Root 1 0 R>>\nstartxref\n" + xref + "\n%%EOF\n");
    return new Blob(chunks, { type: "application/pdf" });
  }
  function saveAsPDF() {
    var btn = document.getElementById("pdf-btn");
    var done = function (msg, err) {
      btn.disabled = false; btn.textContent = "🖨 PDF 저장 (한 장)";
      if (msg) alert(msg); if (err) console.warn(err);
    };
    btn.disabled = true; btn.textContent = "만드는 중…";
    captureApp(function (canvas) {
      canvas.toBlob(function (blob) {
        if (!blob) { done("PDF를 만들지 못했습니다. 하비서에게 알려주세요."); return; }
        blob.arrayBuffer().then(function (buf) {
          try {
            downloadBlob(jpegToOnePagePDF(new Uint8Array(buf), canvas.width, canvas.height), "pdf");
            done(outsideNote());
          } catch (e) { done("PDF를 만들지 못했습니다. 하비서에게 알려주세요.", e); }
        });
      }, "image/jpeg", 0.9);
    }, function (e) { done("PDF를 만들지 못했습니다. 하비서에게 알려주세요.", e); });
  }

  // ---------- 데이터 로드 ----------
  function loadFallback() {
    return fetch("data/products.json", { cache: "no-store" })
      .then(function (r) { return r.json(); });
  }

  var CURRENT_VERSION = null;
  var SHEETS = null;         // 한 번에 읽어온 탭들 (버전·카테고리·상품)

  function applySettings(m) {
    if (!m) return;
    if (m.hero_eyebrow != null) CFG.heroEyebrow = m.hero_eyebrow;
    if (m.hero_lead != null) CFG.heroLead = m.hero_lead;
    if (m.hero_title1 != null || m.hero_title2 != null || m.hero_title3 != null) {
      CFG.heroTitleLines = [
        m.hero_title1 != null ? m.hero_title1 : (CFG.heroTitleLines || [])[0] || "",
        m.hero_title2 != null ? m.hero_title2 : (CFG.heroTitleLines || [])[1] || "",
        m.hero_title3 != null ? m.hero_title3 : (CFG.heroTitleLines || [])[2] || ""
      ];
    }
    ["company","team","kakao","phone","email"].forEach(function(k){ if(m[k]!=null) CFG[k]=m[k]; });
    if (m.manager_name != null) CFG.managerName = m.manager_name;
    if (m.manager_title != null) CFG.managerTitle = m.manager_title;
    // 공개 범위 스위치 — 켜면 그 블록이 제안서에서 빠진다
    var on = function (v) { return v === true || v === "1" || v === "true"; };
    CFG.hidePrice = on(m.hide_price);       // 공급가 → [공급가 문의하기] 버튼으로
    CFG.hideCallout = on(m.hide_callout);   // '전체 리스트 요청' 안내 박스
    CFG.hideContact = on(m.hide_contact);   // 맨 아래 담당자 명함(문의 섹션)
  }

  function toBool(v) { var s = String(v == null ? "" : v).trim(); return !(s === "숨김" || s === "숨기기" || s === "false" || s === "FALSE" || s === "0" || s === "N"); }
  function toInt(v) { var d = String(v == null ? "" : v).replace(/[^0-9]/g, ""); return d ? parseInt(d, 10) : 0; }

  /* 시트 3탭을 한 번에 읽는다 (버전 · 카테고리 · 상품).
     관리자(admin.html)가 쓰는 것과 같은 탭이라, 저장하면 여기 바로 반영된다. */
  function loadSheets() {
    if (!(window.SVC && CFG.dataSheet && CFG.dataSheet.id)) return Promise.reject("no-sheet");
    var T = window.SVC.TAB;
    return window.SVC.readTabs([T.versions, T.cats, T.products]).then(function (res) {
      SHEETS = res;

      /* --- 버전: ?v=슬러그 (없으면 첫 버전) --- */
      var want = (new URLSearchParams(location.search)).get("v");
      var vers = (res[T.versions] || []).slice(1)
        .filter(function (r) { return (r[1] || "").trim(); })
        .map(function (r) {
          var st = {}; try { st = r[4] ? JSON.parse(r[4]) : {}; } catch (e) { st = {}; }
          return { id: r[0], slug: String(r[1]).trim(), name: r[2] || r[1], sort_order: toInt(r[3]), settings: st };
        }).sort(function (a, b) { return a.sort_order - b.sort_order; });
      if (vers.length) {
        CURRENT_VERSION = (want ? vers.filter(function (v) { return v.slug === want; })[0] : null) || vers[0];
        applySettings(CURRENT_VERSION.settings || {});
      }

      /* --- 카테고리 --- */
      var cats = (res[T.cats] || []).slice(1)
        .filter(function (r) { return (r[1] || "").trim(); })
        .map(function (r) {
          return {
            key: String(r[1]).trim(), name: r[2] || "", mark: r[3] || "", eyebrow: r[4] || "",
            descr: r[5] || "", meta: r[6] || "", accent: r[7] || "#0E8A8F",
            fit: r[8] === "contain" ? "contain" : "cover", show: toBool(r[9]), sort_order: toInt(r[10])
          };
        }).sort(function (a, b) { return a.sort_order - b.sort_order; });
      if (cats.length) setCategories(cats);

      /* --- 상품: 현재 버전 것만 --- */
      var slug = CURRENT_VERSION ? CURRENT_VERSION.slug : "";
      var prods = (res[T.products] || []).slice(1)
        .filter(function (r) { return (r[2] || "").trim() && (!slug || String(r[0] || "").trim() === slug); })
        .map(function (r) {
          return {
            category: r[1], name: r[2], warehouse: r[3], spec: r[4], supplyPrice: r[5],
            courier: r[6], shipFee: r[7], tax: r[8], image: r[9], link: r[10], show: r[11],
            sort_order: toInt(r[12]), specialPrice: r[13]
            // r[14] = 원가 — 관리자 전용이라 공개 사이트로 절대 넘기지 않는다
          };
        }).sort(function (a, b) { return a.sort_order - b.sort_order; });
      if (!prods.length) throw new Error("sheet empty");
      return prods;
    });
  }

  /* 조회수·방문자 집계는 쓰지 않는다 (2026-08-20 홍팀장: 혼자 쓰는 도구라 불필요).
     페이지를 열 때마다 시트에 쓰던 것도 같이 없앴다 — 로딩만 느려졌다. */

  document.getElementById("app").innerHTML =
    '<div class="notice">상품 정보를 불러오는 중…</div>';

  loadSheets()
    .catch(function (e) {
      if (e !== "no-sheet") console.warn("구글 시트 로드 실패 → 기본 데이터 사용:", e);
      return loadFallback();
    })
    .then(function (list) { render(normalize(list)); })
    .catch(function (e) {
      console.error(e);
      document.getElementById("app").innerHTML =
        '<div class="notice">상품 정보를 불러오지 못했습니다. 잠시 후 새로고침 해주세요.</div>';
    });
})();
