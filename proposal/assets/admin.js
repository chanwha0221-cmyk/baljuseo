/* =========================================================
   상품 관리자 — 팀장님 전용 (로그인 없음 · 구글 시트 백엔드)
   -----------------------------------------------------------
   원비님 원본(master-proposal)의 관리자 화면을 그대로 옮기되,
   Supabase + 로그인을 걷어내고 baljuseo 도구시트에 붙였다.
     · 로그인 화면 없음 — 주소를 아는 사람만 들어온다(noindex)
     · 저장 = 해당 탭을 통째로 다시 씀. 읽기에 성공했을 때만 쓴다.
     · 사진 업로드 = 구글 드라이브(서비스계정) → 링크 열람 공개
   ========================================================= */
(function () {
  "use strict";

  var CFG = window.PROPOSAL_CONFIG || {};
  var root = document.getElementById("admin-root");
  var T = window.SVC.TAB;

  var DEFAULT_CATS = [
    { id: "c1", key: "fish", name: "신선 수산물", mark: "魚", eyebrow: "SEAFOOD · 메인 카테고리", descr: "", meta: "", accent: "#0E8A8F", fit: "cover", show: true, sort_order: 10 },
    { id: "c2", key: "meal", name: "간편식품", mark: "食", eyebrow: "CONVENIENCE FOOD", descr: "", meta: "", accent: "#FF5B39", fit: "cover", show: true, sort_order: 20 },
    { id: "c3", key: "living", name: "생활용품", mark: "生", eyebrow: "LIVING GOODS", descr: "", meta: "", accent: "#3BA559", fit: "contain", show: true, sort_order: 30 }
  ];

  var CATS = DEFAULT_CATS.slice();
  var items = [];          // 현재 버전의 상품
  var otherRows = [];      // 다른 버전의 상품 행(원본 그대로 보관 — 저장 때 같이 되쓴다)
  var dirty = false;
  var addingCat = null, newItem = null;
  var acResults = [], acTimer = null;
  var catalogCache = null, catalogLoading = false;
  var _delegated = false;
  var siteSettings = {};
  var settingsOpen = false, catsOpen = false, bulkOpen = false;
  var expandedCats = {};
  var versions = [], currentVersion = null;
  var loadedOK = false;    // 시트 읽기에 성공했나 (실패 상태로 저장하면 데이터가 날아간다)

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function uid() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ("k" + Math.random().toString(36).slice(2) + Date.now()); }
  function imgUrl(v) {
    var s = String(v || "").trim(); if (!s) return "";
    if (/^https?:\/\//i.test(s)) {
      var m = s.match(/drive\.google\.com\/file\/d\/([^/]+)/) || s.match(/[?&]id=([^&]+)/);
      if (m && /drive\.google\.com/.test(s)) return "https://drive.google.com/thumbnail?id=" + m[1] + "&sz=w1000";
      return s;
    }
    return "images/products/" + s.replace(/^\/+/, "");
  }
  function catByKey(k) { for (var i = 0; i < CATS.length; i++) if (CATS[i].key === k) return CATS[i]; return null; }
  function findItem(key) { for (var i = 0; i < items.length; i++) if (items[i]._key === key) return items[i]; return null; }
  function num(v) { var d = String(v == null ? "" : v).replace(/[^0-9]/g, ""); return d ? parseInt(d, 10) : 0; }
  function isShow(v) { var s = String(v == null ? "" : v).trim(); return !(s === "숨김" || s === "숨기기" || s === "false" || s === "FALSE" || s === "0" || s === "N"); }

  function setDirty(v) {
    dirty = v;
    var st = document.getElementById("save-status"), bt = document.getElementById("btn-save");
    if (st) { st.textContent = v ? "저장 안 된 변경사항이 있습니다 — [저장] 또는 [전체 저장]" : "각 상품의 [저장] 버튼으로 저장하세요"; st.className = "status" + (v ? " dirty" : ""); }
    if (bt) bt.disabled = !v;
  }
  function toast(msg, isErr) {
    var t = document.createElement("div"); t.className = "toast" + (isErr ? " err" : ""); t.textContent = msg;
    document.body.appendChild(t); requestAnimationFrame(function () { t.classList.add("show"); });
    setTimeout(function () { t.classList.remove("show"); setTimeout(function () { t.remove(); }, 300); }, 2600);
  }

  /* ================= 시트 입출력 ================= */
  function rowsToObjs(rows, keys) {
    return (rows || []).slice(1).map(function (r) {
      var o = {}; keys.forEach(function (k, i) { o[k] = r[i]; }); return o;
    });
  }

  function loadAll() {
    return window.SVC.readTabs([T.versions, T.cats, T.products]).then(function (res) {
      /* --- 버전 --- */
      var vr = rowsToObjs(res[T.versions], ["id", "slug", "name", "sort_order", "settings"])
        .filter(function (v) { return (v.slug || "").trim(); });
      versions = vr.map(function (v) {
        var st = {};
        try { st = v.settings ? JSON.parse(v.settings) : {}; } catch (e) { st = {}; }
        return { id: v.id || uid(), slug: String(v.slug).trim(), name: v.name || v.slug, sort_order: num(v.sort_order), settings: st };
      }).sort(function (a, b) { return a.sort_order - b.sort_order; });
      if (!versions.length) {
        versions = [{ id: "v1", slug: "default", name: "기본 제안서", sort_order: 10, settings: {} }];
      }
      currentVersion = (currentVersion && versions.filter(function (v) { return v.id === currentVersion.id; })[0]) || versions[0];

      /* --- 카테고리 --- */
      var cr = rowsToObjs(res[T.cats], ["id", "key", "name", "mark", "eyebrow", "descr", "meta", "accent", "fit", "show", "sort_order"])
        .filter(function (c) { return (c.key || "").trim(); });
      CATS = cr.length ? cr.map(function (c) {
        return {
          id: c.id || uid(), key: String(c.key).trim(), name: c.name || "", mark: c.mark || "", eyebrow: c.eyebrow || "",
          descr: c.descr || "", meta: c.meta || "", accent: c.accent || "#0E8A8F", fit: c.fit === "contain" ? "contain" : "cover",
          show: isShow(c.show), sort_order: num(c.sort_order)
        };
      }).sort(function (a, b) { return a.sort_order - b.sort_order; }) : DEFAULT_CATS.slice();

      /* --- 상품 (현재 버전 것만 편집, 나머지는 원본 행 그대로 보관) --- */
      var prow = (res[T.products] || []).slice(1).filter(function (r) { return (r[2] || "").trim(); });
      otherRows = prow.filter(function (r) { return String(r[0] || "").trim() !== currentVersion.slug; });
      items = prow.filter(function (r) { return String(r[0] || "").trim() === currentVersion.slug; })
        .map(function (r) {
          return {
            _key: uid(), category: r[1] || (CATS[0] && CATS[0].key) || "fish", name: r[2] || "", warehouse: r[3] || "",
            spec: r[4] || "", supply_price: num(r[5]), courier: r[6] || "", ship_fee: num(r[7]),
            tax: r[8] === "과세" ? "과세" : "면세", image: r[9] || "", link: r[10] || "",
            show: isShow(r[11]), sort_order: num(r[12])
          };
        }).sort(function (a, b) { return a.sort_order - b.sort_order; });

      siteSettings = Object.assign({}, currentVersion.settings || {});
      loadedOK = true;
    });
  }

  function itemToRow(it, order) {
    return [currentVersion.slug, it.category, (it.name || "").trim(), (it.warehouse || "").trim(), (it.spec || "").trim(),
      num(it.supply_price), (it.courier || "").trim(), num(it.ship_fee), it.tax === "과세" ? "과세" : "면세",
      (it.image || "").trim(), (it.link || "").trim(), it.show === false ? "숨김" : "표시", order];
  }
  function saveProducts() {
    if (!loadedOK) return Promise.reject(new Error("아직 시트를 못 읽었습니다 — 새로고침 후 다시 시도하세요"));
    var ordered = [];
    CATS.forEach(function (c) { items.filter(function (i) { return i.category === c.key; }).forEach(function (i) { ordered.push(i); }); });
    items.forEach(function (i) { if (ordered.indexOf(i) < 0) ordered.push(i); });   // 없는 카테고리 소속도 유실 금지
    var mine = ordered.map(function (it, i) { it.sort_order = (i + 1) * 10; return itemToRow(it, it.sort_order); });
    return window.SVC.writeTab(T.products, [window.SVC.HEADERS[T.products]].concat(otherRows, mine));
  }
  function saveVersionsSheet() {
    return window.SVC.writeTab(T.versions, [window.SVC.HEADERS[T.versions]].concat(
      versions.map(function (v) { return [v.id, v.slug, v.name, v.sort_order, JSON.stringify(v.settings || {})]; })));
  }
  function saveCatsSheet() {
    return window.SVC.writeTab(T.cats, [window.SVC.HEADERS[T.cats]].concat(
      CATS.map(function (c) {
        return [c.id, c.key, c.name, c.mark, c.eyebrow, c.descr, c.meta, c.accent, c.fit, c.show === false ? "숨김" : "표시", c.sort_order];
      })));
  }

  /* ================= 상품 카드 ================= */
  function cardHTML(it) {
    var pv = imgUrl(it.image);
    var taxSel = function (v) { return '<option' + (it.tax === v ? ' selected' : '') + '>' + v + '</option>'; };
    var catOpts = CATS.map(function (c) { return '<option value="' + c.key + '"' + (it.category === c.key ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join("");
    return '<div class="card' + (it.show === false ? ' hidden-row' : '') + '" data-key="' + it._key + '">' +
      '<div class="thumb">' +
        '<div class="imgbox">' + (pv ? '<img src="' + esc(pv) + '" alt="">' : '<span style="font-size:12px;color:#9aa7ad;">사진 없음</span>') + '</div>' +
        '<div class="up"><label class="btn-up" data-up="' + it._key + '">사진 업로드<input type="file" accept="image/*" data-file="' + it._key + '" style="display:none;"></label>' +
          '<button class="btn-findpic" data-findpic="' + it._key + '" title="상품명이 똑같은 마스터씨 게시물에서 사진·링크를 가져옵니다">📷 사진 찾기</button></div>' +
      '</div>' +
      '<div class="fields">' +
        '<div class="row r1">' +
          '<div><span class="mini">카테고리</span><select data-f="category">' + catOpts + '</select></div>' +
          '<div><span class="mini">상품명</span><input data-f="name" value="' + esc(it.name) + '" placeholder="상품 이름"></div>' +
          '<div><span class="mini">창고(배지)</span><input data-f="warehouse" value="' + esc(it.warehouse) + '" placeholder="예: 동해"></div>' +
        '</div>' +
        '<div class="row r2">' +
          '<div><span class="mini">설명(회색 글씨)</span><input data-f="spec" value="' + esc(it.spec) + '" placeholder="예: 동해 창고 · 냉동"></div>' +
          '<div><span class="mini">택배사</span><input data-f="courier" value="' + esc(it.courier) + '" placeholder="예: 씨제이대한통운"></div>' +
        '</div>' +
        '<div class="row r3">' +
          '<div><span class="mini">공급가(원)</span><input data-f="supply_price" type="number" inputmode="numeric" value="' + esc(it.supply_price) + '"></div>' +
          '<div><span class="mini">택배비(원)</span><input data-f="ship_fee" type="number" inputmode="numeric" value="' + esc(it.ship_fee) + '"></div>' +
          '<div><span class="mini">면과세</span><select data-f="tax">' + taxSel("면세") + taxSel("과세") + '</select></div>' +
          '<div><span class="mini">&nbsp;</span></div>' +
        '</div>' +
        '<div class="row r4">' +
          '<div><span class="mini">원본 링크 (masterc.kr 등 — 상품명 클릭 링크, 선택)</span><input data-f="link" value="' + esc(it.link || "") + '" placeholder="https://masterc.kr/..."></div>' +
        '</div>' +
        '<div class="card-foot">' +
          '<label class="toggle"><input type="checkbox" data-f="show"' + (it.show !== false ? ' checked' : '') + '> 사이트에 표시</label>' +
          '<button class="btn-saveone" data-saveone="' + it._key + '">저장</button>' +
          '<button class="btn-del" data-del="' + it._key + '">삭제</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* ================= 카테고리 패널 ================= */
  function catRowHTML(c) {
    return '<div class="cat-edit" data-catkey="' + esc(c.key) + '">' +
      '<div class="row" style="grid-template-columns:66px 1fr 1.4fr 74px;">' +
        '<div><span class="mini">아이콘</span><input data-cf="mark" value="' + esc(c.mark) + '" maxlength="2"></div>' +
        '<div><span class="mini">이름</span><input data-cf="name" value="' + esc(c.name) + '"></div>' +
        '<div><span class="mini">소개(카드 설명)</span><input data-cf="descr" value="' + esc(c.descr) + '"></div>' +
        '<div><span class="mini">색상</span><input data-cf="accent" type="color" value="' + esc(c.accent) + '"></div>' +
      '</div>' +
      '<div class="row" style="grid-template-columns:1fr 1fr 110px;">' +
        '<div><span class="mini">영문 라벨(작은 글씨)</span><input data-cf="eyebrow" value="' + esc(c.eyebrow) + '"></div>' +
        '<div><span class="mini">헤더 우측 메타</span><input data-cf="meta" value="' + esc(c.meta) + '"></div>' +
        '<div><span class="mini">사진 맞춤</span><select data-cf="fit"><option value="cover"' + (c.fit !== "contain" ? " selected" : "") + '>꽉채움</option><option value="contain"' + (c.fit === "contain" ? " selected" : "") + '>여백(포장)</option></select></div>' +
      '</div>' +
      '<div class="card-foot" style="padding-top:8px;">' +
        '<label class="toggle"><input type="checkbox" data-cf="show"' + (c.show !== false ? ' checked' : '') + '> 사이트에 표시</label>' +
        '<span class="mini" style="margin:0;">상품 ' + items.filter(function (i) { return i.category === c.key; }).length + '개</span>' +
        '<button class="btn-saveone" data-catsave="' + esc(c.key) + '">저장</button>' +
        '<button class="btn-del" data-catdel="' + esc(c.key) + '">삭제</button>' +
      '</div>' +
    '</div>';
  }
  function catPanelHTML() {
    if (!catsOpen) return '<div class="settings-panel"><div class="sp-head" id="cat-toggle"><span>🗂️ 카테고리 관리 (추가·수정·삭제)</span><span class="sp-caret">펼치기 ▾</span></div></div>';
    return '<div class="settings-panel open">' +
      '<div class="sp-head" id="cat-toggle"><span>🗂️ 카테고리 관리 (추가·수정·삭제)</span><span class="sp-caret">접기 ▴</span></div>' +
      '<div class="sp-body">' + CATS.map(catRowHTML).join("") +
        '<div class="add-row"><button class="btn-add" id="btn-cat-new">+ 카테고리 추가</button></div>' +
      '</div></div>';
  }
  function saveCategory(key, btn) {
    var c = catByKey(key); if (!c) return;
    if (!(c.name || "").trim()) { toast("카테고리 이름을 입력하세요", true); return; }
    if (btn) { btn.disabled = true; btn.textContent = "저장중…"; }
    saveCatsSheet().then(function () {
      if (btn) { btn.disabled = false; btn.textContent = "저장됨 ✓"; setTimeout(function () { if (btn) btn.textContent = "저장"; }, 1500); }
      renderEditor(); toast("카테고리 저장됨 ✅ 공개 사이트에 반영됩니다");
    }).catch(function (err) { if (btn) { btn.disabled = false; btn.textContent = "저장"; } toast("저장 실패: " + (err.message || err), true); });
  }
  function newCategory() {
    var name = window.prompt("새 카테고리 이름 (예: 신선 정육)"); if (!name || !name.trim()) return; name = name.trim();
    var key = "cat" + uid().replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase();
    var sort = (CATS.length ? Math.max.apply(null, CATS.map(function (c) { return c.sort_order || 0; })) : 0) + 10;
    CATS.push({ id: uid(), key: key, name: name, mark: (name.charAt(0) || ""), eyebrow: "", descr: "", meta: "", accent: "#0E8A8F", fit: "cover", show: true, sort_order: sort });
    saveCatsSheet().then(function () { catsOpen = true; renderEditor(); toast("카테고리 '" + name + "' 추가됨 ✅ 아이콘·색상을 정한 뒤 저장하세요"); })
      .catch(function (err) { CATS.pop(); toast("추가 실패: " + (err.message || err), true); });
  }
  function deleteCategory(key) {
    var c = catByKey(key); if (!c) return;
    var cnt = items.filter(function (i) { return i.category === key; }).length;
    var msg = cnt > 0 ? ("이 카테고리에 상품 " + cnt + "개가 있습니다.\n삭제하면 그 상품들은 사이트에서 안 보이게 됩니다(상품 데이터는 남음).\n삭제할까요?") : "이 카테고리를 삭제할까요?";
    if (!window.confirm(msg)) return;
    var keep = CATS.slice();
    CATS = CATS.filter(function (x) { return x.key !== key; });
    saveCatsSheet().then(function () { renderEditor(); toast("카테고리 삭제됨"); })
      .catch(function (err) { CATS = keep; toast("삭제 실패: " + (err.message || err), true); });
  }

  /* ================= CSV 대량 가져오기 ================= */
  function bulkHeaderKey(h) {
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
      "노출": "show", "표시": "show", "show": "show",
      "링크": "link", "link": "link", "url": "link", "주소": "link"
    };
    return map[s] || null;
  }
  function parseBulkCSV(text) {
    var rows = [], row = [], field = "", inQ = false, i = 0, c;
    while (i < text.length) {
      c = text[i];
      if (inQ) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; } field += c; i++; continue; }
      if (c === '"') { inQ = true; i++; continue; }
      if (c === ',' || c === '\t') { row.push(field); field = ""; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      field += c; i++;
    }
    row.push(field); rows.push(row);
    return rows.filter(function (r) { return r.length > 1 || (r[0] || "").trim() !== ""; });
  }
  function bulkRowsToObjects(text) {
    var rows = parseBulkCSV(text); if (!rows.length) return [];
    var head = rows[0].map(bulkHeaderKey), out = [];
    for (var r = 1; r < rows.length; r++) {
      var obj = {};
      for (var c = 0; c < head.length; c++) { if (head[c]) obj[head[c]] = (rows[r][c] || "").trim(); }
      if (!obj.name) continue;
      out.push(obj);
    }
    return out;
  }
  function bulkPanelHTML() {
    if (!bulkOpen) return '<div class="settings-panel"><div class="sp-head" id="bulk-toggle"><span>📋 CSV로 대량 가져오기 (전체 상품 한 번에)</span><span class="sp-caret">펼치기 ▾</span></div></div>';
    return '<div class="settings-panel open">' +
      '<div class="sp-head" id="bulk-toggle"><span>📋 CSV로 대량 가져오기 (전체 상품 한 번에)</span><span class="sp-caret">접기 ▴</span></div>' +
      '<div class="sp-body">' +
        '<div class="sp-note" style="margin-bottom:8px;">헤더: <code>카테고리,상품명,창고,설명,공급가,택배사,택배비,면과세,사진,노출,링크</code> — 엑셀에서 복사(탭 구분)해 붙여넣어도 됩니다.<br>시트에 없는 카테고리 이름은 자동으로 새 카테고리로 만들어집니다.</div>' +
        '<textarea id="bulk-csv-text" rows="6" placeholder="여기에 CSV 내용을 붙여넣으세요"></textarea>' +
        '<div class="row r2" style="margin-top:8px;align-items:end;">' +
          '<div><span class="mini">또는 CSV 파일 선택</span><input type="file" id="bulk-csv-file" accept=".csv,text/csv"></div>' +
          '<div><label class="toggle"><input type="checkbox" id="bulk-replace" checked> 이 버전의 기존 상품을 지우고 새로 채우기</label></div>' +
        '</div>' +
        '<div class="sp-foot"><span class="sp-note">현재 버전(<b>' + (currentVersion ? esc(currentVersion.name) : "버전 없음") + '</b>)에 가져옵니다.</span>' +
        '<button class="btn-addsave" id="btn-bulk-import">가져오기 실행</button></div>' +
      '</div></div>';
  }
  function runBulkImport() {
    var ta = document.getElementById("bulk-csv-text");
    var text = (ta && ta.value || "").trim();
    if (!text) { toast("CSV 내용을 붙여넣거나 파일을 선택하세요", true); return; }
    var raw = bulkRowsToObjects(text);
    if (!raw.length) { toast("가져올 상품이 없습니다. 헤더와 내용을 확인하세요.", true); return; }
    var replace = !!(document.getElementById("bulk-replace") && document.getElementById("bulk-replace").checked);
    var btn = document.getElementById("btn-bulk-import"); btn.disabled = true; btn.textContent = "가져오는 중…";

    var byName = {}; CATS.forEach(function (c) { byName[(c.name || "").trim()] = c.key; byName[(c.key || "").trim()] = c.key; });
    var palette = ["#0E8A8F", "#FF5B39", "#3BA559", "#C0392B", "#9B5DE5", "#E8A33D", "#3D7DCB", "#B23A48", "#5A8F3C", "#7A5C3E"];
    var baseSort = (CATS.length ? Math.max.apply(null, CATS.map(function (c) { return c.sort_order || 0; })) : 0);
    var newNames = [], seen = {};
    raw.forEach(function (o) { var cn = (o.category || "").trim(); if (cn && !byName[cn] && !seen[cn]) { seen[cn] = 1; newNames.push(cn); } });
    newNames.forEach(function (name, i) {
      var key = "cat" + uid().replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase();
      CATS.push({ id: uid(), key: key, name: name, mark: name.charAt(0) || "", eyebrow: "", descr: "", meta: "", accent: palette[i % palette.length], fit: "cover", show: true, sort_order: baseSort + 10 + i * 10 });
      byName[name] = key;
    });

    var imported = raw.map(function (o) {
      return {
        _key: uid(), category: byName[(o.category || "").trim()] || (CATS[0] && CATS[0].key) || "fish",
        name: String(o.name || "").trim(), warehouse: String(o.warehouse || "").trim(), spec: String(o.spec || "").trim(),
        supply_price: num(o.supplyPrice), courier: String(o.courier || "").trim(), ship_fee: num(o.shipFee),
        tax: o.tax === "과세" ? "과세" : "면세", image: String(o.image || "").trim(), link: String(o.link || "").trim(),
        show: !/숨김|hide|false/i.test(String(o.show || "")), sort_order: 0
      };
    }).filter(function (r) { return r.name; });

    items = replace ? imported : items.concat(imported);
    Promise.resolve().then(function () { return newNames.length ? saveCatsSheet() : null; })
      .then(saveProducts)
      .then(function () {
        dirty = false; bulkOpen = false; renderEditor();
        toast(imported.length + "개 상품을 가져왔어요 ✅" + (newNames.length ? (" (새 카테고리 " + newNames.length + "개 생성)") : ""));
      }).catch(function (err) {
        if (btn) { btn.disabled = false; btn.textContent = "가져오기 실행"; }
        toast("가져오기 실패: " + (err.message || err), true);
      });
  }

  /* ================= 공급가 점검 =================
     제안서에 적힌 공급가가 유통시트(정본)와 어긋나 있는지 대조한다.
     ⚠️ 상품명이 완전히 같을 때만 비교한다(§3-3). 값은 홍팀장이 고른 것만 반영한다 —
        제안서 가격을 일부러 다르게 적어둔 경우가 있어 통째로 덮어쓰지 않는다. */
  var priceOpen = false, priceRows = null, priceErr = "", priceMissing = [];

  function runPriceCheck() {
    priceOpen = true; priceRows = null; priceErr = ""; priceMissing = [];
    renderEditor();
    window.SVC.readYutong().then(function (yu) {
      var map = {};
      yu.forEach(function (p) { if (!map[p.name]) map[p.name] = p; });
      var diff = [], miss = [];
      items.forEach(function (it) {
        var n = (it.name || "").trim(); if (!n) return;
        var y = map[n];
        if (!y) { miss.push(n); return; }
        if (num(y.supply_price) !== num(it.supply_price)) {
          diff.push({ key: it._key, name: n, from: num(it.supply_price), to: num(y.supply_price), warehouse: y.warehouse || "" });
        }
      });
      priceRows = diff; priceMissing = miss; renderEditor();
    }).catch(function (err) { priceRows = []; priceErr = String(err && err.message || err); renderEditor(); });
  }

  function applyPriceFixes() {
    var picked = [].slice.call(document.querySelectorAll('input[data-pcheck]:checked'))
      .map(function (el) { return el.getAttribute("data-pcheck"); });
    if (!picked.length) { toast("반영할 항목을 골라주세요", true); return; }
    var btn = document.getElementById("btn-price-apply");
    if (btn) { btn.disabled = true; btn.textContent = "반영 중…"; }
    var n = 0;
    picked.forEach(function (k) {
      var row = (priceRows || []).filter(function (x) { return x.key === k; })[0];
      var it = findItem(k);
      if (row && it) { it.supply_price = row.to; n++; }
    });
    saveProducts().then(function () {
      priceOpen = false; dirty = false; renderEditor();
      toast(n + "개 상품의 공급가를 유통시트 기준으로 맞췄어요 ✅");
    }).catch(function (err) {
      if (btn) { btn.disabled = false; btn.textContent = "선택한 것 반영"; }
      toast("반영 실패: " + (err.message || err), true);
    });
  }

  function pricePanelHTML() {
    if (!priceOpen) return '';
    var body;
    if (priceRows === null) body = '<div class="st-empty">유통시트와 대조하는 중…</div>';
    else if (priceErr) body = '<div class="st-empty">유통시트를 읽지 못했어요 — ' + esc(priceErr) + '</div>';
    else if (!priceRows.length) {
      body = '<div class="st-empty">✅ 이 버전 상품의 공급가는 유통시트와 모두 같습니다.</div>';
    } else {
      body = '<table class="st-table"><thead><tr><th style="width:34px;"></th><th>상품명</th><th>제안서</th><th>유통시트</th><th>차이</th><th>창고</th></tr></thead><tbody>' +
        priceRows.map(function (r) {
          var gap = r.to - r.from;
          return '<tr><td><input type="checkbox" data-pcheck="' + r.key + '" checked></td>' +
            '<td class="st-ver">' + esc(r.name) + '</td>' +
            '<td class="st-num">' + r.from.toLocaleString() + '</td>' +
            '<td class="st-num big">' + r.to.toLocaleString() + '</td>' +
            '<td class="st-num' + (gap > 0 ? ' hot' : '') + '">' + (gap > 0 ? '+' : '') + gap.toLocaleString() + '</td>' +
            '<td class="st-ref">' + esc(r.warehouse) + '</td></tr>';
        }).join("") + '</tbody></table>';
    }
    if (priceRows && priceMissing.length) {
      body += '<div class="st-note">· 유통시트에서 <b>같은 이름을 못 찾은 상품 ' + priceMissing.length + '개</b>는 건드리지 않았습니다 ' +
        '(지금 안 파는 상품이거나 이름이 다른 경우입니다): ' + esc(priceMissing.join(" · ")) + '</div>';
    }
    return '<div class="modal-back" id="pc-close-back"><div class="modal" role="dialog" aria-label="공급가 점검">' +
      '<div class="modal-head"><span>💰 공급가 점검 — 유통시트와 대조</span>' +
      '<span>' + ((priceRows && priceRows.length) ? '<button class="btn-addsave" id="btn-price-apply">선택한 것 반영</button>' : '') +
      '<button class="modal-x" id="btn-pc-close" aria-label="닫기">✕</button></span></div>' +
      '<div class="modal-body">' + body + '</div></div></div>';
  }

  /* ================= 문구 설정 ================= */
  function settingsEffective() {
    var d = {
      hero_eyebrow: CFG.heroEyebrow || "", hero_lead: CFG.heroLead || "",
      hero_title1: (CFG.heroTitleLines || [])[0] || "", hero_title2: (CFG.heroTitleLines || [])[1] || "", hero_title3: (CFG.heroTitleLines || [])[2] || "",
      company: CFG.company || "", team: CFG.team || "", manager_name: CFG.managerName || "", manager_title: CFG.managerTitle || "",
      phone: CFG.phone || "", email: CFG.email || "", kakao: CFG.kakao || ""
    };
    for (var k in siteSettings) { if (siteSettings[k] != null) d[k] = siteSettings[k]; }
    return d;
  }
  function isOn(v) { return v === true || v === "1" || v === "true"; }
  function isHidePrice(s) { return isOn(s.hide_price); }
  function settingsPanelHTML() {
    var s = settingsEffective();
    function ti(k, label, ph) { return '<div><span class="mini">' + label + '</span><input data-sf="' + k + '" value="' + esc(s[k]) + '" placeholder="' + (ph || "") + '"></div>'; }
    if (!settingsOpen) return '<div class="settings-panel"><div class="sp-head" id="sp-toggle"><span>📝 상단·회사 문구 편집</span><span class="sp-caret">펼치기 ▾</span></div></div>';
    return '<div class="settings-panel open">' +
      '<div class="sp-head" id="sp-toggle"><span>📝 상단·회사 문구 편집</span><span class="sp-caret">접기 ▴</span></div>' +
      '<div class="sp-body">' +
        '<div class="sp-sec">표지(상단)</div>' +
        '<div class="row r2">' + ti("hero_eyebrow", "상단 작은 문구", "공동구매 마켓 제안서 · B2B 도매") +
          '<div><span class="mini">표지 설명(문단)</span><textarea data-sf="hero_lead" rows="2">' + esc(s.hero_lead) + '</textarea></div></div>' +
        '<div class="row r3">' + ti("hero_title1", "제목 1줄") + ti("hero_title2", "제목 2줄") + ti("hero_title3", "제목 3줄(노란색)") + '<div></div></div>' +
        '<div class="sp-sec">회사 · 담당자</div>' +
        '<div class="row r2">' + ti("company", "회사명") + ti("team", "팀명") + '</div>' +
        '<div class="row r2">' + ti("manager_name", "담당자명") + ti("manager_title", "직함") + '</div>' +
        '<div class="sp-sec">연락처</div>' +
        '<div class="row r3">' + ti("phone", "전화") + ti("email", "이메일") + ti("kakao", "카카오톡 ID") + '<div></div></div>' +
        '<div class="sp-sec">이 버전에 넣을 것 / 뺄 것</div>' +
        '<label class="hide-price' + (isHidePrice(s) ? ' on' : '') + '">' +
          '<input type="checkbox" data-sf="hide_price"' + (isHidePrice(s) ? ' checked' : '') + '>' +
          '<span><b>공급가 숨기기</b> — 가격 대신 <b>[공급가 문의하기]</b>가 표시됩니다.' +
          '<br><span class="hp-note">오픈카톡방·단체방처럼 불특정 다수가 보는 링크에 사용하세요.</span></span>' +
        '</label>' +
        '<label class="hide-price' + (isOn(s.hide_callout) ? ' on' : '') + '">' +
          '<input type="checkbox" data-sf="hide_callout"' + (isOn(s.hide_callout) ? ' checked' : '') + '>' +
          '<span><b>‘전체 리스트 요청’ 안내 박스 빼기</b> — 상품 아래 붙는 “전체 상품 약 500여 종 · 구글 시트로 공유” 박스.' +
          '<br><span class="hp-note">거래처가 자기 거래처에게 다시 돌리는 제안서라면 빼는 게 낫습니다.</span></span>' +
        '</label>' +
        '<label class="hide-price' + (isOn(s.hide_contact) ? ' on' : '') + '">' +
          '<input type="checkbox" data-sf="hide_contact"' + (isOn(s.hide_contact) ? ' checked' : '') + '>' +
          '<span><b>맨 아래 담당자 명함(문의 섹션) 빼기</b> — 이름·전화·이메일·카톡이 통째로 안 나갑니다.' +
          '<br><span class="hp-note">받은 업체가 그대로 자기 거래처에 올릴 제안서에 쓰세요. 우리 연락처가 안 붙습니다.</span></span>' +
        '</label>' +
        '<div class="sp-foot"><span class="sp-note">저장하면 공개 사이트 상단·문의에 바로 반영됩니다.</span><button class="btn-addsave" id="btn-save-settings">문구 저장</button></div>' +
      '</div></div>';
  }
  function saveSettings(btn) {
    if (!currentVersion) return;
    btn.disabled = true; btn.textContent = "저장 중…";
    var keys = ["hero_eyebrow", "hero_title1", "hero_title2", "hero_title3", "hero_lead", "company", "team", "manager_name", "manager_title", "phone", "email", "kakao"];
    var eff = settingsEffective(), obj = {};
    keys.forEach(function (k) { obj[k] = (eff[k] != null ? String(eff[k]) : ""); });
    ["hide_price", "hide_callout", "hide_contact"].forEach(function (k) { obj[k] = isOn(eff[k]) ? "1" : ""; });
    currentVersion.settings = obj; siteSettings = Object.assign({}, obj);
    saveVersionsSheet().then(function () {
      btn.disabled = false; btn.textContent = "문구 저장";
      toast("문구가 저장됐어요 ✅ 이 버전 공개 사이트에 반영됩니다");
    }).catch(function (err) { btn.disabled = false; btn.textContent = "문구 저장"; toast("저장 실패: " + (err.message || err), true); });
  }

  /* ================= 새 상품 입력폼 ================= */
  function addFormHTML() {
    var it = newItem, pv = imgUrl(it.image);
    var taxSel = function (v) { return '<option' + (it.tax === v ? ' selected' : '') + '>' + v + '</option>'; };
    var catOpts = CATS.map(function (c) { return '<option value="' + c.key + '"' + (it.category === c.key ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join("");
    return '<div class="card new-card">' +
      '<div class="thumb">' +
        '<div class="imgbox">' + (pv ? '<img src="' + esc(pv) + '" alt="">' : '<span style="font-size:12px;color:#9aa7ad;">사진 없음</span>') + '</div>' +
        '<div class="up"><label class="btn-up" data-upnew="1">사진 업로드<input type="file" accept="image/*" data-nfile="1" style="display:none;"></label></div>' +
      '</div>' +
      '<div class="fields">' +
        '<div class="new-badge">＋ 새 상품 입력</div>' +
        '<div class="row r1">' +
          '<div><span class="mini">카테고리</span><select data-nf="category">' + catOpts + '</select></div>' +
          '<div class="ac-wrap"><span class="mini">상품명 <span class="ac-tip">타이핑하면 자동완성 ↓</span></span><input data-nf="name" value="' + esc(it.name) + '" placeholder="상품명 입력" autocomplete="off"><div class="ac-list" id="ac-list"></div></div>' +
          '<div><span class="mini">창고(배지)</span><input data-nf="warehouse" value="' + esc(it.warehouse) + '" placeholder="예: 동해"></div>' +
        '</div>' +
        '<div class="row r2">' +
          '<div><span class="mini">설명(회색 글씨)</span><input data-nf="spec" value="' + esc(it.spec) + '" placeholder="예: 동해 창고 · 냉동"></div>' +
          '<div><span class="mini">택배사</span><input data-nf="courier" value="' + esc(it.courier) + '" placeholder="예: 씨제이대한통운"></div>' +
        '</div>' +
        '<div class="row r3">' +
          '<div><span class="mini">공급가(원)</span><input data-nf="supply_price" type="number" inputmode="numeric" value="' + esc(it.supply_price) + '"></div>' +
          '<div><span class="mini">택배비(원)</span><input data-nf="ship_fee" type="number" inputmode="numeric" value="' + esc(it.ship_fee) + '"></div>' +
          '<div><span class="mini">면과세</span><select data-nf="tax">' + taxSel("면세") + taxSel("과세") + '</select></div>' +
          '<div><span class="mini">&nbsp;</span></div>' +
        '</div>' +
        '<div class="row r4">' +
          '<div><span class="mini">원본 링크 (선택)</span><input data-nf="link" value="' + esc(it.link || "") + '" placeholder="https://masterc.kr/..."></div>' +
        '</div>' +
        '<div class="card-foot">' +
          '<label class="toggle"><input type="checkbox" data-nf="show"' + (it.show !== false ? ' checked' : '') + '> 사이트에 표시</label>' +
          '<button class="btn-cancel" id="btn-add-cancel">취소</button>' +
          '<button class="btn-addsave" id="btn-add-save">이 상품 추가</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* ================= 화면 ================= */
  function renderEditor() {
    var verCtrl = '<select id="ver-select" class="ver-select" title="편집할 버전 선택">' +
        versions.map(function (v) { return '<option value="' + v.id + '"' + (currentVersion && v.id === currentVersion.id ? ' selected' : '') + '>' + esc(v.name) + '</option>'; }).join("") +
      '</select>' +
      '<button class="btn-ghost" id="btn-ver-new">+ 새 버전</button>' +
      '<button class="btn-ghost" id="btn-ver-copy" title="현재 버전의 상품·문구를 그대로 복사해 새 버전 만들기">⧉ 복제</button>' +
      '<button class="btn-ghost" id="btn-ver-rename" title="이름과 공개 주소(?v=) 변경">✏ 이름·주소</button>' +
      '<button class="btn-ghost" id="btn-ver-link">🔗 링크 복사</button>' +
      '<button class="btn-ghost danger" id="btn-ver-del" title="이 버전과 소속 상품 삭제">🗑 삭제</button>';
    var pubHref = "index.html?nt=1" + (currentVersion ? ("&v=" + encodeURIComponent(currentVersion.slug)) : "");
    var html =
      '<div class="topbar"><span class="brand">🐟 상품 관리자</span>' + verCtrl +
      '<span class="spacer"></span>' +
      '<button class="btn-ghost" id="btn-price-check" title="제안서 공급가가 유통시트와 다른 것만 찾아 줍니다">💰 공급가 점검</button>' +
      '<a href="' + pubHref + '" target="_blank" rel="noopener">공개 사이트 보기 ↗</a></div>' +
      '<div class="wrap">' +
      '<div class="hint">상품을 고친 뒤 그 상품의 <b>[저장]</b> 버튼을 누르면 바로 공개 사이트에 반영됩니다. 사진은 <b>[사진 업로드]</b>, 삭제는 <b>[삭제]</b>로 즉시 처리돼요. (아래 <b>[전체 저장]</b>은 여러 개를 한 번에 저장할 때만 쓰세요.)</div>' +
      settingsPanelHTML() + catPanelHTML() + bulkPanelHTML();

    var anyOpen = CATS.some(function (c) { return expandedCats[c.key]; });
    html += '<div class="prodlist-head"><span class="plh-title">상품 목록 <span class="plh-hint">(카테고리 제목을 눌러 펼치기/접기)</span></span>' +
      '<button class="btn-ghost2" id="btn-expand-all">' + (anyOpen ? '전체 접기 ▴' : '전체 펼치기 ▾') + '</button></div>';

    CATS.forEach(function (c) {
      var list = items.filter(function (i) { return i.category === c.key; });
      var isOpen = !!expandedCats[c.key] || addingCat === c.key;
      html += '<div class="cat-block' + (c.show === false ? ' cat-hidden' : '') + '">';
      html += '<div class="cat-title cat-toggle-head" data-catview="' + esc(c.key) + '"><span class="tcaret">' + (isOpen ? '▾' : '▸') + '</span><span class="dot" style="background:' + c.accent + '"></span>' + esc(c.name) + ' <span class="count">' + list.length + '개</span>' + (c.show === false ? ' <span style="color:#e0483d;font-weight:800;">· 숨김</span>' : '') + '</div>';
      if (isOpen) {
        html += list.map(cardHTML).join("");
        if (addingCat === c.key) html += addFormHTML();
        else html += '<div class="add-row"><button class="btn-add" data-add="' + c.key + '">+ ' + esc(c.name) + ' 상품 1개 추가</button></div>';
      }
      html += '</div>';
    });

    html += '</div><div class="savebar"><span class="status" id="save-status">각 상품의 [저장] 버튼으로 저장하세요</span>' +
      '<button class="btn-save" id="btn-save" disabled>전체 저장</button></div>' + pricePanelHTML();
    root.innerHTML = html;
    setDirty(dirty);
    bindEditor();
  }

  function bindEditor() {
    if (_delegated) return;
    _delegated = true;

    root.addEventListener("focusin", function (e) { if (!(e.target.closest && e.target.closest(".ac-wrap"))) hideAc(); });

    root.addEventListener("input", function (e) {
      var sf = e.target.getAttribute("data-sf");
      // 체크박스는 아래 change 핸들러가 처리한다(여기서 .value 를 읽으면 "on" 이 들어간다)
      if (sf) { if (e.target.type !== "checkbox") siteSettings[sf] = e.target.value; return; }
      var cf = e.target.getAttribute("data-cf");
      if (cf) { var cw = e.target.closest(".cat-edit"); var c = cw && catByKey(cw.getAttribute("data-catkey")); if (c) c[cf] = e.target.value; return; }
      var nf = e.target.getAttribute("data-nf");
      if (nf && newItem) {
        if (nf === "supply_price" || nf === "ship_fee") newItem[nf] = num(e.target.value);
        else newItem[nf] = e.target.value;
        if (nf === "name") scheduleCatalog(e.target.value);
        return;
      }
      var f = e.target.getAttribute("data-f"); if (!f) return;
      var card = e.target.closest(".card"); if (!card) return;
      var it = findItem(card.getAttribute("data-key")); if (!it) return;
      if (f === "supply_price" || f === "ship_fee") it[f] = num(e.target.value);
      else it[f] = e.target.value;
      setDirty(true);
    });

    root.addEventListener("change", function (e) {
      if (e.target.id === "ver-select") { switchVersion(e.target.value); return; }
      var sfChk = e.target.getAttribute("data-sf");
      if (sfChk && sfChk.indexOf("hide_") === 0) {          // 공개 범위 스위치 3개 공통
        siteSettings[sfChk] = e.target.checked ? "1" : "";
        var lab = e.target.closest(".hide-price"); if (lab) lab.classList.toggle("on", e.target.checked);
        return;
      }
      var cf = e.target.getAttribute("data-cf");
      if (cf) {
        var cw = e.target.closest(".cat-edit"); var cc = cw && catByKey(cw.getAttribute("data-catkey"));
        if (cc) { if (cf === "show") { cc.show = e.target.checked; saveCategory(cc.key); } else cc[cf] = e.target.value; }
        return;
      }
      var nf = e.target.getAttribute("data-nf");
      if (nf && newItem) {
        if (nf === "show") { newItem.show = e.target.checked; return; }
        if (nf === "tax") { newItem.tax = e.target.value; return; }
        if (nf === "category") { newItem.category = e.target.value; addingCat = e.target.value; renderEditor(); focusNewName(); return; }
      }
      if (e.target.getAttribute("data-nfile") && e.target.files && e.target.files[0]) { uploadNew(e.target.files[0]); return; }
      if (e.target.id === "bulk-csv-file" && e.target.files && e.target.files[0]) {
        var reader = new FileReader();
        reader.onload = function (ev) { var bta = document.getElementById("bulk-csv-text"); if (bta) bta.value = String(ev.target.result || ""); };
        reader.readAsText(e.target.files[0], "utf-8");
        return;
      }
      var f = e.target.getAttribute("data-f");
      if (f) {
        var card = e.target.closest(".card"); var it = findItem(card.getAttribute("data-key")); if (!it) return;
        if (f === "show") { it.show = e.target.checked; card.classList.toggle("hidden-row", !e.target.checked); setDirty(true); return; }
        if (f === "tax") { it.tax = e.target.value; setDirty(true); return; }
        if (f === "category") { it.category = e.target.value; setDirty(true); renderEditor(); return; }
      }
      var fk = e.target.getAttribute("data-file");
      if (fk && e.target.files && e.target.files[0]) doUpload(fk, e.target.files[0]);
    });

    root.addEventListener("click", function (e) {
      if (e.target.id === "btn-save") { saveAll(); return; }
      if (e.target.id === "btn-price-check") { runPriceCheck(); return; }
      if (e.target.id === "btn-price-apply") { applyPriceFixes(); return; }
      if (e.target.id === "btn-pc-close" || e.target.id === "pc-close-back") { priceOpen = false; renderEditor(); return; }
      if (e.target.closest && e.target.closest("#sp-toggle")) { settingsOpen = !settingsOpen; renderEditor(); return; }
      if (e.target.id === "btn-save-settings") { saveSettings(e.target); return; }
      if (e.target.closest && e.target.closest("#cat-toggle")) { catsOpen = !catsOpen; renderEditor(); return; }
      if (e.target.closest && e.target.closest("#bulk-toggle")) { bulkOpen = !bulkOpen; renderEditor(); return; }
      if (e.target.id === "btn-bulk-import") { runBulkImport(); return; }
      if (e.target.id === "btn-cat-new") { newCategory(); return; }
      var catSaveKey = e.target.getAttribute("data-catsave"); if (catSaveKey) { saveCategory(catSaveKey, e.target); return; }
      var catDelKey = e.target.getAttribute("data-catdel"); if (catDelKey) { deleteCategory(catDelKey); return; }
      var headEl = e.target.closest && e.target.closest(".cat-toggle-head");
      if (headEl) { var vk = headEl.getAttribute("data-catview"); expandedCats[vk] = !expandedCats[vk]; renderEditor(); return; }
      if (e.target.id === "btn-expand-all") {
        var openNow = CATS.some(function (c) { return expandedCats[c.key]; });
        expandedCats = {}; if (!openNow) CATS.forEach(function (c) { expandedCats[c.key] = true; });
        renderEditor(); return;
      }
      if (e.target.id === "btn-ver-new") { newVersion(); return; }
      if (e.target.id === "btn-ver-copy") { duplicateVersion(); return; }
      if (e.target.id === "btn-ver-rename") { renameVersion(); return; }
      if (e.target.id === "btn-ver-link") { copyVersionLink(); return; }
      if (e.target.id === "btn-ver-del") { deleteVersion(); return; }
      var addCat = e.target.getAttribute("data-add");
      if (addCat) {
        addingCat = addCat; expandedCats[addCat] = true;
        newItem = { _key: "NEW", category: addCat, name: "", warehouse: "", spec: "", supply_price: 0, courier: "", ship_fee: 4000, tax: "면세", image: "", link: "", show: true };
        renderEditor(); focusNewName(); return;
      }
      var acEl = e.target.closest && e.target.closest(".ac-item");
      if (acEl && newItem) {
        var r = acResults[parseInt(acEl.getAttribute("data-ac"), 10)];
        if (r) {
          newItem.name = r.name; newItem.warehouse = r.warehouse || ""; newItem.supply_price = r.supply_price || 0;
          newItem.ship_fee = r.ship_fee || 0; newItem.tax = r.tax || "면세";
          if (r.courier) newItem.courier = r.courier;
          // 사진·원본링크·설명까지 같이 (상품이미지_v2 캐시에 있으면)
          if (r.image) newItem.image = r.image;
          if (r.link) newItem.link = r.link;
          if (r.spec && !newItem.spec) newItem.spec = r.spec;
        }
        renderEditor(); focusNewName(); return;
      }
      if (e.target.id === "btn-add-cancel") { addingCat = null; newItem = null; renderEditor(); return; }
      if (e.target.id === "btn-add-save") { saveNewItem(e.target); return; }
      var findKey = e.target.getAttribute("data-findpic"); if (findKey) { fillPhoto(findKey, e.target); return; }
      var saveKey = e.target.getAttribute("data-saveone"); if (saveKey) { saveOne(saveKey, e.target); return; }
      var delKey = e.target.getAttribute("data-del"); if (delKey) { deleteOne(delKey); return; }
    });
  }

  /* ================= 사진 업로드 =================
     ⚠️ 파일 업로드는 구글 드라이브 API를 쓰는데, baljuseo-sheets 프로젝트에서
        그 API가 아직 꺼져 있다(2026-08-20 확인, HTTP 403).
        평소에는 [📷 사진 찾기]로 마스터씨 사진을 붙이면 되므로 업로드는 예비 수단이다. */
  function uploadErrMsg(err) {
    var m = String(err && err.message || err);
    if (/403/.test(m)) return "사진 업로드가 아직 막혀 있어요 — 대신 [📷 사진 찾기]를 쓰거나 하비서에게 말씀해 주세요";
    return "사진 업로드 실패: " + m;
  }

  function doUpload(key, file) {
    var it = findItem(key); if (!it) return;
    var label = root.querySelector('.btn-up[data-up="' + key + '"]');
    if (label) { label.classList.add("busy"); label.childNodes[0].nodeValue = "업로드 중…"; }
    window.SVC.upload(file).then(function (url) {
      it.image = url; setDirty(true); renderEditor(); toast("사진이 업로드됐어요 — [저장]을 눌러야 사이트에 반영됩니다");
    }).catch(function (err) {
      if (label) { label.classList.remove("busy"); label.childNodes[0].nodeValue = "사진 업로드"; }
      toast(uploadErrMsg(err), true);
    });
  }
  function uploadNew(file) {
    if (!newItem) return;
    var label = root.querySelector('.new-card .btn-up[data-upnew]');
    if (label) { label.classList.add("busy"); label.childNodes[0].nodeValue = "업로드 중…"; }
    window.SVC.upload(file).then(function (url) {
      newItem.image = url; renderEditor(); focusNewName(); toast("사진이 업로드됐어요");
    }).catch(function (err) {
      if (label) { label.classList.remove("busy"); label.childNodes[0].nodeValue = "사진 업로드"; }
      toast(uploadErrMsg(err), true);
    });
  }
  function focusNewName() { var el = root.querySelector('.new-card input[data-nf="name"]'); if (el) { el.focus(); var v = el.value; el.value = ""; el.value = v; } }

  /* ================= 상품명 자동완성 (도구시트 '전체상품원가') ================= */
  function hideAc() { var l = document.getElementById("ac-list"); if (l) { l.className = "ac-list"; l.innerHTML = ""; } }
  function scheduleCatalog(q) {
    if (acTimer) clearTimeout(acTimer);
    q = (q || "").trim();
    if (q.length < 1) { hideAc(); return; }
    acTimer = setTimeout(function () { runCatalog(q); }, 220);
  }
  function renderAcList(list) {
    if (!acResults.length) { list.className = "ac-list show"; list.innerHTML = '<div class="ac-empty">일치하는 상품이 없어요</div>'; return; }
    list.innerHTML = acResults.map(function (r, i) {
      var price = r.supply_price ? ("₩" + Number(r.supply_price).toLocaleString()) : "";
      var pic = r.image ? '<img class="ac-thumb" src="' + esc(imgUrl(r.image)) + '" alt="" loading="lazy">' : '<span class="ac-thumb none"></span>';
      return '<div class="ac-item" data-ac="' + i + '">' + pic + '<span class="ac-name">' + esc(r.name) + '</span>' +
        '<span class="ac-meta">' + esc(r.warehouse || "") + (price ? " · " + price : "") + (r.image ? " · 📷" : "") + '</span></div>';
    }).join("");
    list.className = "ac-list show";
  }
  /* 자동완성 재료를 상품명으로 합친다.
       유통시트(정본)  → 공급가 · 택배사 · 택배비 · 면과세 · 창고   ※상품변동사항 탭 등은 제외
       상품이미지_v2   → 사진 · 설명(※구성) · masterc 원본 링크
     공급가는 반드시 유통시트에서 온다 — 도구시트 '전체상품원가'는 사본이라 낡을 수 있다
     (2026-08-20 홍팀장 지시). 덕분에 상품명만 고르면 최신 공급가와 사진이 같이 붙는다. */
  function firstSpec(s) {
    var m = String(s || "").match(/※\s*구성\s*:\s*([^\n]+)/);
    return m ? m[1].trim() : "";
  }
  function loadCatalog() {
    if (catalogCache || catalogLoading) return;
    catalogLoading = true;
    Promise.all([window.SVC.readYutong(), window.SVC.readTab("상품이미지_v2")]).then(function (r) {
      var yu = r[0] || [], imgRows = r[1] || [];

      // 사진 캐시: 상품명 → {사진, 설명, 링크}
      var pic = {};
      imgRows.slice(1).forEach(function (row) {
        var n = String(row[0] || "").trim(); if (!n) return;
        pic[n] = { image: String(row[2] || "").trim(), spec: firstSpec(row[3]), link: String(row[5] || "").trim() };
      });

      var byName = {};
      yu.forEach(function (p) {
        if (byName[p.name]) return;                     // 같은 상품이 여러 탭에 있으면 먼저 것
        var m = pic[p.name] || {};
        byName[p.name] = {
          name: p.name, supply_price: p.supply_price, tax: p.tax, ship_fee: p.ship_fee,
          courier: p.courier, warehouse: p.warehouse,
          image: m.image || "", spec: m.spec || "", link: m.link || ""
        };
      });
      // 지금 안 파는(유통시트에 없는) 상품도 사진·링크는 붙도록 후보에 남긴다
      Object.keys(pic).forEach(function (n) {
        if (byName[n]) return;
        byName[n] = { name: n, supply_price: 0, tax: "면세", ship_fee: 0, courier: "", warehouse: "", image: pic[n].image, spec: pic[n].spec, link: pic[n].link };
      });

      catalogCache = Object.keys(byName).map(function (k) { return byName[k]; });
      catalogLoading = false;
      var inp = root.querySelector('.new-card input[data-nf="name"]');
      if (inp && inp.value) runCatalog(inp.value);
    }).catch(function () {
      catalogLoading = false; catalogCache = [];
      var l = document.getElementById("ac-list");
      if (l) { l.className = "ac-list show"; l.innerHTML = '<div class="ac-empty">상품 목록을 불러오지 못했어요</div>'; }
    });
  }

  /* 기존 상품의 사진·링크를 캐시에서 찾아 채운다.
     ⚠️ 상품명이 완전히 같을 때만 붙인다 — 비슷한 이름에 엉뚱한 사진이 붙으면
        거래처가 그걸 보고 주문한다(CLAUDE.md §3-3 절대규칙). */
  function fillPhoto(key, btn) {
    var it = findItem(key); if (!it) return;
    var go = function () {
      var hit = (catalogCache || []).filter(function (r) { return r.name === (it.name || "").trim(); })[0];
      if (!hit || (!hit.image && !hit.link)) {
        toast("'" + (it.name || "") + "' 이름의 사진을 못 찾았어요 — 게시판 상품명과 똑같아야 붙습니다", true);
        if (btn) { btn.disabled = false; btn.textContent = "📷 사진 찾기"; }
        return;
      }
      if (hit.image) it.image = hit.image;
      if (hit.link && !it.link) it.link = hit.link;
      if (hit.spec && !it.spec) it.spec = hit.spec;
      setDirty(true); renderEditor();
      toast("사진을 찾아 넣었어요 — [저장]을 눌러야 사이트에 반영됩니다");
    };
    if (btn) { btn.disabled = true; btn.textContent = "찾는 중…"; }
    if (catalogCache) return go();
    loadCatalog();
    var tries = 0;
    var wait = setInterval(function () {
      if (catalogCache) { clearInterval(wait); go(); }
      else if (++tries > 40) { clearInterval(wait); if (btn) { btn.disabled = false; btn.textContent = "📷 사진 찾기"; } toast("상품 목록을 불러오지 못했어요", true); }
    }, 250);
  }
  function runCatalog(q) {
    var list = document.getElementById("ac-list"); if (!list) return;
    if (!catalogCache) { loadCatalog(); list.className = "ac-list show"; list.innerHTML = '<div class="ac-empty">상품 목록 불러오는 중…</div>'; return; }
    var ql = String(q).toLowerCase();
    acResults = catalogCache.filter(function (r) { return r.name.toLowerCase().indexOf(ql) > -1; })
      // 사진이 있는 상품을 먼저 (고르면 사진까지 바로 붙는다), 그 다음 이름이 짧은 순
      .sort(function (a, b) {
        var ai = a.image ? 0 : 1, bi = b.image ? 0 : 1;
        if (ai !== bi) return ai - bi;
        return a.name.length - b.name.length;
      }).slice(0, 8);
    renderAcList(list);
  }

  /* ================= 상품 저장/삭제 ================= */
  function saveNewItem(btn) {
    if (!newItem) return;
    if (!(newItem.name || "").trim()) { toast("상품명을 입력하세요", true); focusNewName(); return; }
    btn.disabled = true; btn.textContent = "추가 중…";
    var it = Object.assign({}, newItem, { _key: uid() });
    items.push(it);
    saveProducts().then(function () {
      addingCat = null; newItem = null; dirty = false; renderEditor();
      toast("상품이 추가됐어요 ✅ 공개 사이트에 반영됩니다");
    }).catch(function (err) {
      items = items.filter(function (x) { return x !== it; });
      btn.disabled = false; btn.textContent = "이 상품 추가";
      toast("추가 실패: " + (err.message || err), true);
    });
  }
  function saveOne(key, btn) {
    var it = findItem(key); if (!it) return;
    if (!(it.name || "").trim()) { toast("상품명을 입력하세요", true); return; }
    if (btn) { btn.disabled = true; btn.textContent = "저장중…"; }
    saveProducts().then(function () {
      dirty = false; setDirty(false);
      if (btn) { btn.disabled = false; btn.textContent = "저장됨 ✓"; setTimeout(function () { if (btn) btn.textContent = "저장"; }, 1500); }
      toast("저장됐어요 ✅ 공개 사이트에 반영됩니다");
    }).catch(function (err) { if (btn) { btn.disabled = false; btn.textContent = "저장"; } toast("저장 실패: " + (err.message || err), true); });
  }
  function deleteOne(key) {
    var it = findItem(key); if (!it) return;
    if (!window.confirm("이 상품을 삭제할까요?\n공개 사이트에서 바로 사라집니다.")) return;
    var keep = items.slice();
    items = items.filter(function (x) { return x._key !== key; });
    saveProducts().then(function () { renderEditor(); toast("삭제됐어요"); })
      .catch(function (err) { items = keep; renderEditor(); toast("삭제 실패: " + (err.message || err), true); });
  }
  function saveAll() {
    var btn = document.getElementById("btn-save"); btn.disabled = true; btn.textContent = "저장 중…";
    saveProducts().then(function () {
      dirty = false; renderEditor(); toast("저장 완료 — 공개 사이트에 반영됐어요 ✅");
    }).catch(function (err) {
      btn.disabled = false; btn.textContent = "전체 저장"; toast("저장 실패: " + (err.message || err), true);
    });
  }

  /* ================= 버전 ================= */
  var SLUG_HINTS = [["셀러", "seller"], ["온라인", "online"], ["스마트스토어", "store"], ["스토어", "store"],
    ["공동구매", "market"], ["공구", "market"], ["마켓", "market"], ["도매", "wholesale"],
    ["급식", "catering"], ["식자재", "food"], ["소매", "retail"], ["선물", "gift"], ["기본", "default"]];
  function slugify(name) {
    var raw = (name || "").toLowerCase();
    var s = raw.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (!s) { for (var i = 0; i < SLUG_HINTS.length; i++) { if (raw.indexOf(SLUG_HINTS[i][0]) > -1) { s = SLUG_HINTS[i][1]; break; } } }
    if (!s) s = "v" + (versions.length + 1);
    var base = s, n = 2;
    while (versions.some(function (v) { return v.slug === s; })) { s = base + "-" + n; n++; }
    return s;
  }
  function reloadInto(msg) {
    root.innerHTML = '<div class="loading">' + (msg || "불러오는 중…") + '</div>';
    _delegated = false;
    return loadAll().then(function () { dirty = false; renderEditor(); });
  }
  function switchVersion(id) {
    if (currentVersion && id === currentVersion.id) return;
    if (dirty && !window.confirm("저장 안 된 상품 변경사항이 있습니다.\n버전을 바꾸면 사라집니다. 계속할까요?")) { renderEditor(); return; }
    var v = versions.filter(function (x) { return x.id === id; })[0]; if (!v) return;
    currentVersion = v; addingCat = null; newItem = null; dirty = false; expandedCats = {};
    reloadInto("버전 불러오는 중…").catch(function (err) { toast("불러오기 실패: " + (err.message || err), true); });
  }
  function renameVersion() {
    if (!currentVersion) return;
    var name = window.prompt("버전 이름 변경", currentVersion.name); if (name === null) return;
    name = (name || "").trim(); if (!name) return;
    var slug = window.prompt("이 버전의 주소(영문)를 정하세요.\n예: seller  →  .../?v=seller\n\n영문 소문자·숫자·하이픈(-)만 쓸 수 있습니다.", currentVersion.slug);
    if (slug === null) return;
    slug = (slug || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!slug) { toast("주소는 영문/숫자로 입력해주세요", true); return; }
    if (versions.some(function (v) { return v.slug === slug && v.id !== currentVersion.id; })) { toast("이미 쓰고 있는 주소예요. 다른 걸로 해주세요", true); return; }
    var oldSlug = currentVersion.slug;
    currentVersion.name = name; currentVersion.slug = slug;
    // 상품 행의 '버전' 칸도 같이 바꿔야 상품이 미아가 되지 않는다
    saveVersionsSheet().then(function () { return oldSlug === slug ? null : saveProducts(); })
      .then(function () { renderEditor(); toast("변경됐어요 — 주소: ?v=" + slug); })
      .catch(function (err) { toast("변경 실패: " + (err.message || err), true); });
  }
  function copyVersionLink() {
    if (!currentVersion) return;
    var url = location.href.split("?")[0].replace(/admin\.html$/, "") + "?v=" + encodeURIComponent(currentVersion.slug);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { toast("링크 복사됨 ✅"); }, function () { window.prompt("아래 링크를 복사하세요", url); });
    } else window.prompt("아래 링크를 복사하세요", url);
  }
  function createVersion(name, src) {
    name = (name || "").trim(); if (!name) return;
    var slug = slugify(name);
    var sort = (versions.length ? Math.max.apply(null, versions.map(function (v) { return v.sort_order || 0; })) : 0) + 10;
    var nv = { id: uid(), slug: slug, name: name, sort_order: sort, settings: src ? Object.assign({}, src.settings || {}) : {} };
    var copied = src ? items.slice() : [];
    versions.push(nv);
    saveVersionsSheet().then(function () {
      // 새 버전으로 이동: 지금 items 는 이전 버전 것이므로 otherRows 로 넘긴다
      otherRows = otherRows.concat(items.map(function (it, i) { return itemToRow(it, it.sort_order || (i + 1) * 10); }));
      currentVersion = nv;
      items = copied.map(function (it) { return Object.assign({}, it, { _key: uid() }); });
      siteSettings = Object.assign({}, nv.settings);
      addingCat = null; newItem = null; expandedCats = {}; dirty = false;
      return items.length ? saveProducts() : null;
    }).then(function () {
      return reloadInto("새 버전 여는 중…");
    }).then(function () {
      toast("'" + name + "' 만들었어요 ✅" + (copied.length ? (" (상품 " + copied.length + "개 복사)") : "") + " · 주소 ?v=" + slug);
    }).catch(function (err) {
      versions = versions.filter(function (v) { return v.id !== nv.id; });
      toast("버전 생성 실패: " + (err.message || err), true);
    });
  }
  function newVersion() {
    var name = window.prompt("새 버전 이름 (빈 상태로 시작합니다)\n예: 급식 거래처용");
    if (name === null || !name.trim()) return;
    createVersion(name, null);
  }
  function duplicateVersion() {
    if (!currentVersion) { toast("복제할 버전이 없습니다", true); return; }
    if (dirty && !window.confirm("저장 안 된 변경사항은 복제본에 반영되지 않습니다.\n계속할까요?")) return;
    var name = window.prompt("'" + currentVersion.name + "' 을(를) 복제합니다.\n상품 " + items.length + "개와 문구 설정이 그대로 복사됩니다.\n\n새 버전 이름을 입력하세요.", currentVersion.name + " 복사본");
    if (name === null || !name.trim()) return;
    createVersion(name, currentVersion);
  }
  function deleteVersion() {
    if (!currentVersion) return;
    if (versions.length <= 1) { toast("마지막 버전은 삭제할 수 없습니다", true); return; }
    var v = currentVersion, cnt = items.length;
    if (!window.confirm("[" + v.name + "] 버전을 삭제합니다.\n\n· 이 버전의 상품 " + cnt + "개가 함께 삭제됩니다\n· 공유한 링크(?v=" + v.slug + ")는 더 이상 열리지 않습니다\n· 되돌릴 수 없습니다\n\n계속할까요?")) return;
    var typed = window.prompt("확인을 위해 버전 이름을 그대로 입력하세요:\n" + v.name);
    if (typed === null) return;
    if (typed.trim() !== v.name.trim()) { toast("이름이 일치하지 않아 취소했습니다", true); return; }
    versions = versions.filter(function (x) { return x.id !== v.id; });
    items = [];                                  // 이 버전 상품은 저장 시 사라진다
    saveProducts().then(saveVersionsSheet).then(function () {
      currentVersion = versions[0]; addingCat = null; newItem = null; expandedCats = {}; dirty = false;
      return reloadInto("삭제 중…");
    }).then(function () { toast("'" + v.name + "' 버전을 삭제했어요"); })
      .catch(function (err) { toast("삭제 실패: " + (err.message || err), true); });
  }

  /* ================= 시작 ================= */
  if (!(window.SVC && CFG.dataSheet && CFG.dataSheet.id && CFG.svc && CFG.svc.key)) {
    root.innerHTML = '<div class="center-wrap"><div class="panel"><h1>설정이 필요합니다</h1>' +
      '<p class="sub">config.js 의 <code>dataSheet</code>·<code>svc</code> 값이 비어 있습니다.</p></div></div>';
    return;
  }
  root.innerHTML = '<div class="loading">불러오는 중…</div>';
  window.SVC.ensureTabs()
    .then(loadAll)
    .then(function () {
      dirty = false; renderEditor();
    })
    .catch(function (err) {
      root.innerHTML = '<div class="center-wrap"><div class="panel"><h1>불러오지 못했습니다</h1>' +
        '<p class="sub">' + esc(err.message || err) + '</p>' +
        '<p class="sub">잠시 후 새로고침해 주세요. 계속되면 하비서에게 알려주세요.</p></div></div>';
    });
})();
