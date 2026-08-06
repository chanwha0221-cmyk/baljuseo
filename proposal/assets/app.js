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
  function buildCat(row) {
    var accent = row.accent || "#0E8A8F";
    var fit = row.fit || "cover";
    return {
      key: row.key, name: row.name || "", mark: row.mark || "", eyebrow: row.eyebrow || "",
      descr: row.descr || "", meta: row.meta || "", accent: accent, fit: fit,
      soft: mix(accent, 0.12), imgBg: fit === "contain" ? "#ffffff" : mix(accent, 0.12),
      rowBg: mix(accent, 0.06), pillBg: mix(accent, 0.18)
    };
  }
  // 기본 카테고리(테이블 없거나 비었을 때 폴백)
  var DEFAULT_CATS = [
    { key: "fish",   name: "신선 수산물", mark: "魚", eyebrow: "SEAFOOD · 메인 카테고리", descr: "동해·군산·인천·충무 창고를 직접 운영하여 수산물 공급", meta: "동해 · 군산 · 인천 창고", accent: "#0E8A8F", fit: "cover" },
    { key: "meal",   name: "간편식품",   mark: "食", eyebrow: "CONVENIENCE FOOD",       descr: "탕·전골·튀김 등 회전율 높은 즉석·냉동 품목 (하남·김포).",       meta: "하남 · 김포 · 푸카 창고", accent: "#FF5B39", fit: "cover" },
    { key: "living", name: "생활용품",   mark: "生", eyebrow: "LIVING GOODS",           descr: "찐한국 위생·주방 소모품, 정기 납품에 유리한 저단가 구성.",       meta: "찐한국 · 위생/주방",     accent: "#3BA559", fit: "contain" }
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
  function normCat(v) {
    var s = String(v || "").trim().toLowerCase();
    if (s.indexOf("fish") > -1 || s.indexOf("수산") > -1 || s.indexOf("seafood") > -1) return "fish";
    if (s.indexOf("meal") > -1 || s.indexOf("간편") > -1 || s.indexOf("식품") > -1) return "meal";
    if (s.indexOf("living") > -1 || s.indexOf("생활") > -1) return "living";
    return null;
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
        badgeColor: WH_COLOR[wh] || CAT[cat].accent
      });
    });
    return products;
  }

  // ---------- 렌더 ----------
  function cardHTML(p) {
    var c = CAT[p.cat];
    var imgHtml = p.image
      ? '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy" decoding="async">'
      : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#9aa7ad;font-size:13px;">사진 준비중</div>';
    return '' +
      '<div class="prod-card">' +
        '<div class="prod-img' + (c.fit === "contain" ? " contain" : "") + '" style="background:' + c.imgBg + ';">' +
          imgHtml +
          (p.warehouse ? '<div class="badge-tag" style="background:' + p.badgeColor + ';">' + esc(p.warehouse) + '</div>' : '') +
          (p.tax ? '<div class="badge-tax">' + esc(p.tax) + '</div>' : '') +
        '</div>' +
        '<div class="prod-body">' +
          '<h3>' + esc(p.name) + '</h3>' +
          // 설명이 없어도 자리를 유지해야 아래 공급가 위치가 어긋나지 않음
          '<div class="prod-spec">' + esc(p.spec || "") + '</div>' +
          '<div class="price-row">' +
            (CFG.hidePrice
              ? '<a class="val-ask" href="#contact">공급가 문의하기 →</a>'
              : '<span class="lbl">공급가</span><span class="val display">' + money(p.supplyPrice) + '</span>') +
          '</div>' +
          '<div class="ship-row" style="background:' + c.rowBg + ';">' +
            (p.courier ? '<span class="pill" style="color:' + c.accent + ';background:' + c.pillBg + ';">' + esc(p.courier) + '</span>' : '') +
            '<span class="txt">택배비 ' + money(p.shipFee) + '</span>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function sectionHTML(cat, items) {
    var c = CAT[cat];
    var meta = c.meta || (CFG.categoryText && CFG.categoryText[cat] && CFG.categoryText[cat].meta) || "";
    var cards = items.map(cardHTML).join("");
    return '' +
      '<section id="' + cat + '" class="section">' +
        '<div class="sec-head" style="--acc:' + c.accent + ';">' +
          '<div class="left">' +
            '<div class="tile display" style="background:' + c.accent + ';">' + c.mark + '</div>' +
            '<div>' +
              '<div class="kicker">' + esc(c.eyebrow) + '</div>' +
              '<h2 class="display">' + esc(c.name) + '</h2>' +
            '</div>' +
          '</div>' +
          (meta ? '<div class="meta">' + esc(meta) + '</div>' : '') +
        '</div>' +
        '<div class="prod-grid">' + cards + '</div>' +
      '</section>';
  }

  function overviewHTML(grouped) {
    var cards = CAT_ORDER.filter(function (k) { return grouped[k] && grouped[k].length; }).map(function (k) {
      var c = CAT[k];
      var t = (CFG.categoryText && CFG.categoryText[k]) || {};
      return '' +
        '<a class="cat-card" href="#' + k + '" style="background:' + c.soft + ';border:2px solid ' + c.accent + ';">' +
          '<div class="tile display" style="background:' + c.accent + ';">' + c.mark + '</div>' +
          '<h3 class="display">' + esc(c.name) + '</h3>' +
          '<p>' + esc(c.descr || t.desc || "") + '</p>' +
          '<div class="go" style="color:' + c.accent + ';">' + grouped[k].length + '품목 · 바로가기 ↓</div>' +
        '</a>';
    }).join("");
    return '' +
      '<section class="section">' +
        '<div class="cat-head">' +
          '<div class="kicker">CATEGORY LINEUP</div>' +
          '<h2 class="display">' + esc(CFG.overviewTitle || "카테고리별로 채우는 한 장의 제안") + '</h2>' +
        '</div>' +
        '<div class="cat-grid">' + cards + '</div>' +
      '</section>';
  }

  function heroHTML(total, catCount) {
    var lines = (CFG.heroTitleLines || ["바다에서", "식탁까지,", "한 번에 채우다"]);
    var h1 = lines.map(function (ln, i) {
      return (i === lines.length - 1) ? '<span class="hl">' + esc(ln) + '</span>' : esc(ln);
    }).join("<br>");
    var mark = (CFG.company || "마스터").trim().charAt(0) || "마";
    return '' +
      '<section class="hero">' +
        '<div class="hero-circle c1"></div><div class="hero-circle c2"></div>' +
        '<div class="eyebrow"><span class="bar"></span>' + esc(CFG.heroEyebrow || "") + '</div>' +
        '<h1 class="display">' + h1 + '</h1>' +
        '<p class="hero-lead">' + esc(CFG.heroLead || "") + '</p>' +
        '<div class="stats">' +
          '<div><div class="num display">' + total + '</div><div class="lbl">엄선 품목</div></div>' +
          '<div class="divider"></div>' +
          '<div><div class="num display">' + catCount + '</div><div class="lbl">상품 카테고리</div></div>' +
          '<div class="divider"></div>' +
          '<div><div class="num display">전국</div><div class="lbl">택배 배송</div></div>' +
        '</div>' +
        '<div class="owner-chip">' +
          '<div class="avatar display">' + esc(mark) + '</div>' +
          '<div>' +
            '<div class="name">' + esc(CFG.company || "") + '</div>' +
            '<div class="sub">' + esc((CFG.team || "") + " · " + (CFG.managerName || "") + " " + (CFG.managerTitle || "")) + '</div>' +
          '</div>' +
        '</div>' +
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
    var catCount = CAT_ORDER.filter(function (k) { return grouped[k].length; }).length;

    var html = heroHTML(products.length, catCount) + overviewHTML(grouped);
    CAT_ORDER.forEach(function (k) {
      if (grouped[k].length) html += sectionHTML(k, grouped[k]);
    });
    html += calloutHTML() + contactHTML();

    html += '<button class="pdf-btn" id="pdf-btn" title="PDF로 저장하거나 인쇄합니다">🖨 PDF 저장</button>';

    document.getElementById("app").innerHTML = html;
    var pb = document.getElementById("pdf-btn");
    if (pb) pb.addEventListener("click", function () { window.print(); });
    document.title = (CFG.company || "상품") + " 상품 제안서";
  }

  // ---------- 데이터 로드 ----------
  function loadFallback() {
    return fetch("data/products.json", { cache: "no-store" })
      .then(function (r) { return r.json(); });
  }

  var _sbClient = null;
  function sbClient() {
    if (_sbClient) return _sbClient;
    var s = CFG.supabase || {};
    if (!s.url || !s.anonKey || !window.supabase) return null;
    _sbClient = window.supabase.createClient(s.url, s.anonKey);
    return _sbClient;
  }

  var CURRENT_VERSION = null;

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
    // 공급가 숨김 (오픈카톡 등 불특정 다수 공개용)
    CFG.hidePrice = (m.hide_price === true || m.hide_price === "1" || m.hide_price === "true");
  }

  // ?v=슬러그 로 버전 선택 (없으면 첫 버전). 버전 테이블 없으면 무시.
  function loadVersion() {
    var c = sbClient();
    if (!c) return Promise.resolve();
    var slug = (new URLSearchParams(location.search)).get("v");
    return c.from("versions").select("*").order("sort_order", { ascending: true }).then(function (res) {
      if (res.error || !res.data || !res.data.length) return;
      var match = slug ? res.data.filter(function (v) { return v.slug === slug; })[0] : null;
      CURRENT_VERSION = match || res.data[0];
      applySettings(CURRENT_VERSION.settings || {});
    }).catch(function () {});
  }

  // 조회 기록 (관리자 페이지에서 통계로 확인). 실패해도 화면엔 영향 없음.
  function trackView() {
    try {
      var c = sbClient();
      if (!c) return;
      var qs = new URLSearchParams(location.search);
      if (qs.get("nt") === "1") return;            // 관리자 미리보기는 집계 제외
      var vis = "";
      try {
        vis = localStorage.getItem("pv_visitor") || "";
        if (!vis) {
          vis = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
              : ("v" + Math.random().toString(36).slice(2) + Date.now());
          localStorage.setItem("pv_visitor", vis);
        }
      } catch (e) { vis = "unknown"; }
      c.from("page_views").insert({
        version_slug: (CURRENT_VERSION && CURRENT_VERSION.slug) || qs.get("v") || "",
        visitor: vis,
        referrer: (document.referrer || "").slice(0, 300)
      }).then(function () {}, function () {});
    } catch (e) { /* 집계 실패는 무시 */ }
  }

  // 카테고리를 Supabase에서 로드(전역). 없으면 기본 3개 유지.
  function loadCategories() {
    var c = sbClient();
    if (!c) return Promise.resolve();
    return c.from("categories").select("*").order("sort_order", { ascending: true }).then(function (res) {
      if (res.error || !res.data || !res.data.length) return;
      setCategories(res.data);
    }).catch(function () {});
  }

  function loadSupabase() {
    var c = sbClient();
    if (!c) return Promise.reject("no-supabase");
    var q = c.from("products").select("*").order("sort_order", { ascending: true });
    if (CURRENT_VERSION) q = q.eq("version_id", CURRENT_VERSION.id);
    return q.then(function (res) {
      if (res.error) throw res.error;
      var rows = res.data || [];
      if (!rows.length) { if (CURRENT_VERSION) return []; throw new Error("supabase empty"); }
      return rows.map(function (r) {
        return {
          category: r.category, name: r.name, warehouse: r.warehouse, spec: r.spec,
          supplyPrice: r.supply_price, courier: r.courier, shipFee: r.ship_fee,
          tax: r.tax, image: r.image, show: r.show
        };
      });
    });
  }

  function loadSheet() {
    // 도구 시트 '제안서상품' 탭을 서비스계정으로 읽음 (원본의 공개시트 gviz 방식 대체)
    // 실패하면 아래 체인이 data/products.json(스냅샷)으로 폴백
    if (!(CFG.dataSheet && CFG.dataSheet.id && window.svcReadRows)) return Promise.reject("no-sheet");
    return window.svcReadRows().then(function (rows) {
      var prods = rowsToProducts(rows);
      if (!prods.length) throw new Error("sheet empty");
      return prods;
    });
  }

  document.getElementById("app").innerHTML =
    '<div class="notice">상품 정보를 불러오는 중…</div>';

  Promise.all([loadVersion(), loadCategories()])
    .then(function () { return loadSupabase(); })
    .catch(function (e) {
      if (e !== "no-supabase") console.warn("Supabase 로드 실패 → 다음 소스 시도:", e);
      return loadSheet();
    })
    .catch(function (e) {
      if (e !== "no-sheet") console.warn("구글 시트 로드 실패 → 기본 데이터 사용:", e);
      return loadFallback();
    })
    .then(function (list) { render(normalize(list)); trackView(); })
    .catch(function (e) {
      console.error(e);
      document.getElementById("app").innerHTML =
        '<div class="notice">상품 정보를 불러오지 못했습니다. 잠시 후 새로고침 해주세요.</div>';
    });
})();
