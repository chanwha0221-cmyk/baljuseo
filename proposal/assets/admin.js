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

  /* ================= 카테고리 = 카탈로그의 '상품분류' 그대로 =================
     2026-08-24 홍팀장: "카테고리를 여기서 따로 관리할 필요 없다. catalog.html 에서 따오자."
     → 도구시트 '상품분류' 탭(상품명 → 분류)이 유일한 분류 기준이다. 카탈로그·미디어업데이터와 같은 표.
       · 카테고리 key = 분류명 그대로 ('수산', '축산' …). 옛 key(fish/meal/living)는 로드할 때 자동 이관.
       · 아이콘·색은 아래 프리셋 고정 — 관리 화면에서 손댈 일이 없다(카테고리 관리 패널 폐기).
       · 제안서카테고리 탭은 공개 사이트(app.js)가 읽으므로 계속 채워 준다(자동 동기화). */
  /* 🚨 고정 규칙 (2026-08-24 홍팀장): mark 는 «이모지» 다. 한자(魚·肉·食…) 박지 말 것.
     catalog.html 의 분류 아이콘과 같은 걸 쓴다. */
  var CAT_PRESET = [
    { key: "수산",      mark: "🐟", eyebrow: "SEAFOOD",        accent: "#0E8A8F", fit: "cover" },
    { key: "축산",      mark: "🥩", eyebrow: "MEAT",           accent: "#C0392B", fit: "cover" },
    { key: "가공식품",  mark: "🥫", eyebrow: "PROCESSED FOOD", accent: "#FF5B39", fit: "cover" },
    { key: "김치·반찬", mark: "🥬", eyebrow: "SIDE DISH",      accent: "#3BA559", fit: "cover" },
    { key: "농산물",    mark: "🌾", eyebrow: "FARM",           accent: "#A67C2E", fit: "cover" },
    { key: "과일",      mark: "🍎", eyebrow: "FRUIT",          accent: "#E0483D", fit: "cover" },
    { key: "생활용품",  mark: "🧴", eyebrow: "LIVING GOODS",   accent: "#6B5BD2", fit: "contain" },
    { key: "기타",      mark: "📦", eyebrow: "ETC",            accent: "#6B6760", fit: "cover" }
  ];
  /* 옛 카테고리 key → 새 분류. 상품분류 탭에서 못 찾은 상품만 이걸로 떨어진다. */
  var LEGACY_CAT = { fish: "수산", meal: "가공식품", living: "생활용품" };

  function presetFor(key) {
    for (var i = 0; i < CAT_PRESET.length; i++) if (CAT_PRESET[i].key === key) return CAT_PRESET[i];
    return { key: key, mark: "📦", eyebrow: "", accent: "#6B6760", fit: "cover" };
  }
  function makeCat(key, order) {
    var p = presetFor(key);
    return { id: "cat_" + key, key: key, name: key, mark: p.mark, eyebrow: p.eyebrow,
             descr: "", meta: "", accent: p.accent, fit: p.fit, show: true, sort_order: order };
  }
  var DEFAULT_CATS = CAT_PRESET.map(function (p, i) { return makeCat(p.key, (i + 1) * 10); });

  var CATS = DEFAULT_CATS.slice();
  var catMap = {};          // 공백제거 상품명 → 분류 ('상품분류' 탭)
  var recatCount = 0;       // 이번 로드에서 자동 재분류된 상품 수 (배너용)
  var items = [];          // 현재 버전의 상품
  var otherRows = [];      // 다른 버전의 상품 행(원본 그대로 보관 — 저장 때 같이 되쓴다)
  var dirty = false;
  var addingCat = null, newItem = null;
  var acResults = [], acTimer = null;
  var catalogCache = null, catalogLoading = false;
  var _delegated = false;
  var siteSettings = {};
  var settingsOpen = false, catsOpen = false;   // CSV 대량 가져오기는 2026-08-24 폐기 (홍팀장: "사실상 필요 없다")
  var expandedCats = {};
  var versions = [], currentVersion = null;
  var history = [], histOpen = false, histQ = "", histBusy = false;   // 📝 제안 이력
  var _refocus = null;      // 다시 그린 뒤 포커스를 돌려줄 input id
  var lastAddCat = "수산";  // [+ 상품 담기] 카테고리 셀렉트의 마지막 선택
  var _scrollTo = null;     // 다시 그린 뒤 화면 안으로 끌어올 패널의 id
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
  var NUMF = { supply_price: 1, ship_fee: 1, special_price: 1, cost: 1 };   // 숫자로 받아야 하는 칸

  /* [전체 저장]은 항상 누를 수 있다 (2026-08-24 홍팀장: "각각 저장이 뭐 소용이냐, 그냥 다 하고 전체 저장").
     저장이 곧 제안 이력 기록이라, 바꾸었든 아니든 누르고 싶을 때 눌 수 있어야 한다. */
  function setDirty(v) {
    dirty = v;
    if (v) scheduleDraft();   // 💾 고치는 즉시 임시저장 예약
    var st = document.getElementById("save-status"), bt = document.getElementById("btn-save");
    if (st) {
      st.textContent = v ? "저장 안 된 변경사항이 있습니다 — [전체 저장]을 눌러주세요"
                       : "고치고 나서 [전체 저장] — 그때의 제안 내용이 제안 이력에 남습니다";
      st.className = "status" + (v ? " dirty" : "");
    }
    if (bt) bt.disabled = false;
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

  /* ================= 💾 임시저장 (2026-08-24 홍팀장: "싹다 날아갔네 임시저장 만들어라") =================
     상품을 «담는» 것과 «지우는» 것은 즉시 시트에 쓰인다. 하지만 담은 뒤 카드에서 고친 값
     (공급가·특별제안가·설명 등)은 [전체 저장] 전까지 브라우저 메모리에만 있어서,
     새로고침·탭 닫기·제안서 전환 한 번에 통째로 날아갔다.
     → 고칠 때마다 localStorage 에 자동으로 받아두고, 다음에 열 때 복구할지 묻는다.
     ⚠️ 자동으로 시트에 써버리지 않는다 — 뭐를 되살릴지는 반드시 홍팀장이 고른다. */
  var DRAFT_KEY = "mas_proposal_draft_v1";
  var _draftTimer = null, draftFound = null;
  var baseSig = "";   // 마지막으로 시트에서 읽어온 상태의 서명 — 임시저장이 낡았는지 판단하는 기준
  function itemSig(list) {
    return (list || []).map(function (it) {
      return [it.category, it.name, it.warehouse, it.spec, num(it.supply_price), it.courier,
        num(it.ship_fee), it.tax, it.image, it.link, it.show === false ? 0 : 1,
        num(it.special_price), num(it.cost)].join("\u241F");
    }).join("\u241E");
  }
  function saveDraft() {
    if (!currentVersion || !loadedOK) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        slug: currentVersion.slug, name: currentVersion.name, base: baseSig,
        at: stampNow(), items: items, settings: siteSettings
      }));
    } catch (e) { /* 용량 초과 등은 조용히 무시 */ }
  }
  /* 한국시간 기준 «YYYY-MM-DD HH:mm» — toISOString 은 UTC라 9시간 어긋난 시각이 배너에 찍힌다 */
  function stampNow() {
    var d = new Date(), z = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()) + " " + z(d.getHours()) + ":" + z(d.getMinutes());
  }
  function scheduleDraft() { if (_draftTimer) clearTimeout(_draftTimer); _draftTimer = setTimeout(saveDraft, 600); }
  function clearDraft() { draftFound = null; try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} }
  function readDraft() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch (e) { return null; } }
  /* 시트에서 막 읽어온 상태와 다를 때만 «복구할까요» 를 띄운다 */
  function checkDraft() {
    draftFound = null;
    var d = readDraft();
    if (!d || !currentVersion || d.slug !== currentVersion.slug) return;
    if (itemSig(d.items) === itemSig(items)) { clearDraft(); return; }
    /* ⚠️ 임시저장을 만들 때의 시트 상태와 지금 시트가 다르면, 그 뒤에 시트가 바뀐 것이다.
       낡은 임시저장을 복구하면 «복구»가 아니라 «되돌리기»가 된다 — 묻지 말고 버린다.
       (2026-08-24 실제로 올 믿한 사고) */
    if (typeof d.base === "string" && d.base !== baseSig) { clearDraft(); return; }
    draftFound = d;
  }
  function draftBannerHTML() {
    if (!draftFound) return "";
    var when = String(draftFound.at || "").replace("T", " ").slice(0, 16);
    return '<div class="draft-bar">' +
      '<span class="db-ico">💾</span>' +
      '<span class="db-txt"><b>저장 안 된 작업이 남아 있습니다</b> — [' + esc(draftFound.name || draftFound.slug) + '] 상품 ' +
        (draftFound.items || []).length + '개, ' + esc(when) + ' 기준.' +
        '<br><span class="db-sub">복구하면 화면에만 올라옵니다 — 확인한 뒤 <b>[전체 저장]</b>을 눌러야 시트에 남습니다.</span></span>' +
      '<button class="btn-addsave" id="btn-draft-restore">↩ 복구하기</button>' +
      '<button class="btn-ghost2" id="btn-draft-drop">버리기</button>' +
    '</div>';
  }
  function restoreDraft() {
    if (!draftFound) return;
    items = (draftFound.items || []).map(function (it) { return Object.assign({}, it, { _key: uid() }); });
    if (draftFound.settings) siteSettings = Object.assign({}, draftFound.settings);
    draftFound = null;
    setDirty(true); renderEditor();
    toast("복구했어요 — 확인하고 [전체 저장]을 누르세요");
  }
  function dropDraft() {
    if (!confirm("저장 안 된 작업을 버립니다. 되돌릴 수 없습니다.\n계속할까요?")) return;
    clearDraft(); renderEditor(); toast("임시저장을 버렸습니다");
  }
  /* 저장 안 한 채 나가려고 할 때 붙잡는다 */
  window.addEventListener("beforeunload", function (e) {
    if (!dirty || !loadedOK) return;   // 깨끗한 상태면 아무것도 남기지 않는다
    saveDraft();
    e.preventDefault(); e.returnValue = "";
    return "";
  });

  /* 상품명 키 — 카탈로그/유통시트와 같은 규칙(공백 제거). 상품명은 완전일치만 믿는다. */
  function pkey(s) { return String(s == null ? "" : s).replace(/\s+/g, ""); }

  function loadAll() {
    return window.SVC.readTabs([T.versions, T.cats, T.products, T.catmap, T.history]).then(function (res) {
      /* --- 버전 --- */
      var vr = rowsToObjs(res[T.versions], ["id", "slug", "name", "sort_order", "settings"])
        .filter(function (v) { return (v.slug || "").trim(); });
      versions = vr.map(function (v) {
        var st = {};
        try { st = v.settings ? JSON.parse(v.settings) : {}; } catch (e) { st = {}; }
        return { id: v.id || uid(), slug: String(v.slug).trim(), name: v.name || v.slug, sort_order: num(v.sort_order), settings: st };
      }).sort(function (a, b) { return a.sort_order - b.sort_order; });
      /* 2026-08-24 홍팀장: "기본 제안서" 같은 상설 버전은 없다. 제안서 = 업체 하나에 보낸 제안 한 건.
         그래서 하나도 없으면 억지로 만들지 않고, 화면에서 "새 제안서부터 만드세요"로 안내한다. */
      currentVersion = (currentVersion && versions.filter(function (v) { return v.id === currentVersion.id; })[0]) || versions[0] || null;
      if (!currentVersion) { items = []; otherRows = []; siteSettings = {}; }

      /* --- 카테고리 = '상품분류' 탭에서 그대로 따온다 (제안서카테고리 탭은 결과를 받아 적기만 한다) --- */
      catMap = {};
      var seenCat = {};
      (res[T.catmap] || []).slice(1).forEach(function (r) {
        var n = pkey(r[0]), c = String(r[1] || "").trim();
        if (!n || !c) return;
        catMap[n] = c; seenCat[c] = 1;
      });
      // 프리셋 순서를 먼저 세우고, 분류표에만 있는 낯선 분류는 뒤에 붙인다.
      var keys = CAT_PRESET.map(function (p) { return p.key; });
      Object.keys(seenCat).forEach(function (c) { if (keys.indexOf(c) < 0) keys.push(c); });
      CATS = keys.map(function (k, i) { return makeCat(k, (i + 1) * 10); });

      /* --- 상품 (현재 버전 것만 편집, 나머지는 원본 행 그대로 보관) --- */
      var prow = (res[T.products] || []).slice(1).filter(function (r) { return (r[2] || "").trim(); });
      var curSlug = currentVersion ? currentVersion.slug : " ";   // 제안서가 하나도 없으면 전부 otherRows
      otherRows = prow.filter(function (r) { return String(r[0] || "").trim() !== curSlug; });
      /* 상품의 카테고리를 '상품분류' 기준으로 맞춘다.
         분류표에 있으면 그 값, 없으면 옛 key 매핑, 그것도 없으면 '기타'.
         이미 새 분류값을 쓰고 있으면 건드리지 않는다(사장님이 손으로 옮겨둔 걸 되돌리지 않기 위해). */
      recatCount = 0;
      var catKeys = CATS.map(function (c) { return c.key; });
      var recat = function (rawCat, name) {
        var cur = String(rawCat || "").trim();
        if (cur && catKeys.indexOf(cur) >= 0) return cur;              // 이미 정상 분류
        var hit = catMap[pkey(name)] || LEGACY_CAT[cur] || "기타";
        recatCount++;
        return hit;
      };
      items = prow.filter(function (r) { return String(r[0] || "").trim() === curSlug; })
        .map(function (r) {
          return {
            _key: uid(), category: recat(r[1], r[2]), name: r[2] || "", warehouse: r[3] || "",
            spec: r[4] || "", supply_price: num(r[5]), courier: r[6] || "", ship_fee: num(r[7]),
            tax: r[8] === "과세" ? "과세" : "면세", image: r[9] || "", link: r[10] || "",
            show: isShow(r[11]), sort_order: num(r[12]),
            special_price: num(r[13]),   // 비우면 0 = 공급가 그대로 노출
            cost: num(r[14])             // 관리자 전용 — 제안서엔 안 나감
          };
        }).sort(function (a, b) { return a.sort_order - b.sort_order; });

      /* --- 📝 제안 이력 --- */
      history = (res[T.history] || []).slice(1)
        .filter(function (r) { return (r[1] || "").trim() || (r[2] || "").trim(); })
        .map(function (r) {
          return { date: String(r[0] || "").trim(), client: String(r[1] || "").trim(), name: String(r[2] || "").trim(),
                   price: num(r[3]), warehouse: String(r[4] || "").trim(), memo: String(r[5] || "").trim(), id: String(r[6] || "") || uid() };
        })
        .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });

      /* 🔴 시트에 이미 같은 상품이 두 줄 들어 있으면 화면에도 두 개로 뜬다 —
         그걸 홍팀장이 손으로 하나씩 지우고 있었다(2026-08-24). 읽을 때 걸러서 알린다.
         ⚠️ 화면에서만 정리하고 시트는 [전체 저장] 때 정리된다(읽자마자 시트를 고치지 않는다). */
      var _seen = {}, _dupNames = [];
      items = items.filter(function (it) {
        var k = pkey(it.name || "");
        if (!k) return true;
        if (_seen[k]) { _dupNames.push(it.name); return false; }
        _seen[k] = 1; return true;
      });

      siteSettings = Object.assign({}, (currentVersion && currentVersion.settings) || {});
      loadedOK = true;
      baseSig = itemSig(items);
      if (_dupNames.length) {
        setDirty(true);
        setTimeout(function () {
          toast("같은 상품이 두 번 들어가 있었어요 — " + _dupNames.length + "개 정리했습니다(" + _dupNames.join(", ") + "). [전체 저장]을 누르면 시트에도 반영됩니다.");
        }, 700);
      }
      checkDraft();
      setTimeout(autoFillPhotos, 300);   // 📷 사진 빈 상품은 알아서 채운다   // 💾 저장 안 된 작업이 남아 있나
      /* 공개 사이트(app.js)가 읽는 제안서카테고리 탭을 분류표 결과로 맞춰 둔다 — 조용히, 실패해도 무시. */
      saveCatsSheet().catch(function () {});
      /* 옛 카테고리(fish/meal/living)로 남아 있던 상품은 시트에도 바로 새 분류로 적어 둔다.
         안 그러면 [전체 저장]을 누르기 전까지 제안서 화면에서 상품이 안 보인다. (읽기 성공 뒤에만 쓴다) */
      if (recatCount) {
        saveProducts()
          .then(function () { toast("분류 " + recatCount + "건을 카탈로그 기준으로 정리했어요"); })
          .catch(function () { /* 실패해도 화면은 정상 — 다음 저장 때 반영된다 */ });
      }
    });
  }

  function itemToRow(it, order) {
    return [currentVersion.slug, it.category, (it.name || "").trim(), (it.warehouse || "").trim(), (it.spec || "").trim(),
      num(it.supply_price), (it.courier || "").trim(), num(it.ship_fee), it.tax === "과세" ? "과세" : "면세",
      (it.image || "").trim(), (it.link || "").trim(), it.show === false ? "숨김" : "표시", order,
      num(it.special_price) || "", num(it.cost) || ""];
  }
  function saveProducts() {
    if (!loadedOK) return Promise.reject(new Error("아직 시트를 못 읽었습니다 — 새로고침 후 다시 시도하세요"));
    if (!currentVersion) return Promise.reject(new Error("먼저 [+ 새 제안서]로 업체를 만들어 주세요"));
    var ordered = [];
    CATS.forEach(function (c) { items.filter(function (i) { return i.category === c.key; }).forEach(function (i) { ordered.push(i); }); });
    items.forEach(function (i) { if (ordered.indexOf(i) < 0) ordered.push(i); });   // 없는 카테고리 소속도 유실 금지
    /* 🔴 같은 상품이 두 줄로 들어가는 것을 저장 직전에 막는다 (2026-08-24 홍팀장:
         "상품이 중복돼서 2개씩 저장됨 — 내가 하나씩 지웠다").
       한 제안서에 같은 상품을 두 번 넣을 일은 없다. 어디서 겹쳤는지와 상관없이
       여기서 한 번 걸러두면 홍팀장이 손으로 지우는 일은 다시 없다.
       ⚠️ 조용히 지우지 않는다 — 몇 개를 걸렀는지 반드시 알린다. */
    var seen = {}, dropped = [];
    ordered = ordered.filter(function (it) {
      var k = pkey(it.name || "");
      if (!k) return true;
      if (seen[k]) { dropped.push(it.name); return false; }
      seen[k] = 1; return true;
    });
    if (dropped.length) {
      items = items.filter(function (it) { return ordered.indexOf(it) >= 0; });
      toast("같은 상품이 두 번 들어가 있어 " + dropped.length + "개를 정리했어요: " + dropped.join(", "));
    }
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

  /* 원가를 넣어두면 실제로 파는 값(특별제안가 있으면 그것) 기준 마진을 관리자에만 보여준다 */
  function marginHintHTML(it) {
    var cost = num(it.cost), sell = num(it.special_price) || num(it.supply_price);
    // 원가가 없으면 "이 값으로 내보내도 되나"를 판단할 수가 없다 → 비었다는 걸 눈에 띄게
    if (!cost) return '<div class="margin-hint none">원가 없음 <span class="mh-note">위 [🧾 원가 가져오기]를 누르면 채워집니다</span></div>';
    if (!sell) return '';
    var gap = sell - cost, pct = Math.round(gap / sell * 100);
    // 무료배송이라 원가에 택배비를 얹은 경우엔 그걸 눈에 보이게 적는다
    var ship = costShipMap[(it.name || "").trim()] || 0;
    var note = ship
      ? '원가 ' + (cost - ship).toLocaleString() + '원 + 원가택배 ' + ship.toLocaleString() + '원(무료배송분) = ' + cost.toLocaleString() + '원 기준'
      : '원가 ' + cost.toLocaleString() + '원 기준';
    return '<div class="margin-hint' + (gap <= 0 ? ' bad' : '') + '">마진 ' + gap.toLocaleString() + '원 · ' + pct + '%' +
      '<span class="mh-note">' + note + ' · 이 줄은 관리자만 봅니다</span></div>';
  }

  /* ================= 상품 카드 ================= */
  function cardHTML(it) {
    var pv = imgUrl(it.image);
    var taxSel = function (v) { return '<option' + (it.tax === v ? ' selected' : '') + '>' + v + '</option>'; };
    var catOpts = CATS.map(function (c) { return '<option value="' + c.key + '"' + (it.category === c.key ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join("");
    return '<div class="card' + (it.show === false ? ' hidden-row' : '') + '" data-key="' + it._key + '">' +
      '<div class="thumb">' +
        '<div class="imgbox">' + (pv ? '<img src="' + esc(pv) + '" alt="">' : '<span style="font-size:12px;color:#9aa7ad;">사진 없음</span>') + '</div>' +
        '<div class="up">' +
          '<button class="btn-findpic" data-findpic="' + it._key + '" title="상품명이 똑같은 유통시트·마스터씨 게시물에서 사진·스펙·공급가·택배 정보를 가져옵니다">🔄 시트에서 채우기</button>' +
          // 파일 업로드는 드라이브 API가 막혀 있다 → 사진 주소를 직접 넣는 길을 열어둔다
          '<input class="in-img" data-f="image" value="' + esc(it.image || "") + '" placeholder="사진 주소 붙여넣기" title="masterc 사진 주소나 이미지 URL을 붙여넣으면 바로 반영됩니다">' +
        '</div>' +
      '</div>' +
      '<div class="fields">' +
        '<div class="row r1">' +
          '<div><span class="mini">카테고리</span><select data-f="category">' + catOpts + '</select></div>' +
          '<div><span class="mini">상품명</span><input data-f="name" value="' + esc(it.name) + '" placeholder="상품 이름"></div>' +
          // 창고(배지)는 2026-08-20 홍팀장 지시로 제안서에서 뺐다 → 입력칸도 없앴다
        '</div>' +
        '<div class="row r4">' +
          '<div><span class="mini">상품 스펙 (※ 줄 그대로 — [🔄 시트에서 채우기]로 자동 입력됩니다)</span>' +
            '<textarea data-f="spec" rows="4" placeholder="※ 구성 : …&#10;※ 중량/사이즈 : …&#10;※ 생물여부 : …">' + esc(it.spec) + '</textarea></div>' +
        '</div>' +
        '<div class="row r3">' +
          '<div><span class="mini">공급가(원)</span><input data-f="supply_price" type="number" inputmode="numeric" value="' + esc(it.supply_price) + '"></div>' +
          '<div><span class="mini special">특별 제안가(원) — 넣으면 공급가에 줄</span><input class="in-special" data-f="special_price" type="number" inputmode="numeric" value="' + (it.special_price ? esc(it.special_price) : "") + '" placeholder="비우면 공급가 그대로"></div>' +
          '<div><span class="mini cost">원가(원) — 제안서에 안 나감</span><input class="in-cost" data-f="cost" type="number" inputmode="numeric" value="' + (it.cost ? esc(it.cost) : "") + '" placeholder="미노출"></div>' +
          '<div><span class="mini">면과세</span><select data-f="tax">' + taxSel("면세") + taxSel("과세") + '</select></div>' +
        '</div>' +
        '<div class="row r2">' +
          '<div><span class="mini">택배사</span><input data-f="courier" value="' + esc(it.courier) + '" placeholder="예: 씨제이대한통운"></div>' +
          '<div><span class="mini">택배비(원)</span><input data-f="ship_fee" type="number" inputmode="numeric" value="' + esc(it.ship_fee) + '"></div>' +
        '</div>' +
        marginHintHTML(it) +
        '<div class="card-foot">' +
          '<label class="toggle"><input type="checkbox" data-f="show"' + (it.show !== false ? ' checked' : '') + '> 사이트에 표시</label>' +
          '<button class="btn-del" data-del="' + it._key + '">삭제</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  /* ================= 카테고리 패널 ================= */
  function catRowHTML(c) {
    return '<div class="cat-edit" data-catkey="' + esc(c.key) + '">' +
      '<div class="row" style="grid-template-columns:66px 1fr 1.4fr 74px;">' +
        '<div><span class="mini">아이콘(이모지)</span><input data-cf="mark" value="' + esc(c.mark) + '" maxlength="4" placeholder="🎁"></div>' +
        '<div><span class="mini">이름</span><input data-cf="name" value="' + esc(c.name) + '"></div>' +
        '<div><span class="mini">소개(카드 설명)</span><input data-cf="descr" value="' + esc(c.descr) + '"></div>' +
        '<div><span class="mini">색상</span><input data-cf="accent" type="color" value="' + esc(c.accent) + '"></div>' +
      '</div>' +
      '<div class="row" style="grid-template-columns:1fr 110px;">' +
        '<div><span class="mini">영문 라벨(작은 글씨)</span><input data-cf="eyebrow" value="' + esc(c.eyebrow) + '"></div>' +
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
  /* 카테고리 관리 패널은 폐기(2026-08-24) — 분류는 '상품분류' 탭이 정한다.
     대신 지금 분류가 어디서 오는지 한 줄로 알려 주고, 자동 재분류가 있었으면 그것도 알린다. */
  function catPanelHTML() {
    var n = Object.keys(catMap).length;
    return '<div class="sp-note" style="margin:0 0 10px;">🗂️ 카테고리는 <b>카탈로그의 상품분류</b>를 그대로 씁니다 (분류표 ' + n + '종 · ' +
      CATS.map(function (c) { return esc(c.name); }).join(" · ") + ').<br>' +
      '분류를 바꾸려면 <b>미디어 업데이터의 🏷️ 분류</b>에서 고치면 여기와 카탈로그가 같이 바뀝니다.' +
      (recatCount ? ' <b style="color:#e0483d;">이번에 ' + recatCount + '건이 자동으로 재분류됐습니다 — [전체 저장]을 눌러야 시트에 남습니다.</b>' : '') +
      '</div>';
  }

  /* ================= 📝 제안 이력 =================
     2026-08-24 홍팀장. 쓰는 목적 두 가지 —
       ① "내가 언제 이 업체에 얼마에 제안했더라?"
       ② "이 업체는 저 업체랑 비슷하게 제안하면 되겠다"
     그래서 기록은 «따로 누르는 버튼»이 아니라 [전체 저장]에 묻어간다.
     제안서 이름 = 업체명이므로, 저장할 때마다 그 업체·그 날짜의 제안 내용이 통째로 갱신된다.
     (같은 업체를 같은 날 여러 번 저장하면 마지막 것만 남고, 날짜가 바뀌면 새 줄로 쌓인다.) */
  function histPrice(it) { return num(it.special_price) || num(it.supply_price); }
  function histText(rows) {
    return (rows || []).map(function (h) {
      return h.date + " · " + h.client + " · " + h.name + " · " + (h.price ? h.price.toLocaleString() + "원" : "-") +
        (h.memo ? " · " + h.memo : "");
    }).join("\n");
  }
  function histFiltered() {
    var q = histQ.trim().toLowerCase();
    if (!q) return history;
    return history.filter(function (h) {
      return (h.client + " " + h.name + " " + h.date + " " + h.memo).toLowerCase().indexOf(q) > -1;
    });
  }
  function saveHistorySheet() {
    return window.SVC.writeTab(T.history, [window.SVC.HEADERS[T.history]].concat(
      history.map(function (h) { return [h.date, h.client, h.name, h.price || "", h.warehouse, h.memo, h.id]; })));
  }
  /* 업체 → 날짜 → 상품들 로 묶는다. "이 업체에 언제 뭘 얼마에 불렀나"를 한눈에 보기 위해. */
  function histGroups(rows) {
    var map = {}, order = [];
    (rows || []).forEach(function (h) {
      var k = h.client + " " + h.date;
      if (!map[k]) { map[k] = { client: h.client, date: h.date, memo: h.memo, list: [] }; order.push(k); }
      if (!map[k].memo && h.memo) map[k].memo = h.memo;
      map[k].list.push(h);
    });
    return order.map(function (k) { return map[k]; })
      .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)) || a.client.localeCompare(b.client); });
  }
  function histPanelHTML() {
    var clientCount = (function () { var s = {}; history.forEach(function (h) { s[h.client] = 1; }); return Object.keys(s).length; })();
    var head = '📝 제안 이력 — 업체 ' + clientCount + '곳 · ' + history.length + '줄';
    var groups = histGroups(histFiltered());
    var body =
      '<div class="sp-note" style="margin-bottom:10px;">📌 따로 기록할 것 없습니다 — <b>[전체 저장]</b>을 누르면 그때의 업체·날짜·상품·제안가가 자동으로 남습니다.<br>' +
        '제안가는 <b>특별제안가</b>가 있으면 그 값, 없으면 공급가입니다. 같은 업체를 같은 날 다시 저장하면 그 날 기록이 최신으로 갱신됩니다.</div>' +
      '<div class="row r2" style="align-items:end;">' +
        '<div><span class="mini">검색 (업체명·상품명)</span><input id="hist-q" value="' + esc(histQ) + '" placeholder="업체명이나 상품명" autocomplete="off"></div>' +
        '<div><span class="mini">&nbsp;</span><button class="btn-ghost2" id="btn-hist-copy">📋 보이는 것 전부 텍스트로 복사</button></div>' +
      '</div>';
    if (!groups.length) {
      body += '<div class="st-empty" style="margin-top:10px;">' +
        (history.length ? '검색 결과가 없습니다.' : '아직 기록된 제안이 없습니다 — 제안서를 만들고 [전체 저장]을 누르면 여기에 쌓입니다.') + '</div>';
    } else {
      body += '<div class="hist-groups">' + groups.slice(0, 60).map(function (g) {
        var sum = g.list.reduce(function (a, h) { return a + (h.price || 0); }, 0);
        return '<details class="hist-g">' +
          '<summary><span class="hgd">' + esc(g.date) + '</span><span class="hgc">' + esc(g.client) + '</span>' +
            '<span class="hgn">상품 ' + g.list.length + '개</span>' +
            '<span class="hgs">합계 ' + sum.toLocaleString() + '원</span>' +
            (g.memo ? '<span class="hgm">' + esc(g.memo) + '</span>' : '') +
            '<button class="btn-ghost2 hgb" data-histcopyone="' + esc(g.client) + ' ' + esc(g.date) + '">📋</button>' +
            '<button class="btn-ghost danger hgb" data-histdelgroup="' + esc(g.client) + ' ' + esc(g.date) + '" title="이 날짜 기록 삭제">🗑</button>' +
          '</summary>' +
          '<div class="hist-list">' + g.list.map(function (h) {
            return '<div class="hist-row">' +
              '<span class="hn">' + esc(h.name) + '</span>' +
              (h.warehouse ? '<span class="hm">' + esc(h.warehouse) + '</span>' : '') +
              '<span class="hp">' + (h.price ? h.price.toLocaleString() + '원' : '-') + '</span>' +
            '</div>';
          }).join("") + '</div>' +
        '</details>';
      }).join("") + '</div>' +
      (groups.length > 60 ? '<div class="sp-note">최근 60건만 보여줍니다 (전체 ' + groups.length + '건). 검색으로 좁혀 보세요.</div>' : '');
    }
    return '<details class="settings-panel" id="hist-details"' + (histOpen ? ' open' : '') + '>' +
      '<summary class="sp-head" id="hist-toggle"><span>' + head + '</span><span class="sp-caret"></span></summary>' +
      '<div class="sp-body">' + body + '</div></details>';
  }
  function todayStr() {
    var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  /* [전체 저장]에 묻어가는 자동 기록.
     제안서 이름 = 업체명. 같은 업체 · 같은 날짜 줄은 통째로 지우고 지금 내용으로 다시 넣는다.
     ⚠️ 이력 저장이 실패해도 상품 저장은 이미 끝난 상태다 — 여기서 예외를 밖으로 던지지 않는다. */
  function histRecordCurrent() {
    if (!currentVersion || !items.length) return Promise.resolve(0);
    var client = (currentVersion.name || "").trim();
    if (!client) return Promise.resolve(0);
    var date = todayStr();
    var fresh = items.map(function (it) {
      return { date: date, client: client, name: (it.name || "").trim(), price: histPrice(it),
               warehouse: (it.warehouse || "").trim(), memo: "", id: uid() };
    });
    var keep = history;
    history = fresh.concat(history.filter(function (h) { return !(h.client === client && h.date === date); }));
    return saveHistorySheet().then(function () { return fresh.length; })
      .catch(function (e) { history = keep; console.warn("제안 이력 저장 실패", e); return -1; });
  }
  function histDeleteGroup(token) {
    var i = token.lastIndexOf(" ");
    var client = token.slice(0, i), date = token.slice(i + 1);
    var hit = history.filter(function (h) { return h.client === client && h.date === date; });
    if (!hit.length) return;
    if (!confirm("[" + client + "] " + date + " 기록 " + hit.length + "줄을 지울까요?")) return;
    var keep = history;
    history = history.filter(function (h) { return !(h.client === client && h.date === date); });
    renderEditor();
    saveHistorySheet().then(function () { toast("삭제됨"); })
      .catch(function (e) { history = keep; renderEditor(); toast("삭제 실패: " + (e && e.message || e), true); });
  }
  function histCopyText(txt, n) {
    if (!txt) { toast("복사할 이력이 없습니다", true); return; }
    navigator.clipboard.writeText(txt).then(function () { toast("📋 " + n + "줄 복사됨"); })
      .catch(function () { toast("복사 실패 — 브라우저가 막았어요", true); });
  }
  function histCopy() { var r = histFiltered(); histCopyText(histText(r), r.length); }
  function histCopyOne(token) {
    var i = token.lastIndexOf(" ");
    var client = token.slice(0, i), date = token.slice(i + 1);
    var rows = history.filter(function (h) { return h.client === client && h.date === date; });
    histCopyText(histText(rows), rows.length);
  }
  function saveCategory(key, btn) {
    var c = catByKey(key); if (!c) return;
    if (!(c.name || "").trim()) { toast("카테고리 이름을 입력하세요", true); return; }
    if (btn) { btn.disabled = true; btn.textContent = "저장중…"; }
    saveCatsSheet().then(function () {
      if (btn) { btn.disabled = false; btn.textContent = "저장됨 ✓"; setTimeout(function () { if (btn) btn.textContent = "저장"; }, 1500); }
      renderEditor(); toast("카테고리 저장됨 ✅");
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
    // ⚠️ 카테고리는 전 버전 공용이다 — 지우면 다른 제안서에서도 그 상품들이 통째로 사라진다
    var msg = "[" + (c.name || key) + "] 카테고리를 삭제합니다.\n\n" +
      "⚠️ 카테고리는 모든 버전이 같이 씁니다. 지우면 이 버전뿐 아니라\n" +
      "   다른 제안서에서도 이 카테고리 상품이 통째로 안 보이게 됩니다.\n" +
      (cnt > 0 ? "   (지금 이 버전에만 상품 " + cnt + "개가 들어 있습니다. 상품 데이터 자체는 남습니다.)\n" : "") +
      "\n특정 거래처에게 일부만 보내려는 거라면 삭제가 아니라\n[+ 새 버전]/[⧉ 복제]로 그 버전에 담을 상품만 넣으세요.\n\n정말 삭제할까요?";
    if (!window.confirm(msg)) return;
    var keep = CATS.slice();
    CATS = CATS.filter(function (x) { return x.key !== key; });
    saveCatsSheet().then(function () { renderEditor(); toast("카테고리 삭제됨"); })
      .catch(function (err) { CATS = keep; toast("삭제 실패: " + (err.message || err), true); });
  }


  /* ================= 원가 가져오기 =================
     원가는 도구시트 '전체상품원가' 탭(E열)에서 가져온다 — 홍팀장이 그 표를 최신으로 유지한다
     (2026-08-20 지시: "여기 전체상품원가에 넣어줄테니 여기서 땡겨와").
     ⚠️ 상품명이 완전히 같을 때만 넣는다(§3-3). 원가는 제안서·PDF에 절대 안 나간다.
     그 표의 '등록일시' 최신값 = 원가표 기준일. 버튼 밑에 같이 보여줘 언제 자료인지 알 수 있게 한다. */
  var costOpen = false, costResult = null, costBase = "", costPulledAt = "";
  /* 원가표(전체상품원가) 자체를 마지막으로 갈아끼운 시각 — 원가업데이트 도구가 '설정' 탭에 남긴다.
     ⚠️ costBase(등록일시 최신값)와 다른 값이다. 아무 상품도 안 바뀐 날엔 등록일시가 안 올라가서
        "며칠 전 자료"처럼 보이기 때문에, 낡음 판정은 반드시 이 값으로 한다. (2026-08-24) */
  var costSheetAt = "";
  var COST_TOOL_URL = "../원가업데이트.html";
  var costMap = {};       // 상품명 → 실제 원가 (전체상품원가 탭, 필요하면 원가택배비 포함)
  var costShipMap = {};   // 그중 원가에 더해 넣은 배송비 (표시용)
  var COST_SHEET_URL = "https://docs.google.com/spreadsheets/d/" +
    ((CFG.dataSheet && CFG.dataSheet.id) || "") + "/edit?gid=1825062600#gid=1825062600";

  /* 원가표 → 상품명별 '실제 원가'
     ⚠️ 무료배송(공급가 택배비 0)으로 파는데 매입 쪽(원가 택배비)에 배송비가 붙어 있으면,
        그 배송비는 우리가 떠안는 것이라 원가에 더해야 진짜 마진이 나온다 (2026-08-20 홍팀장).
        공급가 택배비를 따로 받는 상품은 그 돈으로 배송비를 내므로 더하지 않는다.
        금액은 4,000 고정이 아니라 3,300 처럼 제각각이라 시트 값을 그대로 쓴다. */
  function readCostMap(rows) {
    var head = (rows[0] || []).map(function (x) { return String(x || "").replace(/\s+/g, ""); });
    var iCost = head.indexOf("원가"); if (iCost < 0) iCost = 4;
    var iCostShip = head.indexOf("원가택배비");
    var iSupShip = head.indexOf("공급가택배비");
    var iWhen = head.indexOf("등록일시");
    costMap = {}; costShipMap = {}; costBase = "";
    rows.slice(1).forEach(function (row) {
      var n = String(row[0] || "").trim(); if (!n || costMap[n]) return;
      var cost = num(row[iCost]);
      var supShip = iSupShip >= 0 ? num(row[iSupShip]) : 0;
      var costShip = iCostShip >= 0 ? num(row[iCostShip]) : 0;
      if (!supShip && costShip) { cost += costShip; costShipMap[n] = costShip; }
      costMap[n] = cost;
      var w = String((iWhen >= 0 ? row[iWhen] : "") || "").trim();
      if (w > costBase) costBase = w;
    });
    return costMap;
  }

  function costPanelHTML() {
    if (!costOpen) return '';
    /* 원가는 리모컨이 정본이다 — 홍팀장이 최신 원가를 '전체상품원가' 탭에 넣고,
       여기서 그 값을 제안서로 끌어온다. 그래서 시트를 바로 여는 버튼을 같이 둔다. */
    var head =
      '<div class="cost-top">' +
        '<div class="ct-when">' +
          '🧾 마지막 원가 업데이트 <b>' + (costPulledAt ? esc(costPulledAt) : "없음") + '</b>' +
          (costBase ? '<br><span class="ct-sub">원가표(전체상품원가) 기준일 <b>' + esc(costBase) + '</b></span>' : '') +
        '</div>' +
        '<div class="ct-btns">' +
          '<a class="btn-open" href="' + COST_TOOL_URL + '" target="_blank" rel="noopener">📥 원가 업데이트 ↗</a>' +
          '<a class="btn-open" href="' + esc(COST_SHEET_URL) + '" target="_blank" rel="noopener">📗 원가 시트 열기 ↗</a>' +
          '<button class="btn-addsave" id="btn-cost-pull">지금 원가 가져오기</button>' +
        '</div>' +
      '</div>' +
      '<div class="sp-note" style="margin:10px 0;">순서는 <b>①리모컨에서 [엑셀 내보내기] → ②<a href="' + COST_TOOL_URL + '" target="_blank" rel="noopener">📥 원가 업데이트</a>에 파일 끌어다 놓기 → ③여기서 [지금 원가 가져오기]</b>. ' +
      '(엑셀을 열어 복사·붙여넣기 하던 건 이제 안 해도 됩니다.)<br>상품을 새로 넣을 땐 <b>안 눌러도 됩니다</b> — 상품명을 고르면 원가가 같이 들어옵니다.</div>';

    var body;
    if (costResult === "loading") body = '<div class="st-empty">전체상품원가에서 가져오는 중…</div>';
    else if (!costResult) body = '';
    else if (costResult.err) body = '<div class="st-empty">원가표를 읽지 못했어요 — ' + esc(costResult.err) + '</div>';
    else {
      body = '<div class="sp-note">도구시트 <b>전체상품원가</b>(' + costResult.total.toLocaleString() + '건, 기준일 <b>' + esc(costResult.base || "-") + '</b>)에서 ' +
        '상품명이 <b>완전히 같은</b> 것만 가져왔습니다. 원가는 관리자 화면에서만 보이고 제안서·PDF에는 안 나갑니다.' +
        '<br>🚚 <b>무료배송으로 파는 상품</b>(공급가 택배비 0)인데 매입에 택배비가 붙어 있으면 그 금액을 <b>원가에 더해</b> 잡았습니다 — 그게 실제로 남는 돈입니다.' +
        (costResult.others ? '<br>다른 제안서 상품 <b>' + costResult.others + '건</b>도 같이 채웠습니다.' : '') + '</div>';
      if (costResult.rows.length) {
        body += '<table class="st-table"><thead><tr><th>상품명</th><th>원가</th><th>파는 값</th><th>마진</th></tr></thead><tbody>' +
          costResult.rows.map(function (r) {
            var pct = r.sell ? Math.round((r.sell - r.cost) / r.sell * 100) : 0;
            return '<tr><td class="st-ver">' + esc(r.name) + '</td>' +
              '<td class="st-num">' + r.cost.toLocaleString() +
                (r.ship ? '<span class="st-slug">택배 ' + r.ship.toLocaleString() + ' 포함</span>' : '') + '</td>' +
              '<td class="st-num">' + (r.sell ? r.sell.toLocaleString() : '-') + '</td>' +
              '<td class="st-num' + (r.sell && r.sell - r.cost <= 0 ? ' hot' : '') + '">' + (r.sell ? ((r.sell - r.cost).toLocaleString() + '원 · ' + pct + '%') : '-') + '</td></tr>';
          }).join("") + '</tbody></table>';
      } else {
        body += '<div class="st-empty">가져올 원가가 없었습니다.</div>';
      }
      if (costResult.miss.length) {
        body += '<div class="st-note">⚠️ 원가표에 <b>같은 이름이 없는 ' + costResult.miss.length + '개</b>는 비워뒀습니다: ' + esc(costResult.miss.join(" · ")) + '</div>';
      }
    }
    return '<div class="modal-back" id="cost-close-back"><div class="modal" role="dialog" aria-label="원가 업데이트">' +
      '<div class="modal-head"><span>🧾 원가 업데이트 (관리자 전용 · 제안서엔 안 나감)</span>' +
      '<span><button class="modal-x" id="btn-cost-close" aria-label="닫기">✕</button></span></div>' +
      '<div class="modal-body">' + head + body + '</div></div></div>';
  }

  function pullCosts() {
    costOpen = true; costResult = "loading"; renderEditor();
    window.SVC.readTab("전체상품원가").then(function (rows) {
      var map = readCostMap(rows), base = costBase;
      var got = [], miss = [];
      items.forEach(function (it) {
        var n = (it.name || "").trim(); if (!n) return;
        var c = map[n];
        if (!c) { miss.push(n); return; }
        it.cost = c;
        got.push({ name: n, cost: c, ship: costShipMap[n] || 0, sell: num(it.special_price) || num(it.supply_price) });
      });
      /* 원가는 상품의 성질이지 버전의 성질이 아니다 — 다른 버전 행도 같이 채운다.
         (안 그러면 버전을 바꿀 때마다 원가가 비어 보인다. 2026-08-20 홍팀장 지적) */
      var otherFilled = 0;
      otherRows = otherRows.map(function (r) {
        var x = r.slice();
        while (x.length < 15) x.push("");
        var n = String(x[2] || "").trim();
        if (n && map[n]) { x[14] = map[n]; otherFilled++; }
        return x;
      });
      costBase = base;
      return saveProducts().then(function () {
        costPulledAt = nowLabel();
        return saveCostStamp(base, costPulledAt);
      }).then(function () {
        costResult = { rows: got, miss: miss, base: base, total: rows.length - 1, others: otherFilled };
        dirty = false; renderEditor();
        toast(got.length + "개 상품에 원가를 넣었어요 ✅ (원가표 기준일 " + (base || "-") + ")");
      });
    }).catch(function (err) {
      costResult = { err: String(err && err.message || err), rows: [], miss: [], base: "", total: 0 };
      renderEditor();
    });
  }

  function nowLabel() {
    var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  /* 언제 가져왔는지는 도구시트 '설정' 탭에 남긴다 — 다른 PC에서 열어도 같은 값이 보이게 */
  function saveCostStamp(base, at) {
    return window.SVC.readTab("설정").then(function (rows) {
      var out = (rows || []).map(function (r) { return r.slice(); });
      var key = "제안서원가가져온시각", val = at + (base ? " (원가표 기준일 " + base + ")" : "");
      var i = -1;
      out.forEach(function (r, n) { if (String(r[0] || "").trim() === key) i = n; });
      if (i >= 0) out[i][1] = val; else out.push([key, val]);
      return window.SVC.writeTab("설정", out);
    }).catch(function () { /* 기록 실패는 무시 — 원가는 이미 들어갔다 */ });
  }
  function loadCostStamp() {
    return window.SVC.readTab("설정").then(function (rows) {
      (rows || []).forEach(function (r) {
        var k = String(r[0] || "").trim();
        if (k === "제안서원가가져온시각") {
          var v = String(r[1] || "");
          costPulledAt = v.split(" (")[0] || "";
          var m = v.match(/기준일\s*([\d.\-\/ ]+)/);
          costBase = m ? m[1].trim() : "";
        }
        if (k === "원가표반영시각") costSheetAt = String(r[1] || "").trim();
      });
    }).catch(function () {});
  }

  /* 원가표가 오늘 것인가 — 제안 단가가 옛 원가로 나가는 걸 막는 자리
     (2026-08-24 홍팀장: "제안서 보낼 때 원가 잘못 들어가서 제안 단가 잘못 가면 안 된다") */
  function costFreshness() {
    var m = costSheetAt.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return { known: false };
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    var t = new Date(); t.setHours(0, 0, 0, 0);
    var days = Math.round((t - d) / 86400000);
    return { known: true, days: days, when: costSheetAt, stale: days >= 1 };
  }
  function costLineHTML() {
    var f = costFreshness();
    if (!f.known) {
      return '<div class="costline" style="background:#fff4f4;color:#a02020;">🧾 원가표를 한 번도 갱신한 적이 없습니다 — ' +
        '<a href="' + COST_TOOL_URL + '" target="_blank" rel="noopener"><b>📥 원가 업데이트</b></a> 먼저 하고 제안하세요.</div>';
    }
    if (f.stale) {
      return '<div class="costline" style="background:#fff4f4;color:#a02020;">⚠️ 원가표가 <b>' + (f.days === 1 ? '어제' : f.days + '일 전') + '</b> 자료입니다 (' + esc(f.when) + ') — ' +
        '제안 단가 내보내기 전에 <a href="' + COST_TOOL_URL + '" target="_blank" rel="noopener"><b>📥 원가 업데이트</b></a>부터 하세요.' +
        (costPulledAt ? '<span class="cl-none"> · 이 제안서로 원가 가져온 건 ' + esc(costPulledAt) + '</span>' : '') + '</div>';
    }
    return '<div class="costline" style="background:#f0f9f3;color:#1d6b40;">✅ 원가표 <b>오늘</b> 갱신됨 (' + esc(f.when) + ')' +
      (costPulledAt ? '<span class="cl-none"> · 이 제안서로 원가 가져온 건 ' + esc(costPulledAt) + '</span>' : '') + '</div>';
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
      body = '<div class="st-empty">✅ 이 제안서 상품의 공급가는 유통시트와 모두 같습니다.</div>';
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
  /* 접혀 있어도 «명함을 넣었는지 뺐는지»가 헤더에 보이게 — 업체마다 매번 정해야 하는 값이라
     패널을 열어봐야 알 수 있으면 못 쓴다. (2026-08-24 홍팀장) */
  function spSummary() {
    var s = siteSettings || {};
    var on = function (v) { var t = String(v == null ? "" : v).trim().toLowerCase(); return t === "true" || t === "1" || t === "y" || t === "on" || t === "숨김"; };
    var bits = [];
    bits.push(on(s.hide_contact) ? "<b class=\"sp-off\">명함 뺌</b>" : "<b class=\"sp-on\">명함 넣음</b>");
    if (on(s.hide_price)) bits.push("<b class=\"sp-off\">공급가 숨김</b>");
    if (on(s.hide_callout)) bits.push("<b class=\"sp-off\">전체리스트 박스 뺌</b>");
    return " <span class=\"sp-sum\">· " + bits.join(" · ") + "</span>";
  }
  function settingsPanelHTML() {
    var s = settingsEffective();
    function ti(k, label, ph) { return '<div><span class="mini">' + label + '</span><input data-sf="' + k + '" value="' + esc(s[k]) + '" placeholder="' + (ph || "") + '"></div>'; }
    /* ⚠️ <details> 를 쓰는 이유 — 예전엔 헤더를 누르면 renderEditor() 가 화면을 통째로
       다시 그렸다. 그 바람에 로드 직후나 다른 비동기와 겹치면 클릭이 씨혀 «안 펼쳐져» 보였다
       (2026-08-24 홍팀장 두 번 지적). 이젠 브라우저 기본 토글이라 JS 재렌더와 무관하게 100% 열린다.
       div + settingsOpen 방식으로 되돌리지 말 것. */
    return '<details class="settings-panel" id="sp-details"' + (settingsOpen ? ' open' : '') + '>' +
      '<summary class="sp-head" id="sp-toggle"><span>📝 상단·회사 문구 편집</span>' + spSummary() + '<span class="sp-caret"></span></summary>' +
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
        '<div class="sp-sec">이 제안서에 넣을 것 / 뺄 것</div>' +
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
        '<div class="sp-foot"><span class="sp-note">저장하면 이 제안서 상단·문의에 바로 반영됩니다.</span><button class="btn-addsave" id="btn-save-settings">문구 저장</button></div>' +
      '</div></details>';
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
      toast("문구가 저장됐어요 ✅ 이 제안서에 반영됩니다");
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
        '<div class="up"><input class="in-img" data-nf="image" value="' + esc(it.image || "") + '" placeholder="사진 주소 붙여넣기"></div>' +
      '</div>' +
      '<div class="fields">' +
        '<div class="new-badge">＋ 새 상품 입력</div>' +
        '<div class="row r1">' +
          '<div><span class="mini">카테고리</span><select data-nf="category">' + catOpts + '</select></div>' +
          '<div class="ac-wrap"><span class="mini">상품명 <span class="ac-tip">타이핑하면 자동완성 ↓</span></span><input data-nf="name" value="' + esc(it.name) + '" placeholder="상품명 입력" autocomplete="off"><div class="ac-list" id="ac-list"></div></div>' +
        '</div>' +
        '<div class="row r4">' +
          '<div><span class="mini">상품 스펙 (자동완성에서 고르면 자동으로 들어옵니다)</span>' +
            '<textarea data-nf="spec" rows="4" placeholder="※ 구성 : …&#10;※ 중량/사이즈 : …">' + esc(it.spec) + '</textarea></div>' +
        '</div>' +
        '<div class="row r3">' +
          '<div><span class="mini">공급가(원)</span><input data-nf="supply_price" type="number" inputmode="numeric" value="' + esc(it.supply_price) + '"></div>' +
          '<div><span class="mini special">특별 제안가(원)</span><input class="in-special" data-nf="special_price" type="number" inputmode="numeric" value="' + (it.special_price ? esc(it.special_price) : "") + '" placeholder="비우면 공급가 그대로"></div>' +
          '<div><span class="mini cost">원가(원) — 미노출</span><input class="in-cost" data-nf="cost" type="number" inputmode="numeric" value="' + (it.cost ? esc(it.cost) : "") + '" placeholder="미노출"></div>' +
          '<div><span class="mini">면과세</span><select data-nf="tax">' + taxSel("면세") + taxSel("과세") + '</select></div>' +
        '</div>' +
        '<div class="row r2">' +
          '<div><span class="mini">택배사</span><input data-nf="courier" value="' + esc(it.courier) + '" placeholder="예: 씨제이대한통운"></div>' +
          '<div><span class="mini">택배비(원)</span><input data-nf="ship_fee" type="number" inputmode="numeric" value="' + esc(it.ship_fee) + '"></div>' +
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
    /* 제안서 = 업체 하나에 보낸 제안 한 건. 상설 "기본 제안서" 같은 건 없다. (2026-08-24 홍팀장) */
    var verCtrl = (versions.length
        ? '<select id="ver-select" class="ver-select" title="업체 고르기">' +
            /* 같은 업체명이 둘 이상이면 뒤에 상품 수를 붙여 구분한다 — 이름만으로는 어느 쪽인지 알 수 없다
               (2026-08-24 '후르츠온'이 두 개로 갈라져 상품이 7개/3개로 나뉜 건). */
            versions.map(function (v) {
              var same = versions.filter(function (x) { return (x.name || "").trim() === (v.name || "").trim(); }).length > 1;
              var cnt = same ? (v.id === (currentVersion || {}).id ? items.length
                                 : otherRows.filter(function (r) { return String(r[0] || "").trim() === v.slug; }).length) : 0;
              return '<option value="' + v.id + '"' + (currentVersion && v.id === currentVersion.id ? ' selected' : '') + '>'
                + esc(v.name) + (same ? ' (' + cnt + '개 · ' + esc(v.slug) + ')' : '') + '</option>';
            }).join("") +
          '</select>'
        : '<span class="ver-none">제안서 없음</span>') +
      '<button class="btn-ghost" id="btn-ver-new">+ 새 제안서</button>' +
      (currentVersion
        ? '<button class="btn-ghost" id="btn-ver-copy" title="이 업체에 보낸 제안을 그대로 복사해 다른 업체용으로 만듭니다">⧉ 이걸로 다른 업체</button>' +
          '<button class="btn-ghost" id="btn-ver-rename" title="업체명 바꾸기">✏ 업체명</button>' +
          // 🔗 링크 복사 폐기(2026-08-24 홍팀장) — 제안서는 웹으로 공유하지 않고 jpg/pdf 로만 보낸다.
          '<button class="btn-ghost danger" id="btn-ver-del" title="이 제안서와 담긴 상품 삭제">🗑 삭제</button>'
        : '');
    var pubHref = "index.html?nt=1" + (currentVersion ? ("&v=" + encodeURIComponent(currentVersion.slug)) : "");
    var html =
      '<div class="topbar"><span class="brand">🐟 상품 관리자</span>' + verCtrl +
      '<span class="spacer"></span>' +
      '<button class="btn-ghost" id="btn-price-check" title="제안서 공급가가 유통시트와 다른 것만 찾아 줍니다">💰 공급가 점검</button>' +
      '<button class="btn-ghost" id="btn-cost" title="원가 시트를 열어 최신 원가를 넣고, 제안서로 가져옵니다 (제안서엔 안 나갑니다)">🧾 원가 업데이트</button>' +
      '<a href="' + pubHref + '" target="_blank" rel="noopener" title="여기서 캡처하거나 인쇄(Ctrl+P)로 PDF 저장해서 보내세요">제안서 보기 ↗</a></div>' +
      // 원가표가 오늘 것인지 — 버튼 바로 밑에 항상 보이게 (2026-08-20 / 낡음 경고는 2026-08-24)
      costLineHTML() +
      '<div class="wrap">' + draftBannerHTML() +
      '<div class="hint">상품을 다 담고 고친 뒤 맨 아래 <b>[전체 저장]</b> 한 번이면 끝납니다. 삭제만 <b>[삭제]</b>로 즉시 처리돼요.<br>' +
        '저장하면 <b>그때의 제안 내용이 📝 제안 이력에 자동으로 남습니다.</b></div>' +
      catPanelHTML() + histPanelHTML() + settingsPanelHTML();

    if (!currentVersion) {
      html += '<div class="st-empty" style="padding:28px 2px;">아직 제안서가 없습니다 — 위 <b>[+ 새 제안서]</b>로 업체를 하나 만들어 시작하세요.<br>' +
        '<span class="sp-note">이미 비슷한 제안을 한 업체가 있으면, 그 업체를 고른 뒤 <b>[⧉ 이걸로 다른 업체]</b>가 빠릅니다.</span></div>';
      html += '</div><div class="savebar"><span class="status" id="save-status">제안서를 먼저 만들어 주세요</span>' +
        '<button class="btn-save" id="btn-save" disabled>전체 저장</button></div>' + pricePanelHTML() + costPanelHTML();
      root.innerHTML = html; setDirty(false); bindEditor(); return;
    }

    /* 담긴 상품이 있는 카테고리만 보여준다 — 빈 카테고리 8개를 처음부터 늘어놓지 않는다.
       (2026-08-24 홍팀장: "카테고리 설정하고 상품 가져올 때 가져오면 되지") */
    var used = CATS.filter(function (c) {
      return addingCat === c.key || items.some(function (i) { return i.category === c.key; });
    });
    var anyOpen = used.some(function (c) { return expandedCats[c.key]; });
    html += '<div class="prodlist-head"><span class="plh-title">담은 상품 <span class="plh-hint">' +
      (used.length ? '(카테고리 제목을 눌러 펼치기/접기)' : '(아래에서 카테고리를 고르고 상품을 담으세요)') + '</span></span>' +
      (used.length ? '<button class="btn-ghost2" id="btn-expand-all">' + (anyOpen ? '전체 접기 ▴' : '전체 펼치기 ▾') + '</button>' : '') + '</div>';

    used.forEach(function (c) {
      var list = items.filter(function (i) { return i.category === c.key; });
      var isOpen = !!expandedCats[c.key] || addingCat === c.key;
      html += '<div class="cat-block' + (c.show === false ? ' cat-hidden' : '') + '">';
      html += '<div class="cat-title cat-toggle-head" data-catview="' + esc(c.key) + '"><span class="tcaret">' + (isOpen ? '▾' : '▸') + '</span><span class="dot" style="background:' + c.accent + '"></span>' + esc(c.name) + ' <span class="count">' + list.length + '개</span>' + (c.show === false ? ' <span style="color:#e0483d;font-weight:800;">· 숨김</span>' : '') + '</div>';
      if (isOpen) {
        html += list.map(cardHTML).join("");
        if (addingCat === c.key) html += addFormHTML();
      }
      html += '</div>';
    });

    // 카테고리를 고르고 상품 하나 담기 — 목록 맨 아래 한 줄
    if (!addingCat) {
      html += '<div class="add-any">' +
        '<span class="mini" style="margin:0;">카테고리</span>' +
        '<select id="add-cat-pick">' + CATS.map(function (c) {
          return '<option value="' + esc(c.key) + '"' + (c.key === lastAddCat ? ' selected' : '') + '>' + esc(c.name) + '</option>';
        }).join("") + '</select>' +
        '<button class="btn-add" id="btn-add-any">+ 상품 담기</button>' +
        '<span class="sp-note" style="flex:1;">상품명을 치면 유통시트에서 찾아 공급가·사진·분류까지 같이 가져옵니다.</span>' +
      '</div>';
    }

    html += '</div><div class="savebar"><span class="status" id="save-status">고치고 나서 [전체 저장] — 그때의 제안 내용이 제안 이력에 남습니다</span>' +
      '<button class="btn-save" id="btn-save">전체 저장</button></div>' + pricePanelHTML() + costPanelHTML();
    /* ⚠️ 화면을 통째로 다시 그리기 때문에, 스크롤이 그대로면 «펼쳤는데 안 펼쳐진» 것처럼 보인다
       (2026-08-24 홍팀장: "문구 편집은 왜 안 펼쳐지냐" — 실제로는 열렸는데 화면이 딴 데를 보고 있었다).
       그래서 방금 펼친 패널을 화면 안으로 끌어온다. */
    var _keepTop = window.scrollY;
    root.innerHTML = html;
    setDirty(dirty);
    bindEditor();
    if (_scrollTo) {
      var _se = document.getElementById(_scrollTo);
      if (_se) {
        var _p = _se.closest(".settings-panel") || _se;
        _p.scrollIntoView({ block: "start", behavior: "auto" });
        window.scrollBy(0, -12);
      }
      _scrollTo = null;
    } else if (Math.abs(window.scrollY - _keepTop) > 2) {
      window.scrollTo(0, _keepTop);
    }
    // 화면을 통째로 다시 그리므로 타이핑 중이던 칸은 포커스를 되돌려 준다 (이력 검색칸 등)
    if (_refocus) {
      var _fe = document.getElementById(_refocus);
      if (_fe) { _fe.focus(); try { var _L = _fe.value.length; _fe.setSelectionRange(_L, _L); } catch (e) {} }
      _refocus = null;
    }
  }

  function bindEditor() {
    /* 🔴 이중 등록 방지는 «root 자체»에 표시해 둔다.
       플래그 변수(_delegated)만 믿으면 누가 그걸 false 로 풀었을 때 리스너가 하나 더 붙고,
       그때부터 클릭 한 번이 두 번 처리된다(2026-08-24 사고 — 펼치기 먹통·상품 2개 저장).
       root 는 페이지가 살아 있는 한 그대로이므로 여기 찍어두면 어떤 경로로도 두 번 안 붙는다. */
    if (_delegated || root.__masBound) return;
    _delegated = true;
    root.__masBound = true;

    root.addEventListener("toggle", function (e) {
      if (e.target.id === "sp-details") settingsOpen = e.target.open;
      else if (e.target.id === "hist-details") histOpen = e.target.open;
    }, true);

    root.addEventListener("focusin", function (e) { if (!(e.target.closest && e.target.closest(".ac-wrap"))) hideAc(); });

    root.addEventListener("input", function (e) {
      if (e.target.id === "hist-q") { histQ = e.target.value; _refocus = "hist-q"; renderEditor(); return; }
      var sf = e.target.getAttribute("data-sf");
      // 체크박스는 아래 change 핸들러가 처리한다(여기서 .value 를 읽으면 "on" 이 들어간다)
      if (sf) { if (e.target.type !== "checkbox") siteSettings[sf] = e.target.value; return; }
      var cf = e.target.getAttribute("data-cf");
      if (cf) { var cw = e.target.closest(".cat-edit"); var c = cw && catByKey(cw.getAttribute("data-catkey")); if (c) c[cf] = e.target.value; return; }
      var nf = e.target.getAttribute("data-nf");
      if (nf && newItem) {
        if (NUMF[nf]) newItem[nf] = num(e.target.value);
        else newItem[nf] = e.target.value;
        if (nf === "name") scheduleCatalog(e.target.value);
        return;
      }
      var f = e.target.getAttribute("data-f"); if (!f) return;
      var card = e.target.closest(".card"); if (!card) return;
      var it = findItem(card.getAttribute("data-key")); if (!it) return;
      if (NUMF[f]) it[f] = num(e.target.value);
      else it[f] = e.target.value;
      // 사진 주소를 붙여넣으면 옆 미리보기를 바로 갈아끼운다(재렌더하면 포커스가 날아간다)
      if (f === "image") {
        var box = card.querySelector(".imgbox"), url = imgUrl(it.image);
        if (box) box.innerHTML = url ? '<img src="' + esc(url) + '" alt="">' : '<span style="font-size:12px;color:#9aa7ad;">사진 없음</span>';
      }
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
      // ── 📝 제안 이력 ──
      if (e.target.id === "btn-hist-copy") { histCopy(); return; }
      var hcp = e.target.closest && e.target.closest("[data-histcopyone]");
      if (hcp) { e.preventDefault(); histCopyOne(hcp.getAttribute("data-histcopyone")); return; }
      var hdel = e.target.closest && e.target.closest("[data-histdelgroup]");
      if (hdel) { e.preventDefault(); histDeleteGroup(hdel.getAttribute("data-histdelgroup")); return; }
      if (e.target.id === "btn-draft-restore") { restoreDraft(); return; }
      if (e.target.id === "btn-draft-drop") { dropDraft(); return; }
      if (e.target.id === "btn-save") { saveAll(); return; }
      if (e.target.id === "btn-price-check") { runPriceCheck(); return; }
      if (e.target.id === "btn-price-apply") { applyPriceFixes(); return; }
      if (e.target.id === "btn-pc-close" || e.target.id === "pc-close-back") { priceOpen = false; renderEditor(); return; }
      if (e.target.id === "btn-cost") { costOpen = true; costResult = null; renderEditor(); return; }
      if (e.target.id === "btn-cost-pull") { pullCosts(); return; }
      if (e.target.id === "btn-cost-close" || e.target.id === "cost-close-back") { costOpen = false; renderEditor(); return; }
      if (e.target.id === "btn-save-settings") { saveSettings(e.target); return; }
      if (e.target.closest && e.target.closest("#cat-toggle")) { catsOpen = !catsOpen; renderEditor(); return; }
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
      if (e.target.id === "btn-add-any") {
        var pick = document.getElementById("add-cat-pick");
        var k = (pick && pick.value) || lastAddCat || (CATS[0] && CATS[0].key);
        lastAddCat = k;
        addingCat = k; expandedCats[k] = true;
        newItem = { _key: "NEW", category: k, name: "", warehouse: "", spec: "", supply_price: 0, courier: "", ship_fee: 4000, tax: "면세", image: "", link: "", show: true, special_price: 0, cost: 0 };
        renderEditor(); focusNewName(); return;
      }
      var addCat = e.target.getAttribute("data-add");
      if (addCat) {
        addingCat = addCat; expandedCats[addCat] = true;
        newItem = { _key: "NEW", category: addCat, name: "", warehouse: "", spec: "", supply_price: 0, courier: "", ship_fee: 4000, tax: "면세", image: "", link: "", show: true, special_price: 0, cost: 0 };
        renderEditor(); focusNewName(); return;
      }
      var acEl = e.target.closest && e.target.closest(".ac-item");
      if (acEl && newItem) {
        var r = acResults[parseInt(acEl.getAttribute("data-ac"), 10)];
        if (r) {
          newItem.name = r.name; newItem.warehouse = r.warehouse || ""; newItem.supply_price = r.supply_price || 0;
          newItem.ship_fee = r.ship_fee || 0; newItem.tax = r.tax || "면세";
          if (r.courier) newItem.courier = r.courier;
          if (r.cost) newItem.cost = r.cost;            // 원가도 같이 (관리자에서만 보임)
          // 사진·스펙·원본링크까지 같이 (상품이미지_v2 캐시에 있으면)
          if (r.image) newItem.image = r.image;
          if (r.link) newItem.link = r.link;
          if (r.spec) newItem.spec = r.spec;
          // 분류도 카탈로그 기준으로 자동 지정 — 상품명이 완전히 같을 때만 (2026-08-24)
          var auto = catMap[pkey(r.name)];
          if (auto) { newItem.category = auto; addingCat = auto; }
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
  /* 게시물 스펙(※ 줄들)을 그대로 쓴다 — 제안서 카드에 스펙 요약으로 펼쳐진다.
     ':' 없는 안내문("반드시 이 의미가…" 같은 것)은 스펙이 아니라 페이지 문구라 버린다. */
  function cleanSpec(s) {
    // 캐시에 따라 '※'가 붙어 있기도, 줄바꿈으로만 나뉘어 있기도 하다 — 둘 다로 자른다
    return String(s || "").split(/\r?\n|※/)
      .map(function (x) { return x.replace(/^\s*※\s*/, "").trim(); })
      .filter(function (x) { return x && x.indexOf(":") > 0; })
      .map(function (x) { return "※ " + x; })
      .join("\n");
  }
  function loadCatalog() {
    if (catalogCache || catalogLoading) return;
    catalogLoading = true;
    Promise.all([window.SVC.readYutong(), window.SVC.readTab("상품이미지_v2"), window.SVC.readTab("전체상품원가")]).then(function (r) {
      var yu = r[0] || [], imgRows = r[1] || [], costRows = r[2] || [];

      // 사진 캐시: 상품명 → {사진, 설명, 링크}
      var pic = {};
      imgRows.slice(1).forEach(function (row) {
        var n = String(row[0] || "").trim(); if (!n) return;
        pic[n] = { image: String(row[2] || "").trim(), spec: cleanSpec(row[3]), link: String(row[5] || "").trim() };
      });

      /* 원가도 같이 실어둔다 — 상품 하나 넣을 때마다 [원가 업데이트]를 누르게 하면 안 된다
         (2026-08-20 홍팀장). 자동완성으로 고르거나 [시트에서 채우기]를 누르면 원가가 따라온다. */
      readCostMap(costRows);

      var byName = {};
      yu.forEach(function (p) {
        if (byName[p.name]) return;                     // 같은 상품이 여러 탭에 있으면 먼저 것
        var m = pic[p.name] || {};
        byName[p.name] = {
          name: p.name, supply_price: p.supply_price, tax: p.tax, ship_fee: p.ship_fee,
          courier: p.courier, warehouse: p.warehouse, cost: costMap[p.name] || 0,
          image: m.image || "", spec: m.spec || "", link: m.link || ""
        };
      });
      // 지금 안 파는(유통시트에 없는) 상품도 사진·링크는 붙도록 후보에 남긴다
      Object.keys(pic).forEach(function (n) {
        if (byName[n]) return;
        byName[n] = { name: n, supply_price: 0, tax: "면세", ship_fee: 0, courier: "", warehouse: "", cost: costMap[n] || 0, image: pic[n].image, spec: pic[n].spec, link: pic[n].link };
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

  /* 📷 사진은 «기본 동작»으로 알아서 가져온다 (2026-08-24 홍팀장:
     "PDF에 상품 사진이 없으면 이걸 만든 의미가 없잖아 — 그냥 디폴트가 사진 빌려오는 걸로").
     제안서를 열 때 사진 빈 상품이 있으면 유통시트·상품이미지_v2 에서 찾아 채우고 바로 저장한다.
     ⚠️ 상품명이 완전히 같을 때만 붙인다(§3-3). 이미 사진이 있는 상품은 절대 건들지 않는다. */
  var _photoTried = false;
  function autoFillPhotos() {
    if (_photoTried || !loadedOK || !currentVersion) return;
    var need = items.filter(function (it) { return !String(it.image || "").trim(); });
    if (!need.length) return;
    _photoTried = true;
    loadCatalog();
    var tries = 0;
    var timer = setInterval(function () {
      if (!catalogCache) { if (++tries > 75) clearInterval(timer); return; }   // 최대 30초
      clearInterval(timer);
      var map = {};
      catalogCache.forEach(function (r) { map[pkey(r.name)] = r; });
      var got = 0;
      need.forEach(function (it) {
        var hit = map[pkey(it.name)];
        if (!hit || !hit.image) return;
        it.image = hit.image; got++;
        if (hit.spec && !String(it.spec || "").trim()) it.spec = hit.spec;
        if (hit.link && !String(it.link || "").trim()) it.link = hit.link;
      });
      if (!got) { renderEditor(); return; }
      saveProducts().then(function () {
        baseSig = itemSig(items); renderEditor();
        toast("📷 사진 " + got + "개를 자동으로 채웠어요");
      }).catch(function () { setDirty(true); renderEditor(); });
    }, 400);
  }
  /* 기존 상품의 사진·링크를 캐시에서 찾아 채운다.
     ⚠️ 상품명이 완전히 같을 때만 붙인다 — 비슷한 이름에 엉뚱한 사진이 붙으면
        거래처가 그걸 보고 주문한다(CLAUDE.md §3-3 절대규칙). */
  function fillPhoto(key, btn) {
    var it = findItem(key); if (!it) return;
    var reset = function () { if (btn) { btn.disabled = false; btn.textContent = "🔄 시트에서 채우기"; } };
    var go = function () {
      var hit = (catalogCache || []).filter(function (r) { return r.name === (it.name || "").trim(); })[0];
      if (!hit) {
        toast("'" + (it.name || "") + "' 이름을 유통시트·게시물에서 못 찾았어요 — 이름이 완전히 같아야 붙습니다", true);
        reset(); return;
      }
      var got = [];
      if (hit.image) { it.image = hit.image; got.push("사진"); }
      if (hit.spec) { it.spec = hit.spec; got.push("스펙"); }
      if (hit.link) { it.link = hit.link; }
      if (hit.supply_price) { it.supply_price = hit.supply_price; got.push("공급가"); }
      if (hit.courier) { it.courier = hit.courier; got.push("택배사"); }
      if (hit.ship_fee || hit.ship_fee === 0) { it.ship_fee = hit.ship_fee; }
      if (hit.tax) { it.tax = hit.tax; }
      if (hit.cost) { it.cost = hit.cost; got.push("원가"); }
      setDirty(true); renderEditor();
      toast((got.length ? got.join("·") + " 채웠어요" : "가져올 값이 없었어요") + " — [저장]을 눌러야 사이트에 반영됩니다");
    };
    if (btn) { btn.disabled = true; btn.textContent = "가져오는 중…"; }
    if (catalogCache) return go();
    loadCatalog();
    var tries = 0;
    var wait = setInterval(function () {
      if (catalogCache) { clearInterval(wait); go(); }
      else if (++tries > 60) { clearInterval(wait); reset(); toast("상품 목록을 불러오지 못했어요", true); }
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
    // 자동완성을 안 쓰고 손으로 치고 담아도 사진은 붙여 준다 (상품명 완전일치일 때만)
    if (!String(newItem.image || "").trim() && catalogCache) {
      var _hit = catalogCache.filter(function (r) { return pkey(r.name) === pkey(newItem.name); })[0];
      if (_hit && _hit.image) {
        newItem.image = _hit.image;
        if (_hit.spec && !String(newItem.spec || "").trim()) newItem.spec = _hit.spec;
        if (_hit.link && !String(newItem.link || "").trim()) newItem.link = _hit.link;
      }
    }
    /* 🔴 담기는 화면에만 한다 — 여기서 시트에 쓰지 않는다
         (2026-08-24 홍팀장: "전체 저장 누르면 그냥 한 번에 저장되게 하라고 했잖아").
       예전엔 여기서 곧바로 saveProducts() 를 불렀다. 저장 경로가 둘이면
       ①어디까지 저장됐는지 사람이 알 수 없고 ②담자마자 공개 사이트로 나가고
       ③제안 이력은 [전체 저장]에만 남아 시트와 기록이 어긋난다.
       → 저장하는 곳은 [전체 저장] 한 곳뿐이다. */
    var it = Object.assign({}, newItem, { _key: uid() });
    items.push(it);
    addingCat = null; newItem = null;
    setDirty(true); renderEditor();
    toast("담았어요 — 맨 아래 [전체 저장]을 눌러야 시트에 남습니다");
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
    saveProducts().then(histRecordCurrent).then(function (n) {
      dirty = false; baseSig = itemSig(items); clearDraft(); renderEditor();
      toast(n > 0 ? ("저장 완료 ✅ · 📝 [" + currentVersion.name + "] " + todayStr() + " 제안 " + n + "건 기록됨")
                  : (n < 0 ? "저장 완료 ✅ (제안 이력 기록만 실패 — 다시 저장해 보세요)" : "저장 완료 ✅"));
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
    _photoTried = false;
    root.innerHTML = '<div class="loading">' + (msg || "불러오는 중…") + '</div>';
    /* 🔴 여기서 _delegated 를 false 로 풀면 안 된다 (2026-08-24 홍팀장:
         "또 이거 안 펴지는 건 뭔데?" / "상품이 중복돼서 2개씩 저장됨").
       클릭·입력 핸들러는 root 에 «위임»으로 붙어 있고, root 는 innerHTML 을 갈아도
       그대로 살아 있다. 그런데 여기서 풀어버리면 다음 renderEditor 의 bindEditor() 가
       **같은 root 에 리스너를 하나 더** 붙인다 → 한 번 누르면 핸들러가 두 번 돈다.
         · 카테고리 펼치기: true 로 켰다가 곧바로 false → 영영 안 펼쳐진다
         · 상품 담기: items.push 가 두 번 → 상품이 2개로 저장된다
       최초 로드는 멀쩡하고 **제안서를 한 번 바꾼 뒤부터** 증상이 나서 찾기 어려웠다. */
    return loadAll().then(function () { dirty = false; renderEditor(); });
  }
  function switchVersion(id) {
    if (currentVersion && id === currentVersion.id) return;
    if (dirty && !window.confirm("저장 안 된 상품 변경사항이 있습니다.\n버전을 바꾸면 사라집니다. 계속할까요?")) { renderEditor(); return; }
    var v = versions.filter(function (x) { return x.id === id; })[0]; if (!v) return;
    currentVersion = v; addingCat = null; newItem = null; dirty = false; expandedCats = {};
    reloadInto("버전 불러오는 중…").catch(function (err) { toast("불러오기 실패: " + (err.message || err), true); });
  }
  /* 업체명만 바꾼다. 내부 주소(slug)는 시트에서 상품과 제안서를 잇는 열쇠일 뿐이라 손대지 않는다
     — 웹으로 공유하지 않으므로 사람이 볼 일이 없다. (2026-08-24 홍팀장) */
  function renameVersion() {
    if (!currentVersion) return;
    var name = window.prompt("업체명 바꾸기\n\n※ 제안 이력에도 이 이름으로 남습니다.", currentVersion.name); if (name === null) return;
    name = (name || "").trim(); if (!name || name === currentVersion.name) return;
    currentVersion.name = name;
    saveVersionsSheet()
      .then(function () { renderEditor(); toast("업체명을 '" + name + "'(으)로 바꿨어요"); })
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
    /* 🔴 같은 업체명으로 제안서가 조용히 두 개 생기는 걸 막는다 (2026-08-24).
       실제로 '후르츠온'이 v2·v2-2 두 개로 갈라져 상품이 7개/3개로 나뉘어 있었다.
       한글 업체명은 slug 가 v2·v3 처럼 뜻 없는 번호라, 목록에서 이름만 보면 둘을 구분할 수 없다.
       → 만들기 전에 되묻는다. 지점이 정말 따로면 이름을 다르게 적게 한다. */
    var dupV = versions.filter(function (v) { return (v.name || "").trim() === name; })[0];
    if (dupV && !window.confirm("이미 [" + name + "] 제안서가 있습니다.\n\n같은 이름으로 하나 더 만들면 목록에서 둘을 구분할 수 없고,\n상품이 두 곳으로 갈라집니다.\n\n· 기존 것을 고치려면 → [취소] 후 목록에서 그 제안서를 고르세요\n· 지점이 정말 따로면 → 이름을 다르게 적어주세요\n\n그래도 하나 더 만들까요?")) return;
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
    var name = window.prompt("어느 업체에 제안하나요? (업체명)\n\n빈 제안서로 시작합니다. 제안 이력도 이 이름으로 남습니다.\n예: 호호야채");
    if (name === null || !name.trim()) return;
    createVersion(name, null);
  }
  function duplicateVersion() {
    if (!currentVersion) { toast("복사할 제안서가 없습니다", true); return; }
    if (dirty && !window.confirm("저장 안 된 변경사항은 복사본에 반영되지 않습니다.\n계속할까요?")) return;
    var name = window.prompt("[" + currentVersion.name + "] 에 보낸 제안을 그대로 복사합니다.\n상품 " + items.length + "개와 문구가 같이 넘어갑니다.\n\n새 업체명을 입력하세요.", "");
    if (name === null || !name.trim()) return;
    createVersion(name, currentVersion);
  }
  function deleteVersion() {
    if (!currentVersion) return;
    var v = currentVersion, cnt = items.length;
    if (!window.confirm("[" + v.name + "] 제안서를 삭제합니다.\n\n· 담긴 상품 " + cnt + "개가 함께 삭제됩니다\n· 📝 제안 이력은 그대로 남습니다\n· 되돌릴 수 없습니다\n\n계속할까요?")) return;
    var typed = window.prompt("확인을 위해 업체명을 그대로 입력하세요:\n" + v.name);
    if (typed === null) return;
    if (typed.trim() !== v.name.trim()) { toast("이름이 일치하지 않아 취소했습니다", true); return; }
    versions = versions.filter(function (x) { return x.id !== v.id; });
    items = [];                                  // 이 제안서 상품은 저장 시 사라진다
    saveProducts().then(saveVersionsSheet).then(function () {
      currentVersion = versions[0] || null; addingCat = null; newItem = null; expandedCats = {}; dirty = false;
      return reloadInto("삭제 중…");
    }).then(function () { toast("'" + v.name + "' 제안서를 삭제했어요"); })
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
    .then(loadCostStamp)
    .then(function () {
      dirty = false; renderEditor();
    })
    .catch(function (err) {
      root.innerHTML = '<div class="center-wrap"><div class="panel"><h1>불러오지 못했습니다</h1>' +
        '<p class="sub">' + esc(err.message || err) + '</p>' +
        '<p class="sub">잠시 후 새로고침해 주세요. 계속되면 하비서에게 알려주세요.</p></div></div>';
    });
})();
