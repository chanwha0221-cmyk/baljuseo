/* ══════════════════════════════════════════════════════════════════
   🧾 발주 (카탈로그 부착) — 1단계: 화면 · 검증 · 우리 양식 변환까지
   ──────────────────────────────────────────────────────────────────
   왜 만드나 (사장님 2026-08-20):
     지금까지는 업체가 발주 게시판에 자유롭게 적어 보내면 우리가 고쳐서 발주했다.
     그 과정에서 "저쪽이 요청한 게 아닌데 다르게 해석"되는 일이 생겼고, 되묻는 왕복이 붙었다.
     → 앞으로는 **우리 양식에 완벽히 맞을 때까지 업체가 고쳐서 내는** 구조로 간다.
        틀린 발주는 아예 제출이 안 된다. 편리함은 부수효과고, 목적은 해석의 여지를 없애는 것.

   설계 원칙 (건드리기 전에 읽을 것):
     1. 🔴 상품명은 추측해서 붙이지 않는다. 공백 제거·소문자 후 **완전일치**만 통과.
        비슷한 건 후보로 보여주되 **자동 선택 금지** — 업체가 직접 고르기 전엔 그 행은 계속 빨간색.
        후보엔 **단가와 사진**을 같이 띄운다. 이름만 보여주면 "이건가보다" 하고 그냥 누른다(사장님).
     2. 창고명은 나가는 칸에선 **빈칸**이다(리모컨에서 확인 — 사장님 2026-08-20).
        ⚠️ 그래도 칸 자체는 남긴다. 칸을 빼면 뒤 컬럼이 전부 한 칸씩 밀린다(청년수산 10칸 사고).
        내부적으로는 창고를 계속 쓴다 — 합포장은 같은 창고끼리만 되고, 마감시간도 창고별이라서.
     3. 9칸/10칸 판정: 업체명 칸이 **공란이면 9칸**, 적혀 있으면 **10칸**.
        10칸 순서 = [정산업체명(로그인 계정)] [송장업체명(업체가 적은 것)] … (사장님 2026-08-20 정정)
        예) 마우셀(사업자·정산) / 청년수산(그 채널명·송장).
     4. 합포장 병합은 **주소가 확실히 같을 때만**. 애매하면 합치지 않고 화면에 알린다.
        잘못 합치는 것이 안 합치는 것보다 나쁘다.
     5. 이 파일은 화면·검증·변환까지만 한다. **시트에 쓰지 않는다**(업체정보 저장 제외).
        발주 제출·내역 조회는 2단계에서 Apps Script 웹앱이 맡는다 — 정적 페이지에 열쇠를 둔 채
        남의 발주를 다루면 안 되기 때문(발주엔 받는분 성함·주소·연락처가 들어간다).

   이 파일이 쓰는 카탈로그 전역: ALL, MEDIA, HAP, LINKS, ME, DOGU_ID, ACC_TAB,
                                 pkey, esc, won, toast, subHead, thumbUrl, getAccessToken
   ══════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

const NS = window.ORDER_NS || '';           // localStorage 접두어 (테스트본 = 'TEST_')
const DK = NS + 'order_draft_v1';
const TEL_HELP = '010-2455-4156 홍찬화 팀장 · 010-2326-5911 박원비 팀장';

// 웹앱(Apps Script)이 붙어 있는지 — 발주 제출·내역은 웹앱이 있어야 열린다.
// api·API는 catalog 쪽에 선언돼 있다(같은 문서의 다른 script 태그라 그대로 보인다).
const hasApi = () => { try{ return !!API && !!(ME && ME.token); }catch(e){ return false; } };

const FIELDS = ['biz','name','qty','rcv','addr','tel','msg'];
const HEADS  = ['업체명','상품명','수량','받는분 성함','받는분 주소','받는분 연락처','배송메시지'];

let ROWS = [];        // {biz,name,qty,rcv,addr,tel,msg}
let OPEN = -1;        // 후보 목록을 펼친 행 index

/* 👥 대신 발주 (마스터 전용, 홍팀장 2026-08-21)
   "아직도 카톡이나 엑셀 파일로 발주 주는 업체들이 있다. 파일 바로 넣어서 발주하고,
    우리가 바로 확인하니 당일로 넘기기가 바로 되면 된다."
   → 마스터 화면에선 **어느 업체 발주인지 먼저 고르고** 나머지는 업체용 화면과 똑같이 쓴다.
   🔴 업체를 고르는 이유: 정산업체명·주문처 주소·연락처가 그 업체 것으로 박혀야 한다.
      안 고르면 마스터 계정 이름이 그대로 발주서에 나간다(그래서 예전엔 이 화면을 막아뒀다). */
const FK = NS + 'order_for_v1';
let FOR = null;                 // {id,name,addr,phone} — 지금 대신 넣어주는 업체
let CLIENTS = null;             // 계정 시트 업체 목록 (마스터만 받아온다)
const amMaster = () => !!(typeof ME !== 'undefined' && ME && ME.master);
function loadFor(){ try{ const j = JSON.parse(localStorage.getItem(FK) || 'null'); if(j && j.name) FOR = j; }catch(e){} }
function saveFor(){ try{ FOR ? localStorage.setItem(FK, JSON.stringify(FOR)) : localStorage.removeItem(FK); }catch(e){} }

// ── 작은 도구들 ──────────────────────────────────────────────────
const S = v => String(v == null ? '' : v).trim();
const D = v => S(v).replace(/[^0-9]/g, '');
function blank(){ return {biz:'',name:'',qty:'',rcv:'',addr:'',tel:'',msg:''}; }
function loadDraft(){
  try{ const j = JSON.parse(localStorage.getItem(DK) || '[]'); if(Array.isArray(j)&&j.length) return j.map(r=>Object.assign(blank(), r)); }catch(e){}
  return [];
}
function saveDraft(){ try{ localStorage.setItem(DK, JSON.stringify(ROWS)); }catch(e){} }

/* 연락처는 우리가 하이픈을 넣어 정리해서 발주서에 넣는다 (사장님 2026-08-20).
   발주서 변환기(vendor/index.html)의 formatPhone과 같은 규칙.
   ⚠️ 정리할 수 없는 번호는 null을 돌려준다 — 그런 번호는 업체가 고쳐야 하므로 그 행을 막는다.
   0504 안심번호(12자리)는 하이픈이 빠지면 발주가 통째로 새는 사고가 있었어서 반드시 포함. */
function fmtTel(raw){
  let n = D(raw);
  if(!n) return null;
  /* 🔢 앞자리 0 살리기 — 엑셀이 하이픈 없는 번호를 **숫자로 먹어서** 앞의 0을 떨어뜨린다.
     `01058468751` → `1058468751` 로 들어오는 일이 실제로 흔하다(사장님 2026-08-20).
     0으로 시작하지 않는 9~11자리는 0이 떨어진 것으로 보고 되붙인다.
     ⚠️ 8자리 대표번호(1588-1588 등)는 원래 0이 없으므로 건드리지 않는다. */
  if(n[0] !== '0' && n.length >= 9 && n.length <= 11) n = '0' + n;
  if(n.length === 12 && n.slice(0,3) === '050') return n.slice(0,4) + '-' + n.slice(4,8) + '-' + n.slice(8);
  if(n.length === 11 && n[0] === '0') return n.slice(0,3) + '-' + n.slice(3,7) + '-' + n.slice(7);
  if(n.length === 10 && n.slice(0,2) === '02') return n.slice(0,2) + '-' + n.slice(2,6) + '-' + n.slice(6);
  // 🔴 010은 반드시 11자리다. 10자리 010은 한 자리 빠진 오타이므로 통과시키지 않는다
  //    (통과시키면 010-245-5415 같은 그럴듯한 번호가 되어 그대로 발주로 나간다).
  if(n.length === 10 && n.slice(0,3) === '010') return null;
  if(n.length === 10 && n[0] === '0') return n.slice(0,3) + '-' + n.slice(3,6) + '-' + n.slice(6);
  if(n.length === 9 && n.slice(0,2) === '02') return n.slice(0,2) + '-' + n.slice(2,5) + '-' + n.slice(5);
  if(n.length === 8 && n[0] === '1') return n.slice(0,4) + '-' + n.slice(4);
  return null;
}

// 주소 비교용 열쇠 — 공백·쉼표·하이픈만 지운다.
// ⚠️ '동/호/번지'까지 지우면 서로 다른 집을 같은 집으로 볼 수 있다. 합포장을 잘못 묶는 것이
//    안 묶는 것보다 나쁘므로, 여기선 일부러 보수적으로만 정규화한다.
const addrKey = s => S(s).replace(/[\s,\-()]/g, '');

// ── 상품 찾기 (완전일치만) ───────────────────────────────────────
let PIDX = null, WHS = null;
function prodIndex(){
  if(PIDX) return PIDX;
  PIDX = new Map();
  (typeof ALL !== 'undefined' ? ALL : []).forEach(p => { const k = pkey(p.name); if(!PIDX.has(k)) PIDX.set(k, p); });
  WHS = Array.from(new Set((typeof ALL !== 'undefined' ? ALL : []).map(p => p.effWh || p.group).filter(Boolean)));
  return PIDX;
}
/* 창고명 접두어만 예외로 떼어낸다 — 업체가 "인천 갈치 1kg"처럼 창고를 앞에 붙여 적는 일이 잦다.
   그 밖의 "비슷한 이름"은 절대 자동으로 붙이지 않는다. */
function stripWh(raw){
  const t = S(raw).replace(/^[\[(]([^\])]{1,10})[\])]\s*/, '$1 ');
  for(const w of (WHS||[])){
    if(t.length > w.length && t.slice(0, w.length) === w) return t.slice(w.length).trim();
  }
  return null;
}
function findProd(raw){
  const idx = prodIndex();
  const t = S(raw);
  if(!t) return {p:null, cands:[]};
  let p = idx.get(pkey(t));
  if(p) return {p, cands:[]};
  const s = stripWh(t);
  if(s){ p = idx.get(pkey(s)); if(p) return {p, cands:[]}; }
  return {p:null, cands:candidates(t)};
}
/* 후보: 참고용일 뿐이다. 점수로 자동 선택하지 않는다. */
function candidates(raw){
  const t = pkey(raw);
  if(t.length < 2) return [];
  const toks = S(raw).split(/[\s,/]+/).filter(x => x.length >= 2).map(x => pkey(x));
  const out = [];
  (typeof ALL !== 'undefined' ? ALL : []).forEach(p => {
    const k = pkey(p.name);
    let sc = 0;
    if(k.indexOf(t) >= 0 || t.indexOf(k) >= 0) sc += 6;
    toks.forEach(tk => { if(k.indexOf(tk) >= 0) sc += 2; });
    // 앞 두 글자가 같으면 같은 계열일 확률이 높다(갈치/갈치살…)
    if(t.length >= 2 && k.slice(0, 2) === t.slice(0, 2)) sc += 1;
    if(sc > 0) out.push({p, sc});
  });
  return out.sort((a, b) => b.sc - a.sc || a.p.name.length - b.p.name.length).slice(0, 5).map(x => x.p);
}
function whOf(p){ return p ? (p.effWh || p.srcWh || p.group || '') : ''; }
function hapLimit(name){ try{ return (typeof HAP !== 'undefined' && HAP) ? (HAP[pkey(name)] || 0) : 0; }catch(e){ return 0; } }
function priceText(p){
  const c = p && p.price ? p.price.cur : null;
  if(c == null) return '';
  const tx = (p.tax && p.tax.indexOf('과세') >= 0 && p.tax.indexOf('면') < 0) ? '과세' : (p.tax ? '면세' : '');
  return won(c) + '원' + (tx ? ' · ' + tx : '');
}
function imgOf(p){
  try{
    const m = MEDIA['n:' + pkey(p.name)] || (p.url ? (MEDIA[(p.url.match(/(\d{5,})/) || [])[1]] || null) : null);
    return (m && m.img) ? thumbUrl(m.img) : '';
  }catch(e){ return ''; }
}
// 발주마감 — "연장마감 : 16시", "16시" 같은 표기에서 시(時)만 뽑는다
function cutHour(p){
  const m = S(p && p.cut).match(/(\d{1,2})\s*시/);
  return m ? parseInt(m[1], 10) : null;
}
function isLate(p){
  const h = cutHour(p);
  if(h == null) return false;
  const now = new Date();
  return (now.getHours() > h) || (now.getHours() === h && now.getMinutes() > 0);
}

// ── 행 검증 ─────────────────────────────────────────────────────
/* 통과 못한 행이 하나라도 있으면 발주 버튼이 잠긴다. 이게 이 도구의 핵심이다. */
function checkRow(r){
  const errs = [], warns = [];
  const res = findProd(r.name);
  const p = res.p;
  if(!S(r.name)) errs.push('상품명을 넣어주세요.');
  else if(!p) errs.push('카탈로그에 없는 상품명입니다. 아래에서 정확한 상품을 골라주세요.');

  const q = parseInt(D(r.qty), 10);
  if(!S(r.qty)) errs.push('수량을 넣어주세요.');
  else if(!(q > 0)) errs.push('수량은 1 이상 숫자로 넣어주세요.');

  if(!S(r.rcv)) errs.push('받는분 성함을 넣어주세요.');

  /* 업체명 칸에 **자기 업체명**을 적는 경우 (2026-08-24 에버몰).
     그 칸은 "송장에 다른 이름이 나가야 할 때만" 쓰는 칸이라, 자기 이름을 적으면
     같은 업체 발주가 어떤 건 9칸 어떤 건 10칸으로 갈린다. 알려주고 비운다. */
  if(S(r.biz) && ME && pkey(r.biz) === pkey(ME.name)){
    warns.push('ℹ️ 업체명 칸은 비워두셔도 됩니다 — ' + S(ME.name) + ' 으로 나갑니다.');
  }

  const ad = S(r.addr);
  if(!ad) errs.push('받는분 주소를 넣어주세요.');
  else if(ad.length < 10 || !/\d/.test(ad)) errs.push('주소가 너무 짧습니다. 건물·동·호수까지 넣어주세요.');

  const tel = D(r.tel), telFix = fmtTel(r.tel);
  if(!tel) errs.push('받는분 연락처를 넣어주세요.');
  else if(!telFix) errs.push('연락처를 다시 확인해 주세요 (' + tel.length + '자리). 010-0000-0000 처럼 넣어주시면 됩니다.');
  else if(telFix !== S(r.tel)){
    // 앞자리 0이 빠진 채로 들어온 건은 왜 바뀌었는지 분명히 말해준다 (엑셀이 숫자로 먹은 경우)
    warns.push(tel[0] !== '0'
      ? '☎ 앞자리 0이 빠져 있어 ' + telFix + ' 로 고쳤습니다. 맞는지 확인해 주세요.'
      : '☎ 연락처는 ' + telFix + ' 로 정리해서 넣습니다.');
  }

  if(p){
    if(isLate(p)) warns.push('⏰ ' + (whOf(p) || '이 창고') + ' 마감(' + S(p.cut) + ')이 지났습니다 — 내일 출고됩니다.');
    const lim = hapLimit(p.name);
    if(lim && q > lim) warns.push('📦 합포장 한도 ' + lim + '개를 넘습니다(' + q + '개) — 박스가 나뉩니다.');
  }
  return {p, errs, warns, cands: res.cands, qty: (q > 0 ? q : 0)};
}

// ── 우리 양식으로 변환 ───────────────────────────────────────────
/* 주소·성함·연락처·송장업체명·창고가 모두 같으면 한 줄로 합친다(합포장).
   9칸과 10칸은 컬럼 수가 달라 섞어서 붙여넣으면 시트가 밀린다 → 블록을 나눠서 낸다. */
function buildOut(){
  // 대신 발주(마스터)면 발주서에 박히는 주문처는 **고른 업체**다 — 마스터 계정이 아니라.
  const me = amMaster() ? (FOR || {name:'', addr:'', phone:''})
                        : ((typeof ME !== 'undefined' && ME) ? ME : {name:'', addr:'', phone:''});
  const groups = new Map();
  const notes = [];
  ROWS.forEach((r, i) => {
    const c = checkRow(r);
    if(c.errs.length || !c.p) return;
    const wh = whOf(c.p);
    const key = [S(r.biz), S(r.rcv), addrKey(r.addr), D(r.tel), wh].join('');
    if(!groups.has(key)) groups.set(key, {biz:S(r.biz), rcv:S(r.rcv), addr:S(r.addr), tel:S(r.tel), msg:'', wh, items:[]});
    const g = groups.get(key);
    g.items.push({name:c.p.name, qty:c.qty, lim:hapLimit(c.p.name)});
    if(S(r.msg) && !g.msg) g.msg = S(r.msg);
    else if(S(r.msg) && g.msg && g.msg !== S(r.msg)) notes.push((i+1) + '번 행: 같은 배송지에 배송메시지가 둘이라 첫 번째 것만 넣었습니다.');
  });

  // 합포장 후보인데 주소 표기만 달라 못 합친 경우를 잡아 알려준다(업체가 표기를 통일하게)
  const seen = new Map();
  groups.forEach(g => {
    const soft = (S(g.rcv) + '|' + D(g.tel) + '|' + g.wh);
    if(!seen.has(soft)) seen.set(soft, []);
    seen.get(soft).push(g.addr);
  });
  seen.forEach((list, k) => {
    if(list.length > 1) notes.push('같은 분(' + k.split('|')[0] + ')께 가는 건이 주소 표기가 서로 달라 합포장으로 묶지 않았습니다: ' + list.join(' / '));
  });

  const nine = [], ten = [], warn = [];
  groups.forEach(g => {
    const prod = g.items.map(it => it.name + ' x ' + it.qty).join(' / ');
    g.items.forEach(it => { if(it.lim && it.qty > it.lim) warn.push(it.name + ' ' + it.qty + '개 (합포장 한도 ' + it.lim + ') — 박스 분리 확인 필요'); });
    const tel = fmtTel(g.tel) || g.tel;                     // 받는분 연락처는 하이픈 넣어 정리
    const myTel = fmtTel(me.phone) || S(me.phone);          // 주문처 연락처도 같은 규칙
    // 자기 업체명을 적은 건 10칸으로 치지 않는다 — 같은 업체 발주가 날마다 갈리는 원인 (2026-08-24)
    const biz = (S(g.biz) && pkey(g.biz) === pkey(me.name)) ? '' : S(g.biz);
    if(biz) ten.push([me.name || '', biz, me.addr || '', myTel, '', prod, g.rcv, g.addr, tel, g.msg]);
    else    nine.push([me.name || '', me.addr || '', myTel, '', prod, g.rcv, g.addr, tel, g.msg]);
  });
  return {nine, ten, notes, warn};
}
const tsv = rows => rows.map(r => r.join('\t')).join('\n');

// ── 화면 ────────────────────────────────────────────────────────
function css(){
  if(document.getElementById('ordcss')) return;
  const s = document.createElement('style');
  s.id = 'ordcss';
  s.textContent = `
.ordwrap{margin-top:12px}
.ordbar{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0}
.ordb2{border:1.5px solid var(--line);background:var(--card);color:var(--ink);padding:8px 14px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}
.ordb2:hover{border-color:var(--accent);color:var(--accent-d)}
.ordb2.pri{background:var(--accent);border-color:var(--accent);color:#fff}
.ordb2.pri:disabled{background:var(--chip);border-color:var(--line);color:var(--muted);cursor:not-allowed}
.ordbox{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:13px 15px;box-shadow:var(--shadow);margin-bottom:12px}
.ordbox h3{font-size:13px;font-weight:800;margin-bottom:8px;letter-spacing:-.3px}
.ordbox .hint{font-size:11.5px;color:var(--muted);line-height:1.6}
.ordtip{margin:8px 0;padding:9px 12px;border-radius:10px;background:var(--chip);border:1px solid var(--line);font-size:12.5px;font-weight:700;line-height:1.55;color:var(--ink)}
.ordtip span{display:block;margin-top:3px;font-size:11.5px;font-weight:600;color:var(--muted);line-height:1.6}
.ordtip span b{color:var(--ink)}
.ordtip.big{font-size:15px;font-weight:800;letter-spacing:-.3px;background:var(--soft);border:2px solid var(--accent);color:var(--accent-d);padding:12px 14px}
.ordtip.big span{font-size:12.5px;color:var(--accent-d);font-weight:600;opacity:.9}
.ordtip.big span b{color:var(--accent-d)}
@media(prefers-color-scheme:dark){.ordtip.big{color:var(--accent)}.ordtip.big span,.ordtip.big span b{color:var(--accent)}}
.ordme{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:13px}
.ordme b{font-weight:800}
.ordme .k{color:var(--muted);font-size:11.5px;display:block}
.ordin{border:1.5px solid var(--line);border-radius:9px;padding:8px 10px;font-size:13px;background:var(--card);color:var(--ink);outline:none;font-family:inherit;width:100%}
/* 🔎 대신 발주 — 업체 쳐서 찾기 목록 (드롭다운은 업체가 200곳 넘으면 못 고른다) */
.forlist{display:none;position:absolute;left:0;right:0;top:100%;z-index:30;margin-top:4px;background:var(--card);
  border:1.5px solid var(--line);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.14);max-height:290px;overflow:auto}
.foritem{padding:9px 11px;font-size:13px;cursor:pointer;border-bottom:1px solid var(--line);line-height:1.45}
.foritem:last-child{border-bottom:none}
.foritem:hover{background:var(--soft)}
.foritem b{font-weight:800;display:block}
.foritem span{color:var(--muted);font-size:11.5px}
.foritem.none{cursor:default;color:var(--muted)}
.foritem.none:hover{background:none}
.foritem.none b{color:var(--up)}
.foritem span{display:block}
.ftag{font-size:10px;font-weight:800;padding:1px 6px;border-radius:20px;margin-left:6px;vertical-align:middle}
.ftag.on{background:var(--soft);color:var(--accent-d)}
.ftag.off{background:color-mix(in srgb,var(--gold) 16%,transparent);color:var(--gold)}
.fno{color:var(--up);font-weight:700}
@media(prefers-color-scheme:dark){.ftag.on{color:var(--accent)}}
.ordin:focus{border-color:var(--accent)}
.ordtblwrap{overflow-x:auto;border:1px solid var(--line);border-radius:var(--radius);background:var(--card);box-shadow:var(--shadow)}
table.ordtbl{border-collapse:collapse;width:100%;min-width:920px;font-size:12.5px}
table.ordtbl th{background:var(--chip);color:var(--muted);font-size:11px;font-weight:800;padding:7px 8px;text-align:left;border-bottom:1px solid var(--line);white-space:nowrap}
table.ordtbl td{border-bottom:1px solid var(--line2);padding:5px 6px;vertical-align:top}
table.ordtbl tr.bad td{background:color-mix(in srgb,var(--up) 7%,transparent)}
table.ordtbl input{width:100%;border:1.5px solid transparent;border-radius:7px;padding:6px 7px;font-size:12.5px;background:transparent;color:var(--ink);outline:none;font-family:inherit}
table.ordtbl input:focus{border-color:var(--accent);background:var(--card)}
table.ordtbl tr.bad input{border-color:color-mix(in srgb,var(--up) 35%,transparent)}
.ordnum{color:var(--muted);font-size:11px;padding-top:12px !important;text-align:center;width:30px}
.orddel{border:none;background:none;color:var(--muted);cursor:pointer;font-size:14px;padding:6px}
.orddel:hover{color:var(--up)}
.orderr{font-size:11.5px;color:var(--up);font-weight:700;line-height:1.6;padding:2px 8px 8px}
.ordwarn{font-size:11.5px;color:var(--gold);font-weight:700;line-height:1.6;padding:2px 8px 8px}
/* 📂 파일 끌어다 놓는 자리 */
.ordcvdrop{border:1.5px dashed var(--line);border-radius:10px;padding:12px;text-align:center;font-size:12px;color:var(--muted);margin-bottom:8px;transition:.15s}
.ordcvdrop.on{border-color:var(--accent);color:var(--accent-d);background:rgba(45,140,85,.07)}
/* 🔄 업체 양식 변환 결과 — 변환기의 원문 대조 바를 그대로 옮겨 담는다(누락 감지가 여기 뜬다) */
.ordrecon{font-size:12px;line-height:1.7;margin-top:8px;padding:9px 11px;border-radius:9px;border:1px solid var(--line);background:var(--card)}
.ordrecon.ok{border-color:#a9d5bb;background:rgba(45,140,85,.08)}
.ordrecon.bad{border-color:#e8b4b4;background:rgba(200,40,40,.08)}
.ordrecon b{font-weight:800}
.ordrecon .recon-list{margin-top:6px;font-size:11.5px;line-height:1.75;word-break:break-all}
.ordrecon .recon-note,.ordrecon .recon-warn{margin-top:5px;font-size:11.5px}
.ordrecon .recon-warn{color:#c62828;font-weight:700}
.ordcand{padding:4px 8px 10px;display:flex;gap:7px;flex-wrap:wrap}
.ordcd{display:flex;gap:8px;align-items:center;border:1.5px solid var(--line);border-radius:10px;padding:6px 10px 6px 6px;background:var(--card);cursor:pointer;font-family:inherit;text-align:left;max-width:290px}
.ordcd:hover{border-color:var(--accent)}
.ordcd img{width:40px;height:40px;border-radius:7px;object-fit:cover;background:var(--chip);flex:none}
.ordcd .nm{font-size:12.5px;font-weight:700;line-height:1.3;letter-spacing:-.3px}
.ordcd .pz{font-size:11.5px;color:var(--accent-d);font-weight:800;margin-top:2px}
.ordcd .wh{font-size:10.5px;color:var(--muted)}
.ordask{font-size:11.5px;color:var(--muted);padding:0 8px 9px;line-height:1.6}
.ordout{width:100%;min-height:90px;border:1.5px solid var(--line);border-radius:10px;padding:10px 12px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;background:var(--bg);color:var(--ink);white-space:pre;overflow-x:auto}
.ordnote{font-size:12px;color:var(--gold);font-weight:700;line-height:1.7}
.ordsum{font-size:12.5px;color:var(--muted);margin:8px 0 4px}
.ordsum b{color:var(--ink)}
.ordbad{color:var(--up)}
.ordbox.srch{padding:11px 13px}
.ordb2.fbtn{padding:5px 13px;font-size:12px;border-radius:20px}
.ordb2.fbtn.on{background:var(--accent);border-color:var(--accent);color:#fff}
.opager{display:flex;gap:5px;justify-content:center;align-items:center;flex-wrap:wrap;margin:14px 0 4px}
.opager .ordb2{padding:6px 11px;font-size:12px}
.opager .ordb2.pg.on{background:var(--accent);border-color:var(--accent);color:#fff}
.opager .ordb2:disabled{opacity:.4;cursor:default}
.odots{color:var(--muted);font-size:12px;padding:0 2px}
.ordbox.cfg{border-style:dashed}
.cfgst{font-size:11.5px;font-weight:700;margin-left:8px;vertical-align:middle}
.cfgst.ok{color:var(--accent-d)}
.cfgst.bad{color:var(--up)}
@media(prefers-color-scheme:dark){.cfgst.ok{color:var(--accent)}}
/* 발주 내역 카드 — 보낸 건은 초록, 취소는 흐리게. 한눈에 구분돼야 중복 발주가 안 난다. */
.ordcard{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:13px 15px;box-shadow:var(--shadow);margin-bottom:12px}
.ordcard.sent{border:2px solid var(--accent);background:color-mix(in srgb,var(--soft) 55%,var(--card))}
.ordcard.dead{opacity:.55}
.ordhd{display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:9px}
.ordhd .ono{font-size:15px;font-weight:800;letter-spacing:-.3px;font-family:ui-monospace,Menlo,Consolas,monospace}
.ordhd .ometa{font-size:11.5px;color:var(--muted)}
.ordhd .ometa b{color:var(--ink)}
table.olist{min-width:640px}
table.olist td{font-size:12.5px;vertical-align:middle;padding:7px 8px}
table.olist td.pd{font-weight:700}
table.olist td.ad{max-width:280px;white-space:normal;line-height:1.4}
table.olist td.tl{font-family:ui-monospace,Menlo,Consolas,monospace;white-space:nowrap}
table.olist th.ck,table.olist td.ck{width:34px;text-align:center;padding-left:4px;padding-right:4px}
table.olist input[type=checkbox]{width:16px;height:16px;accent-color:var(--accent);cursor:pointer}
table.olist tr.xrow td{text-decoration:line-through;color:var(--muted)}
table.olist tr.erow td{background:color-mix(in srgb,var(--gold) 8%,transparent)}
table.olist input.ein{padding:6px 8px;font-size:12.5px;min-width:120px}
.qline{display:block;white-space:nowrap;line-height:2}
.qline b{color:var(--muted);font-weight:600;margin:0 1px}
input.qin{width:58px;padding:4px 6px;font-size:12.5px;text-align:center;display:inline-block}
table.olist td.ad input.ein{min-width:230px}
.lock{font-size:12px;opacity:.6}
.ordb2.done{background:var(--soft);border-color:var(--accent);color:var(--accent-d);font-weight:800;opacity:1;cursor:default}
.ordb2.warn{color:var(--up);border-color:color-mix(in srgb,var(--up) 35%,transparent)}
.ordb2.warn:hover{background:color-mix(in srgb,var(--up) 10%,transparent);color:var(--up)}
.ordst{font-size:11px;font-weight:800;padding:2px 8px;border-radius:20px;vertical-align:middle;margin-left:4px}
.ordst.new{background:var(--soft);color:var(--accent-d)}
.ordst.go{background:color-mix(in srgb,var(--gold) 16%,transparent);color:var(--gold)}
.ordst.no{background:color-mix(in srgb,var(--up) 12%,transparent);color:var(--up)}
.ordpaste{width:100%;min-height:120px;border:1.5px solid var(--line);border-radius:10px;padding:10px 12px;font-size:13px;background:var(--card);color:var(--ink);font-family:inherit;outline:none}
.ordpaste:focus{border-color:var(--accent)}
.ordb{margin-top:6px;width:100%;border:1.5px solid var(--accent);background:var(--soft);color:var(--accent-d);padding:6px 0;border-radius:9px;font-size:12px;font-weight:800;cursor:pointer;font-family:inherit}
.ordb:hover{background:var(--accent);color:#fff}
/* 🔔 새 발주 알림 — 오른쪽 아래 팝업 + 내역 카드 NEW 표시 (홍팀장 2026-08-24) */
.ordpop{position:fixed;right:16px;bottom:24px;z-index:120;background:var(--card);border:2px solid var(--accent);border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,.28);padding:13px 34px 12px 15px;max-width:330px;cursor:pointer;animation:ordpopin .25s;font-family:inherit}
@keyframes ordpopin{from{transform:translateY(14px);opacity:0}to{transform:none;opacity:1}}
.ordpop .opt{font-size:14px;font-weight:800;letter-spacing:-.3px;color:var(--ink)}
.ordpop .opl{font-size:12px;color:var(--muted);margin-top:5px;line-height:1.65}
.ordpop .opl b{color:var(--ink)}
.ordpop .oph{font-size:11px;color:var(--accent-d);font-weight:700;margin-top:7px}
@media(prefers-color-scheme:dark){.ordpop .oph{color:var(--accent)}}
.ordpop .opx{position:absolute;top:3px;right:5px;border:none;background:none;color:var(--muted);font-size:14px;cursor:pointer;padding:5px}
.onewb{font-size:10px;font-weight:800;color:#fff;background:var(--up);padding:2px 7px;border-radius:20px;margin-left:6px;vertical-align:middle}
/* 👀 누가 확인했나 (사장님 2026-08-25 — 찬화·원비 둘 다 눌러야 알림이 꺼진다) */
.ordst.wait{background:color-mix(in srgb,var(--up) 12%,transparent);color:var(--up)}
.ackline{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:9px;padding-top:9px;border-top:1px dashed var(--line);font-size:11.5px}
.ackline .ackok{color:var(--muted);font-weight:700}
.ackline .ackok b{color:var(--accent-d);font-weight:700}
.ackline .ackno{color:var(--up);font-weight:800}
.ordb2.ackb{margin-left:auto;border-color:var(--accent);color:var(--accent-d);font-weight:800}
.ordb2.ackb:hover{background:var(--accent);color:#fff}
`;
  document.head.appendChild(s);
}

let EDIT = false;   // 주문처 정보 수정 중인가
function meCard(){
  const me = (typeof ME !== 'undefined' && ME) ? ME : null;
  if(!me) return '';
  // 출고지(주문처 주소)는 안 쓰는 업체가 있다 → 연락처만 필수 (사장님 2026-08-20)
  const need = EDIT || !S(me.phone);
  if(need){
    /* 문구는 사장님이 준 그대로 쓴다 (2026-08-25) — 바꿔 쓰지 말 것.
       업체가 이 칸을 그냥 지나쳐서 주문처 주소·연락처가 둘 다 빈 발주가 계속 들어왔다. */
    return '<div class="ordbox" id="ordme">'
      + '<h3>📇 업체 정보를 한 번만 넣어주세요</h3>'
      + '<div class="hint">발주서의 <b>주문처 연락처·출고지</b>로 들어갑니다.<br>'
      +   '<b>저장해 놓으시면 계속 해당 정보로 입력 됩니다.(수정 가능)</b></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px">'
      + '<div><span class="k" style="font-size:11.5px;color:var(--muted)">업체명</span><input class="ordin" value="' + esc(me.name || '') + '" disabled></div>'
      + '<div><span class="k" style="font-size:11.5px;color:var(--muted)">주문처 연락처 <b style="color:var(--up)">*필수</b></span><input class="ordin" id="ord_ph" value="' + esc(me.phone || '') + '" placeholder="02-000-0000 / 010-0000-0000"></div>'
      + '<div style="grid-column:1/-1"><span class="k" style="font-size:11.5px;color:var(--muted)">주문처 주소 <b style="color:var(--accent-d)">(선택)</b></span><input class="ordin" id="ord_ad" value="' + esc(me.addr || '') + '" placeholder="주소는 생략 가능합니다">'
      +   '<div class="hint" style="margin-top:5px">주소는 생략 가능합니다. 송장에 주소를 노출하지 않으시려면 빈칸으로 두세요.</div></div>'
      + '</div>'
      + '<div class="ordbar" style="margin-bottom:0"><button class="ordb2 pri" id="ord_save">💾 저장</button>'
      + (EDIT ? '<button class="ordb2" id="ord_cancel">취소</button>' : '')
      + '<span class="hint" id="ord_msg" style="align-self:center"></span></div>'
      + '</div>';
  }
  return '<div class="ordbox" id="ordme">'
    + '<h3>📇 주문처 정보 <button class="ordb2" id="ord_edit" style="padding:3px 10px;font-size:11.5px;margin-left:6px">수정</button></h3>'
    + '<div class="ordme">'
    + '<div><span class="k">업체명(정산)</span><b>' + esc(me.name || '') + '</b></div>'
    + '<div><span class="k">연락처</span><b>' + esc(me.phone || '') + '</b></div>'
    + '<div><span class="k">출고지</span><b>' + (S(me.addr) ? esc(me.addr) : '<span style="color:var(--muted);font-weight:600">안 씀 (비워두셔도 발주됩니다)</span>') + '</b></div>'
    + '</div></div>';
}

/* 👥 어느 업체 발주인가 — 마스터 대신 발주 화면의 첫 칸.
   계정이 있는 업체는 골라 쓰고(주소·연락처가 자동으로 따라온다),
   카탈로그 계정이 아직 없는 업체는 직접 적는다. 둘 다 안 되면 발주 버튼이 잠긴다. */
function forCard(){
  const f = FOR || {};
  const manual = !!(f && f.manual);
  if(CLIENTS === false){
    return '<div class="ordbox" id="ordfor">'
      + '<h3>⚠️ 발주 웹앱을 먼저 올려주세요</h3>'
      + '<div class="hint">지금 붙어 있는 웹앱은 <b>대신 발주를 모르는 옛 버전</b>입니다. 이대로 넣으면 정산업체명이 <b>마스터 계정 이름</b>으로 박혀 발주가 틀어지므로 잠가뒀습니다.<br>'
      + '<b>발주웹앱_AppsScript_최신코드.txt</b> 전체를 Apps Script 편집기에 붙여넣고 <b>새 버전으로 배포</b>한 뒤 이 화면을 새로고침해 주세요.</div></div>';
  }
  return '<div class="ordbox" id="ordfor">'
    + '<h3>👥 어느 업체 발주인가요?</h3>'
    + '<div class="hint">카톡·엑셀로 받은 발주를 <b>대신 넣는 화면</b>입니다. 고른 업체 이름·연락처·출고지가 그대로 발주서에 들어갑니다.</div>'
    /* 🔎 업체가 200곳이 넘어가면 드롭다운으로는 못 고른다(홍팀장 2026-08-21) → 쳐서 찾는다.
       ⚠️ input에 name을 넣지 않는다 — 크롬이 폼 필드로 보고 저장된 아이디를 꽂아버린다(2026-08-19 검색칸 사고). */
    + '<div style="margin-top:10px;position:relative">'
    +   (CLIENTS
          ? '<input class="ordin" id="for_q" autocomplete="off" placeholder="업체명 또는 아이디를 치세요 (예: 청년수산 / mausel)" value="">'
            + '<div id="for_list" class="forlist"></div>'
            + '<div class="hint" style="margin-top:6px">등록된 업체 ' + CLIENTS.length + '곳</div>'
          : '<div class="hint">업체 목록을 불러오는 중입니다…</div>')
    + '</div>'
    + '<div class="ordbar" style="margin:8px 0 0"><button class="ordb2" id="for_manual">' + (manual ? '↩ 목록에서 고르기' : '✍️ 계정 없는 업체 직접 넣기') + '</button></div>'
    + (manual
        ? '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">'
          + '<div><span class="k" style="font-size:11.5px;color:var(--muted)">업체명(정산)</span><input class="ordin" id="for_nm" value="' + esc(f.name || '') + '" placeholder="세금계산서 나가는 상호"></div>'
          + '<div><span class="k" style="font-size:11.5px;color:var(--muted)">주문처 연락처</span><input class="ordin" id="for_ph" value="' + esc(f.phone || '') + '" placeholder="02-000-0000"></div>'
          + '<div style="grid-column:1/-1"><span class="k" style="font-size:11.5px;color:var(--muted)">출고지 주소 (선택)</span><input class="ordin" id="for_ad" value="' + esc(f.addr || '') + '" placeholder="안 쓰는 업체는 비워두세요"></div>'
          + '</div>'
          /* 한 번 저장해두면 다음에 그 업체가 또 카톡으로 발주를 줘도 이름만 쳐서 불러온다
             (홍팀장 2026-08-21). 저장 안 해도 이번 발주는 그냥 나간다. */
          + '<div class="ordbar" style="margin:8px 0 0"><button class="ordb2 pri" id="for_save">💾 이 업체 저장</button>'
          + '<span class="hint" id="for_msg" style="align-self:center">저장해두면 다음부터 이름만 쳐서 불러옵니다</span></div>'
        : '')
    + (S(f.name)
        ? '<div class="ordme" style="margin-top:10px">'
          + '<div><span class="k">업체명(정산)</span><b>' + esc(f.name) + '</b></div>'
          + '<div><span class="k">연락처</span><b>' + (S(f.phone) ? esc(f.phone) : '<span style="color:var(--up)">⚠️ 넣어주세요 (필수)</span>') + '</b></div>'
          + '<div><span class="k">출고지</span><b>' + (S(f.addr) ? esc(f.addr) : '<span style="color:var(--muted);font-weight:600">안 씀</span>') + '</b></div>'
          + '</div>'
        : '')
    + '</div>';
}

function view(){
  css();
  const master = amMaster();
  if(master && !CLIENTS && hasApi()){
    // 업체 목록은 화면을 그린 뒤 채운다 — 기다리게 하지 않는다
    /* 🔴 이 호출은 업체 목록을 받는 동시에 **웹앱이 대신 발주를 아는 버전인지** 확인하는 자물쇠다.
       구버전 웹앱은 'clients'를 모른다 → 그 상태로 발주를 넣으면 대상 업체 필드가 통째로 무시되고
       정산업체명이 마스터 계정 이름으로 박힌다. 그래서 실패하면 false로 두고 발주 버튼을 잠근다. */
    api('clients', {token: ME.token}).then(j => {
      CLIENTS = j.rows || [];
    }).catch(() => { CLIENTS = false; }).then(() => {
      const box = document.getElementById('ordfor');
      if(box){ box.outerHTML = forCard(); bindFor(); }
      paint();
    });
  }
  if(!ROWS.length){ ROWS = loadDraft(); }
  if(!ROWS.length){ ROWS = [blank(), blank(), blank()]; }
  if(master) loadFor();
  return subHead(master ? '🧾 대신 발주' : '🧾 발주하기',
                 master ? '카톡·엑셀로 받은 발주를 넣고 바로 당일 시트로 보냅니다'
                        : '카탈로그 상품을 담거나, 엑셀에서 복사해 붙여넣으세요')
    + '<div class="ordwrap">'
    + (master ? forCard() : meCard())
    + '<div class="ordbox">'
    +   '<h3>발주서</h3>'
    // 📢 안내는 업체가 실제로 읽어야 뜻이 있다 — 특히 업체명 칸은 가장 크게 (사장님 2026-08-20)
    +   '<div class="ordtip big">📮 <b>송장에 다른 이름으로 나가야 하는 업체만</b> 맨 앞 <b>업체명</b> 칸을 적어주세요.'
    +      '<span>택배 송장에 <b>지금 로그인하신 업체명이 아닌 다른 이름</b>이 찍혀야 하는 경우입니다. 필요 없으시면 <b>비워두세요</b> — 비워두시면 로그인하신 업체명으로 나갑니다.</span></div>'
    +   '<div class="ordtip">🔎 상품명은 <b>카탈로그에 있는 이름 그대로</b>여야 합니다.'
    +      '<span>헷갈리시면 카탈로그에서 <b>[+ 발주담기]</b>를 누르시면 정확한 이름이 그대로 들어갑니다.</span></div>'
    +   '<div class="ordtip">📦 같은 분께 가는 여러 상품은 <b>줄을 나눠</b> 적어주세요.'
    +      '<span>같은 주소 · 같은 창고 상품이면 저희가 <b>합포장으로 묶어드립니다</b>.</span></div>'
    +   '<div class="ordtip">📂 쓰시던 <b>엑셀 파일을 그대로 올리셔도</b> 됩니다.'
    +      '<span>엑셀(xlsx)·CSV 모두 됩니다. 칸 순서만 <b>업체명 / 상품명 / 수량 / 성함 / 주소 / 연락처 / 배송메시지</b> 로 맞춰주세요. 위 <b>[📥 발주 양식 받기]</b>를 쓰시면 가장 확실합니다.</span></div>'
    +   '<div class="ordbar">'
    +     (master && hasEngine() ? '<button class="ordb2 pri" id="ord_conv">🔄 업체 양식 그대로 넣기</button>' : '')
    +     '<button class="ordb2" id="ord_tpl">📥 발주 양식 받기</button>'
    +     '<button class="ordb2' + (master ? '' : ' pri') + '" id="ord_pick">📂 파일 넣기</button>'
    +     '<input type="file" id="ord_file" accept=".csv,.tsv,.txt,.xlsx,.xls" style="display:none">'
    +     '<button class="ordb2" id="ord_paste">📋 붙여넣기</button>'
    +     '<button class="ordb2" id="ord_add">+ 줄 추가</button>'
    +     '<button class="ordb2" id="ord_clr">🗑 전체 비우기</button>'
    +   '</div>'
    // 🔄 업체가 준 양식 그대로 — 발주서 변환기 엔진이 우리 양식으로 바꿔 표에 채운다 (마스터 전용)
    +   (master && hasEngine()
        ? '<div id="ord_convbox" style="display:none;margin-bottom:10px">'
        +   '<div class="ordtip big">🔄 <b>업체가 보낸 그대로</b> 붙여넣으세요 — 카톡·엑셀·게시판 어느 양식이든 됩니다.'
        +     '<span>발주서 변환기(v' + (window.CONVERT.VERSION || '') + ')와 <b>같은 엔진</b>으로 읽습니다. 읽은 결과는 아래 표에 채워지고, 상품명이 안 맞으면 빨갛게 표시됩니다.</span></div>'
        // 📂 파일로 주는 업체는 파일째로 — 열어서 다시 복붙하는 건 두 번 일이다 (홍팀장 2026-08-24)
        +   '<div class="ordbar" style="margin-bottom:8px">'
        +     '<button class="ordb2 pri" id="ord_cvpick">📂 파일에서 읽기</button>'
        +     '<input type="file" id="ord_cvfile" accept=".csv,.tsv,.txt,.xlsx,.xls" style="display:none">'
        +     '<span class="hint" style="align-self:center">엑셀·CSV 그대로 / 카톡은 아래에 붙여넣기</span>'
        +   '</div>'
        +   '<div id="ord_cvdrop" class="ordcvdrop">여기에 <b>파일을 끌어다 놓아도</b> 됩니다</div>'
        +   '<textarea class="ordpaste" id="ord_cv" style="min-height:170px" placeholder="업체가 카톡·메일·엑셀로 보낸 발주를 그대로 붙여넣으세요 (Ctrl+V)&#10;양식을 맞출 필요 없습니다 — 변환기가 읽습니다."></textarea>'
        +   '<div class="ordbar"><button class="ordb2 pri" id="ord_cvok">변환해서 표에 넣기</button>'
        +     '<button class="ordb2" id="ord_cvadd">기존 줄 아래에 이어붙이기</button>'
        +     '<button class="ordb2" id="ord_cvno">취소</button></div>'
        +   '<div id="ord_cvlog"></div>'
        + '</div>'
        : '')
    +   '<div id="ord_pastebox" style="display:none;margin-bottom:10px">'
    +     '<textarea class="ordpaste" id="ord_pt" placeholder="엑셀에서 표를 복사해 여기에 붙여넣으세요 (Ctrl+V)&#10;업체명 / 상품명 / 수량 / 받는분 성함 / 받는분 주소 / 받는분 연락처 / 배송메시지"></textarea>'
    +     '<div class="ordbar"><button class="ordb2 pri" id="ord_ptok">가져오기</button><button class="ordb2" id="ord_ptno">취소</button></div>'
    +   '</div>'
    +   '<div class="ordtblwrap"><table class="ordtbl"><thead><tr><th></th>'
    +     HEADS.map((h, i) => '<th' + (i === 2 ? ' style="width:70px"' : (i === 0 ? ' style="color:var(--accent-d);min-width:120px"' : '')) + '>' + h + (i === 0 ? '<span style="display:block;font-weight:700;color:var(--accent-d)">송장에 다른 이름<br>나갈 때만</span>' : '') + '</th>').join('')
    +     '<th style="width:34px"></th></tr></thead><tbody id="ordbody"></tbody></table></div>'
    +   '<div id="ordsum" class="ordsum"></div>'
    + '</div>'
    + '<div class="ordbox" id="ordoutbox"></div>'
    + '<div class="ordbox"><h3>도움이 필요하시면</h3><div class="hint">상품명이 안 맞거나 발주서가 만들어지지 않으면 <b>' + TEL_HELP + '</b> 으로 연락 주세요.</div></div>'
    + '</div>';
}

function rowHtml(r, i){
  const c = checkRow(r);
  const filled = FIELDS.some(f => S(r[f]));
  const bad = filled && c.errs.length > 0;
  let h = '<tr class="' + (bad ? 'bad' : '') + '" data-i="' + i + '">'
    + '<td class="ordnum">' + (i + 1) + '</td>'
    + FIELDS.map(f => '<td><input data-f="' + f + '" data-i="' + i + '" value="' + esc(r[f] || '') + '"'
        + (f === 'biz' ? ' placeholder="(비워두셔도 됩니다)"' : '')
        + (f === 'qty' ? ' inputmode="numeric"' : '')
        + (f === 'tel' ? ' inputmode="tel"' : '') + '></td>').join('')
    + '<td><button class="orddel" data-del="' + i + '" title="이 줄 삭제">✕</button></td></tr>';
  if(filled && (c.errs.length || c.warns.length || (OPEN === i && c.cands.length))){
    h += '<tr class="' + (bad ? 'bad' : '') + '"><td></td><td colspan="7" style="padding-top:0">';
    if(c.errs.length) h += '<div class="orderr">⚠️ ' + c.errs.map(esc).join('<br>⚠️ ') + '</div>';
    if(c.warns.length) h += '<div class="ordwarn">' + c.warns.map(esc).join('<br>') + '</div>';
    if(!c.p && S(r.name)){
      if(c.cands.length){
        h += '<div class="ordask">혹시 이 상품 말씀이신가요? <b>단가를 꼭 확인</b>하시고 골라주세요.</div><div class="ordcand">'
          + c.cands.map(p => {
              const im = imgOf(p);
              return '<button class="ordcd" data-pick="' + esc(p.name) + '" data-i="' + i + '">'
                + (im ? '<img src="' + esc(im) + '" alt="">' : '<img src="" alt="" style="visibility:hidden">')
                + '<span><span class="nm">' + esc(p.name) + '</span>'
                + '<span class="pz">' + esc(priceText(p)) + '</span>'
                + '<span class="wh">📦 ' + esc(whOf(p)) + (p.cut ? ' · ' + esc(p.cut) : '') + '</span></span></button>';
            }).join('') + '</div>';
      }else{
        h += '<div class="ordask">비슷한 상품을 찾지 못했습니다. 카탈로그에서 상품을 찾아 <b>[+ 발주담기]</b>를 눌러주시거나, ' + TEL_HELP + ' 으로 문의해 주세요.</div>';
      }
    }
    h += '</td></tr>';
  }
  return h;
}

function paint(){
  const b = document.getElementById('ordbody');
  if(!b) return;
  b.innerHTML = ROWS.map((r, i) => rowHtml(r, i)).join('');
  let ok = 0, bad = 0, empty = 0;
  ROWS.forEach(r => {
    if(!FIELDS.some(f => S(r[f]))){ empty++; return; }
    (checkRow(r).errs.length ? bad++ : ok++);
  });
  const sum = document.getElementById('ordsum');
  if(sum){
    sum.innerHTML = '입력 <b>' + (ok + bad) + '</b>건 · 정상 <b>' + ok + '</b>건'
      + (bad ? ' · <span class="ordbad">확인 필요 <b>' + bad + '</b>건</span>' : '')
      + (empty ? ' · 빈 줄 ' + empty : '');
  }
  paintOut(ok, bad);
  saveDraft();
  badge();
}

function paintOut(ok, bad){
  const box = document.getElementById('ordoutbox');
  if(!box) return;
  if(bad || !ok){
    box.innerHTML = '<h3>발주서 미리보기</h3>'
      + '<div class="hint">' + (bad ? '⚠️ <b class="ordbad">확인이 필요한 줄이 ' + bad + '개</b> 있습니다. 빨간 줄을 고치시면 발주서가 만들어집니다.' : '내용을 넣으시면 여기에 발주서가 만들어집니다.') + '</div>';
    return;
  }
  const o = buildOut();
  let h = '<h3>발주서 미리보기 (우리 양식으로 변환됨)</h3>';
  // ⚠️ 창고명 칸을 왜 비우는지는 우리 사정이다 — 업체 화면에 쓰지 않는다 (사장님 2026-08-20)
  h += '<div class="hint">같은 주소·같은 창고 상품은 <b>합포장으로 묶었습니다</b>.</div>';
  if(o.notes.length) h += '<div class="ordnote" style="margin-top:8px">' + o.notes.map(esc).join('<br>') + '</div>';
  if(o.warn.length)  h += '<div class="ordnote" style="margin-top:8px">📦 ' + o.warn.map(esc).join('<br>📦 ') + '</div>';
  if(o.nine.length){
    h += '<div class="ordsum" style="margin-top:12px"><b>일반 발주 (9칸)</b> · ' + o.nine.length + '줄</div>'
      + '<div class="ordout">' + esc(tsv(o.nine)) + '</div>'
      + '<button class="ordb2" data-cpx="9" style="margin-top:7px">📋 복사</button>';
  }
  if(o.ten.length){
    h += '<div class="ordsum" style="margin-top:12px"><b>업체명 지정 발주 (10칸)</b> · ' + o.ten.length + '줄</div>'
      + '<div class="ordout">' + esc(tsv(o.ten)) + '</div>'
      + '<button class="ordb2" data-cpx="10" style="margin-top:7px">📋 복사</button>';
    if(o.nine.length) h += '<div class="hint" style="margin-top:8px">⚠️ 9칸과 10칸은 칸 수가 달라 <b>따로</b> 붙여넣어야 합니다.</div>';
  }
  const master = amMaster();
  // 대신 발주는 업체를 고르기 전엔 버튼을 잠근다 — 안 고르면 마스터 이름으로 발주가 나간다.
  const oldApp = master && CLIENTS === false;      // 웹앱이 옛 버전 — 넣으면 마스터 이름으로 박힌다
  const noFor = master && (oldApp || !(FOR && S(FOR.name)));
  /* 🔴 주문처 연락처가 없으면 발주 버튼을 잠근다 (사장님 2026-08-25).
     "자꾸 둘 다 빈칸으로 발주 들어온다" — 안내만 띄우고 통과시키니 그냥 지나쳐 버렸다.
     빈 채로 나가면 송장에 주문처 연락처가 없어 배송사고가 우리 쪽으로 온다.
     주소는 선택이다(송장에 주소를 노출하기 싫어 일부러 비우는 업체가 있다). */
  const noPhone = !master && !S(ME && ME.phone);
  h += '<div class="ordbar" style="margin-top:12px">'
    + (!hasApi()
        /* 🔴 여기 걸리는 건 대개 **로그인 토큰이 없어서**다(웹앱 전환 전에 로그인해 둔 세션).
           "준비 중"이라고만 쓰면 업체는 우리가 막아둔 줄 안다 — 뭘 하면 되는지 말해준다
           (2026-08-24 플랜컴퍼니: "왜 발주넣기가 준비중이냐"). */
        ? '<button class="ordb2 pri" disabled>🧾 발주 넣기</button>'
          + '<button class="ordb2" id="ord_relogin">🔑 다시 로그인</button>'
          + '<span class="hint" style="align-self:center">로그인이 오래돼 발주 접수가 잠겼습니다. <b>다시 로그인하시면 바로 됩니다.</b></span>'
        : (noFor
            ? '<button class="ordb2 pri" disabled>📤 발주 넣고 당일 시트로 보내기</button><span class="hint" style="align-self:center">'
              + (oldApp ? '발주 웹앱을 최신 코드로 올린 뒤에 쓸 수 있습니다.' : '위에서 <b>어느 업체 발주인지</b> 먼저 골라주세요.') + '</span>'
          : noPhone
            ? '<button class="ordb2 pri" disabled>🧾 발주 넣기</button>'
              + '<button class="ordb2" id="ord_gotome">📇 주문처 정보 넣기</button>'
              + '<span class="hint" style="align-self:center"><b style="color:var(--up)">주문처 연락처가 비어 있어 발주가 잠겼습니다.</b> 위 <b>📇 업체 정보</b> 칸에 연락처를 넣고 저장해 주세요.</span>'
            : '<button class="ordb2 pri" id="ord_submit">' + (master ? '📤 발주 넣고 당일 시트로 바로 보내기' : '🧾 이대로 발주 넣기') + '</button>'
              + '<span class="hint" id="ord_smsg" style="align-self:center">' + (master ? '넣는 즉시 당일 시트 맨 아래에 붙습니다.' : '') + '</span>'))
    + '</div>';
  box.innerHTML = h;
  box.__out = o;
  const sb = document.getElementById('ord_submit');
  if(sb) sb.onclick = submit;
  // 📇 잠긴 화면에서 바로 정보 칸으로 데려간다 — "어디에 넣으라는 거냐"를 없앤다
  const gm = document.getElementById('ord_gotome');
  if(gm) gm.onclick = () => {
    EDIT = true; paint();
    const el = document.getElementById('ordme');
    if(el) window.scrollTo({top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - 80), behavior:'smooth'});
    const ph = document.getElementById('ord_ph');
    if(ph) setTimeout(() => ph.focus(), 300);
  };
  // 토큰이 없어 잠긴 경우 — 발주 내용은 남겨둔 채 로그인 화면만 띄운다(임시저장돼 있어 안 날아간다)
  const rl = document.getElementById('ord_relogin');
  if(rl) rl.onclick = () => { try{ localStorage.removeItem(NS + 'catalog_auth_v1'); }catch(e){} location.reload(); };
}

// ── 발주 제출 ───────────────────────────────────────────────────
/* 브라우저는 '무엇을 몇 개, 누구에게'까지만 보낸다.
   정산업체명·주문처 정보는 웹앱이 계정에서 채운다 — 업체가 보낸 값을 그대로 믿지 않기 위해서다. */
async function submit(){
  const box = document.getElementById('ordoutbox'), o = box && box.__out;
  if(!o) return;
  const sb = document.getElementById('ord_submit'), msg = document.getElementById('ord_smsg');
  const items = [];
  const push = (biz, cells, ten) => {
    // 9칸: [정산][주소][연락처][창고][상품][성함][주소][연락처][메시지]
    // 10칸:[정산][송장][주소][연락처][창고][상품][성함][주소][연락처][메시지]
    const k = ten ? 4 : 3;
    items.push({biz:biz, wh:cells[k], prod:cells[k+1], rcv:cells[k+2], addr:cells[k+3], tel:cells[k+4], msg:cells[k+5]});
  };
  o.nine.forEach(c => push('', c, false));
  o.ten.forEach(c => push(c[1], c, true));
  if(!items.length) return;
  const master = amMaster();
  if(master && !(FOR && S(FOR.name))){ if(msg) msg.textContent = '어느 업체 발주인지 먼저 골라주세요.'; return; }
  /* 업체 본인 발주도 주문처 연락처는 필수다 (사장님 2026-08-25) — 웹앱도 같은 검사를 한다.
     여기까지 온 건 버튼 잠금을 빠져나온 경우(저장 직후 등)라 한 번 더 붙잡는다. */
  if(!master && !S(ME && ME.phone)){
    if(msg) msg.textContent = '주문처 연락처를 먼저 넣어주세요. (주소는 비워두셔도 됩니다)';
    EDIT = true; paint();
    const ph = document.getElementById('ord_ph');
    if(ph) ph.focus();
    return;
  }
  /* 대행 발주는 **연락처 필수 · 주소 선택** (홍팀장 2026-08-21).
     비워두면 마스터 계정 번호가 주문처 연락처로 박혀 나간다 — 웹앱도 같은 검사를 한다. */
  if(master && !S(FOR.phone)){
    if(msg) msg.textContent = FOR.name + ' 의 주문처 연락처를 넣어주세요. (출고지 주소는 선택입니다)';
    const ph = document.getElementById('for_ph');
    if(ph) ph.focus();
    return;
  }
  const ask = master
    ? ('[' + FOR.name + '] 발주 ' + items.length + '건을 넣고 당일 시트로 바로 보낼까요?\n\n보낸 뒤에는 그 줄을 고치거나 취소할 수 없습니다.')
    : (items.length + '건을 발주로 넣을까요?\n\n넣으신 뒤에도 저희가 처리에 들어가기 전까지는 취소하실 수 있습니다.');
  if(!confirm(ask)) return;
  sb.disabled = true; sb.textContent = '보내는 중…'; if(msg) msg.textContent = '';
  try{
    const req = {token: ME.token, items};
    // 대신 발주 — 발주의 주인을 고른 업체로 넘기고, 저장되는 즉시 당일 시트까지 보낸다.
    if(master){
      if(FOR.id) req.forId = FOR.id;
      req.forName = FOR.name; req.forAddr = FOR.addr || ''; req.forPhone = FOR.phone || '';
      req.andPush = true;
    }
    const j = await api('submit', req);
    ROWS = [blank(), blank(), blank()];
    OPEN = -1;
    saveDraft();
    paint();
    if(master){
      const p = j.push || {};
      // 🔴 발주는 저장됐는데 시트로만 못 간 경우가 있다 — 그걸 성공으로 뭉뚱그리면 발주가 조용히 안 나간다.
      if(p.ok) toast('발주 ' + j.orderNo + ' — 당일 시트 ' + p.col + p.row + '행부터 ' + p.count + '줄 보냈습니다');
      else {
        alert('발주 ' + j.orderNo + ' 는 접수됐지만 당일 시트로 보내지 못했습니다.\n\n' + (p.error || '알 수 없는 오류')
              + '\n\n발주 내역에서 [📤 당일 시트로 보내기]로 다시 보내주세요.');
      }
    } else {
      toast('발주 ' + j.orderNo + ' 접수되었습니다');
    }
    location.hash = 'orders';
  }catch(e){
    if(msg) msg.textContent = (e.message || '보내지 못했습니다') + ' — ' + TEL_HELP;
    sb.disabled = false; sb.textContent = master ? '📤 발주 넣고 당일 시트로 바로 보내기' : '🧾 이대로 발주 넣기';
  }
}

// ── 발주 내역 (업체는 자기 것만 · 마스터는 전체) ─────────────────
/* 🔴 걸러내는 일은 웹앱이 한다. 이 화면은 받은 것을 그리기만 한다 —
   브라우저에서 거르는 방식이면 "안 보이게 한 것"일 뿐 "못 보게 한 것"이 아니다. */
/* 발주 내역 — 쌓이면 화면이 끝없이 길어지므로 **페이지로 나누고 검색을 붙인다**
   (사장님 2026-08-20: "내가 발주를 했나? 뭐가 잘못됐지 찾을 때 이름·연락처로 검색"). */
const PAGE = 10;                 // 한 페이지에 발주 묶음 10건
let OQ = '', OPAGE = 1, OST = '';
// ✏️ 수정 중인 발주묶음과 줄 — 고치는 동안 다른 카드는 건드리지 않는다
let EDIT_NO = '', EDIT_SEQ = [];
const isEditing = (no, seq) => EDIT_NO === no && EDIT_SEQ.indexOf(String(seq)) >= 0;
// 검색·페이지가 바뀌면 편집 중이던 칸은 사라진다 → 상태도 같이 접는다(저장 안 된 값이 남아 보이지 않게)
function resetEdit(){ EDIT_NO = ''; EDIT_SEQ = []; }
async function ordersView(){
  css();   // ⚠️ 마스터는 발주하기 화면을 안 거치므로 여기서도 스타일을 넣어야 한다(2026-08-20 화면 깨짐)
  if(!hasApi()) return subHead('📋 발주 내역', '') + '<div class="empty">발주 접수가 아직 열리지 않았습니다.</div>';
  const master = !!(ME && ME.master);
  const j = await api('list', {token: ME.token});
  LIST = j.rows || [];
  OPAGE = 1;
  // 🆕 아직 내가 [👀 확인함]을 안 누른 발주 — 카드에 NEW 를 달아준다
  if(master){ takeAcks(j); NEWNOS = newSet(LIST); }
  let h = subHead(master ? '📋 전체 발주 내역' : '📋 내 발주 내역',
                  master ? '마스터 계정 — 모든 업체의 발주가 보입니다' : '내가 넣은 발주만 보입니다');
  h += '<div class="ordwrap">';
  if(master) h += cfgBox();
  h += '<div class="ordbox srch">'
    +   '<input class="ordin" id="osearch" placeholder="🔎 받는분 이름 · 연락처 · 상품명 · 주소 · 발주번호'
    +     (master ? ' · 업체명' : '') + ' 으로 찾기" value="' + esc(OQ) + '">'
    +   '<div class="ordbar" style="margin:8px 0 0">'
    +     ['', '접수', '완료', '취소'].map(s => '<button class="ordb2 fbtn' + (OST === s ? ' on' : '') + '" data-ost2="' + s + '">'
    +        (s === '' ? '전체' : (s === '완료' ? (master ? '전송됨' : '확인됨') : s)) + '</button>').join('')
    +   '</div>'
    + '</div>'
    + '<div id="ordlist"></div>';
  return h + '</div>';
}
/* 검색·페이지는 화면에서만 처리한다 — 이미 받아온 목록을 다시 그리는 것이라 서버를 또 부르지 않는다.
   ⚠️ 웹앱은 한 번에 2,000줄까지 내려준다. 그보다 쌓이면 그때 기간 조회로 바꿔야 한다. */
function ordersPaint(){
  const box = document.getElementById('ordlist');
  if(!box) return;
  const master = !!(ME && ME.master);
  const q = pkey(OQ), qd = S(OQ).replace(/[^0-9]/g, '');
  const hit = LIST.filter(r => {
    if(OST && S(r.state) !== OST) return false;
    if(!q) return true;
    const hay = pkey([r.no, r.prod, r.rcv, r.addr, r.msg, r.biz, master ? r.cname : ''].join(' '));
    if(hay.indexOf(q) >= 0) return true;
    return !!qd && S(r.tel).replace(/[^0-9]/g, '').indexOf(qd) >= 0;   // 연락처는 하이픈 무시하고 찾는다
  });
  const byNo = new Map();
  hit.forEach(r => { if(!byNo.has(r.no)) byNo.set(r.no, []); byNo.get(r.no).push(r); });
  const nos = Array.from(byNo.keys());
  const pages = Math.max(1, Math.ceil(nos.length / PAGE));
  if(OPAGE > pages) OPAGE = pages;
  const page = nos.slice((OPAGE - 1) * PAGE, OPAGE * PAGE);

  let h = '<div class="ordsum">발주 <b>' + nos.length + '</b>묶음 · <b>' + hit.length + '</b>건'
    + (OQ || OST ? ' <button class="ordb2" id="oclr" style="padding:2px 9px;font-size:11px">검색 지우기</button>' : '') + '</div>';
  if(!nos.length){ box.innerHTML = h + '<div class="empty">' + (LIST.length ? '찾는 발주가 없습니다.' : '아직 발주 내역이 없습니다.') + '</div>'; bindPager(); return; }
  page.forEach(no => { h += orderCard(no, byNo.get(no), master); });
  if(pages > 1){
    h += '<div class="opager">'
      + '<button class="ordb2" data-opg="' + (OPAGE - 1) + '"' + (OPAGE <= 1 ? ' disabled' : '') + '>‹ 이전</button>'
      + pageNums(OPAGE, pages).map(n => n === '…' ? '<span class="odots">…</span>'
          : '<button class="ordb2 pg' + (n === OPAGE ? ' on' : '') + '" data-opg="' + n + '">' + n + '</button>').join('')
      + '<button class="ordb2" data-opg="' + (OPAGE + 1) + '"' + (OPAGE >= pages ? ' disabled' : '') + '>다음 ›</button>'
      + '</div>';
  }
  box.innerHTML = h;
  bindPager();
}
// 1 … 4 [5] 6 … 20 — 페이지가 많아도 버튼이 한 줄을 안 넘게
function pageNums(cur, total){
  const out = [];
  for(let i = 1; i <= total; i++){
    if(i === 1 || i === total || Math.abs(i - cur) <= 1) out.push(i);
    else if(out[out.length - 1] !== '…') out.push('…');
  }
  return out;
}
function bindPager(){
  const c = document.getElementById('oclr');
  if(c) c.onclick = () => { OQ = ''; OST = ''; const s = document.getElementById('osearch'); if(s) s.value = ''; syncFbtn(); OPAGE = 1; resetEdit(); ordersPaint(); };
}
function syncFbtn(){
  document.querySelectorAll('[data-ost2]').forEach(b => b.classList.toggle('on', b.getAttribute('data-ost2') === OST));
}
/* 수정 중인 줄의 상품 칸 — **상품명은 글자로 두고 수량만 입력칸**으로 준다.
   "1개 시켰는데 2개로 해주세요"는 흔하지만, 상품이 바뀌는 건 취소하고 다시 넣는 게 맞다(사장님 2026-08-20).
   서버도 이름을 대조해서 다르면 거부한다 — 화면만 막아두면 막은 게 아니다. */
function splitProd(s){
  return S(s).split('/').map(x => {
    const t = S(x), m = t.match(/^(.*?)\s*[xX×]\s*(\d+)$/);
    return m ? {name:S(m[1]), qty:m[2]} : {name:t, qty:''};
  });
}
function qtyCells(no, r){
  return splitProd(r.prod).map((p, i) => '<span class="qline">' + esc(p.name)
    + (p.qty !== '' ? ' <b>x</b> <input class="ordin qin" data-no="' + esc(no) + '" data-seq="' + esc(String(r.seq)) + '" data-qi="' + i
        + '" data-name="' + esc(p.name) + '" inputmode="numeric" value="' + esc(p.qty) + '">' : '')
    + '</span>').join('');
}
function orderCard(no, list, master){
  let h = '';
  {
    const f = list[0];
    const live = list.filter(r => r.state !== '취소');
    const sent = live.length && live.every(r => r.state === '완료');
    const st = !live.length ? '취소' : (sent ? '완료' : '접수');
    const canPick = list.some(r => r.state === '접수');
    h += '<div class="ordcard' + (sent ? ' sent' : '') + (!live.length ? ' dead' : '') + '">'
      + '<div class="ordhd">'
      +   '<div><span class="ono">' + esc(no) + '</span>'
      +     '<span class="ordst ' + (st === '취소' ? 'no' : (st === '접수' ? 'new' : 'go')) + '">'
      +       (st === '완료' ? (master ? '✅ 당일 시트 전송됨' : '✅ 발주 확인됨') : (st === '취소' ? '취소됨' : '접수'))
      +     '</span>'
      +     (master && NEWNOS.has(S(no)) ? '<span class="onewb">NEW</span>' : '')
      +     (master && ACKON && st === '접수' && ackMissing(no).length
              ? '<span class="ordst wait">👀 ' + ackMissing(no).map(m => esc(nick(m.name))).join('·') + ' 미확인</span>' : '')
      +   '</div>'
      +   '<div class="ometa">' + esc(short(f.at)) + ' · ' + list.length + '건'
      +     (master ? ' · <b>' + esc(f.cname) + '</b>' : '') + '</div>'
      + '</div>'
      + '<div class="ordtblwrap"><table class="ordtbl olist"><thead><tr>'
      +   (canPick ? '<th class="ck"><input type="checkbox" class="ordall" data-no="' + esc(no) + '" title="전체 선택"></th>' : '<th class="ck"></th>')
      +   (master ? '<th>송장업체</th>' : '')
      +   '<th>상품</th><th>받는분</th><th>주소</th><th>연락처</th><th>메시지</th></tr></thead><tbody>'
      +   list.map(r => {
            const dead = r.state === '취소', done = r.state === '완료';
            const ed = isEditing(no, r.seq);
            const cell = (f, cls) => ed
              ? '<td class="' + (cls || '') + '"><input class="ordin ein" data-no="' + esc(no) + '" data-seq="' + esc(String(r.seq)) + '" data-f="' + f + '" value="' + esc(r[f] || '') + '"></td>'
              : '<td class="' + (cls || '') + '">' + esc(r[f] || '') + '</td>';
            return '<tr class="' + (dead ? 'xrow' : '') + (ed ? ' erow' : '') + '">'
              + '<td class="ck">' + ((!dead && !done)
                  ? '<input type="checkbox" class="ordpick" data-no="' + esc(no) + '" data-seq="' + esc(String(r.seq)) + '"' + (ed ? ' checked' : '') + '>'
                  : (done ? '<span class="lock" title="당일 시트로 넘어가 고치거나 취소할 수 없습니다">🔒</span>' : '')) + '</td>'
              + (master ? '<td>' + esc(r.biz) + '</td>' : '')
              + '<td class="pd">' + (ed ? qtyCells(no, r) : esc(r.prod)) + '</td>'
              + cell('rcv') + cell('addr', 'ad') + cell('tel', 'tl') + cell('msg')
              + '</tr>';
          }).join('')
      + '</tbody></table></div>'
      + '<div class="ordbar" style="margin-bottom:0;margin-top:10px">'
      + (master
          ? (sent
              ? '<button class="ordb2 done" disabled>✅ 당일 시트로 보냈습니다</button>'
              : (live.length ? '<button class="ordb2 pri" data-opush="' + esc(no) + '">📤 당일 시트로 보내기</button>' : ''))
          : '')
      + (EDIT_NO === no
          ? '<button class="ordb2 pri" data-osave="' + esc(no) + '">💾 수정 완료</button>'
            + '<button class="ordb2" data-oecx="1">되돌리기</button>'
            + '<span class="hint" style="align-self:center">성함 · 주소 · 연락처 · 메시지만 고칠 수 있습니다</span>'
          : (canPick ? '<button class="ordb2" data-oed="' + esc(no) + '">✏️ 선택한 건 수정</button>'
                     + '<button class="ordb2 warn" data-ocn="' + esc(no) + '">✕ 선택한 건 취소</button>' : ''))
      + '</div>'
      + (master && sent ? '<div class="hint" style="margin-top:6px">' + esc(f.done ? short(f.done) + ' 전송' : '전송됨') + ' — 다시 보내지지 않습니다</div>' : '')
      + (master && ACKON ? ackLine(no) : '')
      + '</div>';
  }
  return h;
}
/* ⚙️ 당일 시트 주소 칸 (마스터만) — 시트는 매월 바뀐다.
   비서·발주서 변환기와 같은 방식으로 화면에서 갈아끼운다(사장님 2026-08-20: "비서처럼 그게 편해"). */
function cfgBox(){
  return '<div class="ordbox cfg" id="ordcfg">'
    + '<h3>⚙️ 당일 시트 <button class="ordb2" id="cfg_tg" style="padding:3px 10px;font-size:11.5px;margin-left:6px">주소 바꾸기</button>'
    +   '<span class="cfgst" id="cfg_state">확인 중…</span></h3>'
    + '<div id="cfg_form" style="display:none;margin-top:9px">'
    +   '<div class="hint" style="margin-bottom:6px">발주를 넣는 시트 주소를 통째로 붙여넣어 주세요. 매월 새 시트로 바뀌면 여기만 갈아끼우시면 됩니다.<br>'
    +     '⚠️ <b>사장님 계정에 편집 권한이 있는 시트</b>여야 합니다.</div>'
    +   '<div style="display:grid;grid-template-columns:1fr 110px;gap:8px">'
    +     '<input class="ordin" id="cfg_url" placeholder="https://docs.google.com/spreadsheets/d/…">'
    +     '<input class="ordin" id="cfg_tab" placeholder="탭 이름" value="당일">'
    +   '</div>'
    +   '<div class="ordbar" style="margin-bottom:0"><button class="ordb2 pri" id="cfg_save">💾 저장하고 확인</button>'
    +     '<span class="hint" id="cfg_msg" style="align-self:center"></span></div>'
    + '</div></div>';
}
async function cfgLoad(){
  const st = document.getElementById('cfg_state');
  if(!st) return;
  try{
    const j = await api('getcfg', {token: ME.token});
    st.textContent = j.state || '';
    st.className = 'cfgst ' + (j.good ? 'ok' : 'bad');
    const u = document.getElementById('cfg_url');
    if(u && j.url) u.value = j.url;
    const t = document.getElementById('cfg_tab');
    if(t && j.tab) t.value = j.tab;
    if(!j.good){ const f = document.getElementById('cfg_form'); if(f) f.style.display = ''; }
  }catch(e){ st.textContent = e.message || '확인하지 못했습니다'; st.className = 'cfgst bad'; }
}
function cfgBind(){
  const tg = document.getElementById('cfg_tg');
  if(tg) tg.onclick = () => { const f = document.getElementById('cfg_form'); f.style.display = (f.style.display === 'none' ? '' : 'none'); };
  const sv = document.getElementById('cfg_save');
  if(sv) sv.onclick = async () => {
    const msg = document.getElementById('cfg_msg');
    sv.disabled = true; msg.textContent = '확인 중…';
    try{
      const j = await api('setcfg', {token: ME.token, url: document.getElementById('cfg_url').value, tab: document.getElementById('cfg_tab').value});
      const st = document.getElementById('cfg_state');
      st.textContent = j.state; st.className = 'cfgst ok';
      msg.textContent = '';
      document.getElementById('cfg_form').style.display = 'none';
      toast('당일 시트를 연결했습니다');
    }catch(e){ msg.textContent = e.message || '저장하지 못했습니다'; }
    finally{ sv.disabled = false; }
  };
  cfgLoad();
}

// 2026-08-20 16:45 → 08-20 16:45 (시트가 날짜로 돌려주는 긴 형식도 여기서 자른다)
function short(s){
  const t = S(s);
  const m = t.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/);
  return m ? (m[2] + '-' + m[3] + ' ' + m[4]) : t;
}
/* 발주묶음을 우리 양식(9칸/10칸) 텍스트로. 지금 화면엔 복사 버튼이 없다 —
   당일 시트로 보내는 건 웹앱이 하고, 사람 손이 끼면 "복사만 하고 완료를 안 눌러" 중복이 나기 때문(사장님).
   시트가 막혔을 때 손으로 넣어야 하는 비상용으로만 남겨둔다. */
function ordersTsv(rows){
  const nine = [], ten = [];
  rows.forEach(r => {
    if(r.biz) ten.push([r.cname, r.biz, r.oaddr, r.otel, '', r.prod, r.rcv, r.addr, r.tel, r.msg]);
    else      nine.push([r.cname, r.oaddr, r.otel, '', r.prod, r.rcv, r.addr, r.tel, r.msg]);
  });
  return [tsv(nine), tsv(ten)].filter(Boolean).join('\n');
}
let LIST = [];
async function reloadOrders(){
  const sub = document.getElementById('subView');
  if(!sub) return;
  try{ sub.innerHTML = await ordersView(); ordersBind(); }catch(e){ toast(e.message || '다시 불러오지 못했습니다'); }
}
// 발주 내역 화면을 그린 뒤 호출 (검색·페이지 + 마스터의 ⚙️ 시트 설정 칸)
let otmr = null;
function ordersBind(){
  if(ME && ME.master) cfgBind();
  const s = document.getElementById('osearch');
  if(s){
    s.oninput = () => { clearTimeout(otmr); otmr = setTimeout(() => { OQ = s.value; OPAGE = 1; resetEdit(); ordersPaint(); }, 250); };
    s.onkeydown = e => { if(e.key === 'Escape'){ s.value = ''; OQ = ''; OPAGE = 1; resetEdit(); ordersPaint(); } };
  }
  ordersPaint();
  /* 🔴 화면을 연 것은 확인이 아니다 (사장님 2026-08-25) — [👀 확인함]을 눌러야 확인이다.
     예전엔 여기서 전부 읽음 처리해서, 목록이 뜨기도 전에 닫으면 알림만 조용히 꺼졌다. */
  if(ME && ME.master){
    if(ACKON){ badgeOrders(unackNos(LIST).length); popHide(); }
    else seenMarkAll();                       // 구버전 웹앱이 붙어 있는 동안만 옛 방식
  }
}

/* ══ 🔔 새 발주 알림 (마스터 전용 · 홍팀장 2026-08-24) ═══════════════
   "업체가 발주해도 new 나 수량이 안 떠. 이럼 알 수가 없잖아."
   ① 1분마다 발주 목록을 뒤에서 확인한다 (탭이 보일 때만 — 숨은 탭은 쉰다)
   ② 안 본 발주 개수를 [📋 발주 내역] 메뉴 배지에 띄운다
   ③ 새로 들어온 발주는 오른쪽 아래 팝업으로 알린다 — 누르면 발주 내역으로 간다
   ④ 발주 내역을 보고 있는 중이면 팝업 대신 목록을 바로 새로 그린다 (수정 중엔 안 건드린다)
   '봤다'의 기준 = 발주 내역 화면을 연 것. 기기별 localStorage 에 발주번호로 기록한다. */
const SEENK = NS + 'orders_seen_v1';
let NEWNOS = new Set();          // 이번 내역 화면에서 NEW 를 달아줄 발주번호
let NOTIFIED = new Set();        // 이미 팝업으로 알린 발주번호 (1분마다 같은 팝업이 또 뜨지 않게)

/* ══ 👀 확인 — 찬화·원비 **둘 다** 눌러야 알림이 꺼진다 (사장님 2026-08-25) ═══
   사장님: "내가 안 누르면 확인해야 할 발주로 해줘. 나랑 원비 둘 중 하나가 확인 안 했으면 알림 떠 있게."
   🔴 왜 바꿨나 — 2026-08-24 밤 22:48 발주를 아무도 못 보고 아침을 맞을 뻔했다. 원인은 두 가지였다.
      ① '봤다'를 **브라우저(localStorage)** 에 적었다 → 기기가 다르면 따로 놀고, 무엇보다
         한 사람이 본 것이 두 사람 다 본 것처럼 취급돼 알림이 꺼졌다.
      ② **화면을 여는 것만으로 읽음 처리**했다 → 목록이 뜨기 전에 닫아도 알림만 사라졌다.
   → 이제 확인은 **사람이 [👀 확인함]을 누른 것**이고, 기록은 **시트(발주_확인 탭)** 에 남는다.
   ⚠️ 알림(배지·팝업)이 붙는 대상은 **아직 처리 안 된(접수) 발주**다. 당일 시트로 나갔거나
      취소된 건은 이미 결말이 난 것이라 알림에서 빠진다 — 카드의 '누가 봤나' 표시는 그대로 남는다. */
let ACKON = false;               // 웹앱이 확인 기능을 아는 버전인가 (구버전이면 옛 방식으로 돈다)
let MASTERS = [];                // 확인해야 할 사람들 — 계정 시트에서 권한이 '마스터'인 전원
let ACKS = {};                   // 발주번호 → [{id,name,at}]
let MEID = '';
const lower = s => S(s).toLowerCase();
// '마스터 유통(찬화)' → '찬화'. 카드에 이름 두 개가 나란히 붙어서 짧아야 읽힌다.
function nick(name){ const m = S(name).match(/\(([^)]+)\)/); return m ? m[1] : S(name); }
function takeAcks(j){
  ACKON = !!(j && j.masters && j.masters.length);
  if(!ACKON) return;
  MASTERS = j.masters; ACKS = j.acks || {}; MEID = lower(j.meId || (ME && ME.id));
}
function ackedBy(no){ return (ACKS[S(no)] || []).map(a => lower(a.id)); }
function ackMissing(no){ const done = ackedBy(no); return MASTERS.filter(m => done.indexOf(lower(m.id)) < 0); }
function ackedMe(no){ return ackedBy(no).indexOf(MEID) >= 0; }
// 발주번호 → 그 묶음의 줄들
function groupNos(rows){
  const m = new Map();
  (rows || []).forEach(r => { const k = S(r.no); if(!m.has(k)) m.set(k, []); m.get(k).push(r); });
  return m;
}
// 아직 처리 안 된(접수) 묶음인가 — 취소·전송완료는 알림 대상이 아니다
function pending(list){
  const live = list.filter(r => S(r.state) !== '취소');
  return !!live.length && !live.every(r => S(r.state) === '완료');
}
// 🔔 알림에 걸릴 발주 = 아직 처리 안 됐고, 둘 중 하나라도 확인 안 누른 것
function unackNos(rows){
  const out = [];
  groupNos(rows).forEach((list, no) => { if(pending(list) && ackMissing(no).length) out.push(no); });
  return out;
}
// 카드의 NEW = 내가 아직 안 누른 미처리 발주 (상대만 안 누른 건 NEW 없이 '미확인' 표시만)
function newSet(rows){
  if(!ACKON){ const s = seenSet(); return new Set((rows || []).map(r => S(r.no)).filter(no => !s.has(no))); }
  const out = new Set();
  groupNos(rows).forEach((list, no) => { if(pending(list) && !ackedMe(no)) out.add(no); });
  return out;
}
/* 카드 아래 '누가 봤나' 한 줄 — 누가 안 봤는지가 한눈에 보여야 서로 미루지 않는다 */
function ackLine(no){
  const done = ACKS[S(no)] || [];
  const chips = MASTERS.map(m => {
    const hit = done.filter(a => lower(a.id) === lower(m.id))[0];
    return hit ? '<span class="ackok">✅ ' + esc(nick(m.name)) + ' <b>' + esc(short(hit.at)) + '</b></span>'
               : '<span class="ackno">⬜ ' + esc(nick(m.name)) + ' 미확인</span>';
  }).join('');
  return '<div class="ackline">' + chips
    + (ackedMe(no) ? '' : '<button class="ordb2 ackb" data-oack="' + esc(no) + '">👀 확인했습니다</button>')
    + '</div>';
}
function seenSet(){ try{ return new Set(JSON.parse(localStorage.getItem(SEENK) || '[]')); }catch(e){ return new Set(); } }
function seenSave(s){ try{ localStorage.setItem(SEENK, JSON.stringify(Array.from(s).slice(-800))); }catch(e){} }
function seenMarkAll(){
  const s = seenSet();
  LIST.forEach(r => s.add(S(r.no)));
  seenSave(s);
  badgeOrders(0);
  popHide();
}
function badgeOrders(n){
  const b = document.getElementById('ordsBadge');
  if(!b) return;
  b.textContent = n > 99 ? '99+' : String(n);
  b.style.display = n ? '' : 'none';
}
function popHide(){ const p = document.getElementById('ordpop'); if(p) p.remove(); }
function popShow(groups, total){
  css();                                   // 발주 화면을 안 거쳐도 스타일이 있어야 한다
  popHide();
  const d = document.createElement('div');
  d.className = 'ordpop'; d.id = 'ordpop';
  const names = groups.slice(0, 3).map(g => '<b>' + esc(g.name || '이름없음') + '</b> ' + g.cnt + '건').join(' · ')
    + (groups.length > 3 ? ' 외 ' + (groups.length - 3) + '곳' : '');
  d.innerHTML = '<button class="opx" title="닫기">✕</button>'
    + '<div class="opt">' + (ACKON ? '👀 확인 안 한 발주 ' + total + '건' : '🔔 새 발주 ' + total + '건이 들어왔습니다') + '</div>'
    + '<div class="opl">' + names + '</div>'
    + '<div class="oph">눌러서 발주 내역 확인 →</div>';
  d.onclick = e => {
    if(e.target.closest && e.target.closest('.opx')){ popHide(); return; }   // ✕는 닫기만 — 배지는 남는다
    popHide();
    if(location.hash.replace(/^#/, '') === 'orders') reloadOrders();
    else location.hash = 'orders';
  };
  document.body.appendChild(d);
}
let PBUSY = false;
async function pollOrders(){
  if(PBUSY || document.hidden) return;
  if(!hasApi() || !amMaster()) return;
  PBUSY = true;
  try{
    const j = await api('list', {token: ME.token});
    const rows = j.rows || [];
    takeAcks(j);
    const byNo = groupNos(rows);
    let unseen;
    if(ACKON){
      // 👀 둘 중 하나라도 [확인함]을 안 누른 미처리 발주 — 눌러야만 꺼진다
      unseen = unackNos(rows);
    } else {
      /* 구버전 웹앱이 붙어 있는 동안의 옛 방식 (화면을 열면 읽음) — 웹앱을 새로 배포하면 위로 넘어간다 */
      const first = (localStorage.getItem(SEENK) == null);
      const seen = seenSet();
      if(first){
        byNo.forEach((list, no) => { if(!list.some(r => r.state === '접수')) seen.add(no); });
        seenSave(seen);
      }
      unseen = Array.from(byNo.keys()).filter(no => !seen.has(no));
    }
    badgeOrders(unseen.length);
    if(!unseen.length){ NOTIFIED = new Set(); return; }
    const fresh = unseen.filter(no => !NOTIFIED.has(no));
    if(!fresh.length) return;
    fresh.forEach(no => NOTIFIED.add(no));
    const freshCnt = fresh.reduce((a, no) => a + byNo.get(no).length, 0);
    // 발주 내역을 보고 있는 중이면 팝업 대신 목록을 바로 새로 그린다 — 단, 수정 중엔 건드리지 않는다
    if(location.hash.replace(/^#/, '') === 'orders' && !EDIT_NO){
      toast('🔔 새 발주 ' + freshCnt + '건 — 목록을 새로 불러왔습니다');
      reloadOrders();
      return;
    }
    // 업체별로 묶어서 보여준다 (같은 업체가 연달아 넣으면 한 줄로)
    const agg = new Map();
    unseen.forEach(no => { const l = byNo.get(no); const nm = S(l[0].cname) || '이름없음'; agg.set(nm, (agg.get(nm) || 0) + l.length); });
    const total = unseen.reduce((a, no) => a + byNo.get(no).length, 0);
    popShow(Array.from(agg, x => ({name: x[0], cnt: x[1]})), total);
  }catch(e){ /* 조용히 넘긴다 — 다음 확인 때 다시 */ }
  finally{ PBUSY = false; }
}
setTimeout(pollOrders, 2500);                       // 들어오자마자 한 번
setInterval(pollOrders, 60000);                     // 이후 1분마다
document.addEventListener('visibilitychange', () => { if(!document.hidden) setTimeout(pollOrders, 400); });

// ── 엑셀 양식 · 붙여넣기 ─────────────────────────────────────────
function template(){
  const rows = [HEADS, ['', '(카탈로그에 있는 상품명 그대로)', '1', '홍길동', '서울시 ○○구 ○○로 12, 101동 202호', '010-0000-0000', '부재시 경비실']];
  const csv = '﻿' + rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8'}));
  a.download = '마스터유통_발주양식.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
/* ══════════════════════════════════════════════════════════════════
   🔄 업체 양식 그대로 변환 (마스터 대신 발주 전용) — 홍팀장 2026-08-24
     "우리 양식이 아니라 업체에서 주는 양식으로 바로 넣을 거야.
      최대한 우리 양식으로 수정해서 발주 넣어줘야 해."
   ──────────────────────────────────────────────────────────────────
   발주서 변환기(index.html)의 엔진을 그대로 쓴다(convert-core.js).
   업체별 예외 처리(혜인·빅피시·365바겐·식봄·배민대용량·킹콩·카톡세로·게시판·라벨세로형…)가
   전부 살아 있어야 하므로 여기서 다시 짜지 않는다. 엔진은 index.html 에서 자동 추출된다 —
   변환기를 고쳤으면 `claude/github/발주변환엔진_추출.js` 를 다시 돌릴 것.

   🔴 변환기 출력(9칸/10칸 완성행)을 그대로 시트로 보내지 않고 **발주 표로 되돌린다.**
      상품명 완전일치 검증·합포장·마감시간 판정을 이 화면이 다시 하기 위해서다.
      변환만 믿고 바로 내보내면 카탈로그에 없는 이름이 조용히 시트로 들어간다. */
const hasEngine = () => { try{ return !!(window.CONVERT && window.CONVERT.convert); }catch(e){ return false; } };

/* 변환기 완성행 → 발주 표 행
   9칸  [정산][주소][연락처][창고][상품][성함][주소][연락처][메시지]
   10칸 [정산][송장][주소][연락처][창고][상품][성함][주소][연락처][메시지]
   ⚠️ 합포장(' / ')은 표에서 다시 줄로 나눈다 — 한 줄 = 한 상품이라야 상품명 검증이 걸린다. */
function rowsFromConverted(cols){
  const out = [], bizes = [];
  (cols || []).forEach(c => {
    if(!c || c.length < 9) return;
    const ten  = c.length >= 10;
    const pay  = S(c[0]);                       // 정산업체명 — 어느 업체 발주인지 확인용
    if(pay && bizes.indexOf(pay) < 0) bizes.push(pay);
    const biz  = ten ? S(c[1]) : '';            // 송장업체명(있을 때만 표 첫 칸)
    const prod = S(c[ten ? 5 : 4]);
    const rcv  = S(c[ten ? 6 : 5]);
    const addr = S(c[ten ? 7 : 6]);
    const tel  = S(c[ten ? 8 : 7]);
    const msg  = S(c[ten ? 9 : 8]);
    if(!prod && !rcv && !addr) return;
    prod.split(' / ').forEach(seg => {
      seg = S(seg);
      if(!seg) return;
      // '상품명 x 3' → 이름·수량 분리. 뒤에 괄호 옵션이 붙어 있으면 이름에 그대로 둔다.
      const m = seg.match(/^(.*?)\s*[x×X]\s*(\d+)\s*$/);
      out.push({ biz: biz, name: S(m ? m[1] : seg), qty: m ? m[2] : '1', rcv: rcv, addr: addr, tel: tel, msg: msg });
    });
  });
  return { rows: out, bizes: bizes };
}

/* 📂 파일 → 원문 칸에 펼치고 바로 변환.
   🔴 파일 내용을 화면에 보여준 뒤 변환한다 — 뭐가 들어갔는지 안 보이면 틀려도 모른다. */
async function convertFile(file){
  const box = document.getElementById('ord_cv'), logEl = document.getElementById('ord_cvlog');
  if(logEl) logEl.innerHTML = '<div class="hint">📖 ' + esc(file.name) + ' 읽는 중…</div>';
  try{
    const raw = await fileToRaw(file);
    if(!S(raw)){ logEl.innerHTML = '<div class="ordwarn">파일이 비어 있습니다 — ' + esc(file.name) + '</div>'; return; }
    box.value = raw;
    runConvert(false);
    // 어느 파일에서 온 건지 결과 위에 남긴다(여러 업체 파일을 연달아 넣을 때 헷갈리지 않게)
    logEl.innerHTML = '<div class="hint">📂 ' + esc(file.name) + '</div>' + logEl.innerHTML;
  }catch(e){
    logEl.innerHTML = '<div class="ordwarn">' + esc(e.message || String(e)) + '</div>';
  }
}

/* 변환 실행 — 붙여넣은 원문을 변환기 엔진에 넘기고, 결과를 표에 채운다.
   append=true 면 기존 줄 아래에 이어붙인다(여러 업체 발주를 한 번에 처리할 때). */
function runConvert(append){
  const box = document.getElementById('ord_cv'), logEl = document.getElementById('ord_cvlog');
  const raw = box ? box.value : '';
  if(!S(raw)){ toast('붙여넣은 내용이 없습니다'); return; }
  if(!hasEngine()){ toast('변환 엔진을 못 불러왔습니다'); return; }

  const r = window.CONVERT.convert(raw);
  if(r.error){ logEl.innerHTML = '<div class="ordwarn">변환 중 오류 — ' + esc(r.error) + '</div>'; return; }
  const got = rowsFromConverted(r.cols);
  if(!got.rows.length){
    logEl.innerHTML = '<div class="ordwarn">읽어낸 발주가 없습니다.'
      + (r.log ? '<br><span class="hint">변환기 메시지: ' + esc(r.log) + '</span>' : '')
      + '<br><span class="hint">업체 양식이 처음 보는 형태일 수 있습니다 — 발주서 변환기에서 먼저 돌려보고, 거기서도 안 되면 알려주세요.</span></div>';
    return;
  }

  // 기존 줄 중 빈 줄은 버리고 채운다(처음 화면의 빈 3줄이 그대로 남지 않게)
  const keep = append ? ROWS.filter(x => FIELDS.some(f => S(x[f]))) : [];
  ROWS = keep.concat(got.rows);
  saveDraft(); paint();

  /* 🔴 어느 업체 발주인지 확인시킨다 — 조용히 FOR 를 덮어쓰지 않는다.
     정산업체명이 잘못 박히면 그대로 시트로 나가고, 그건 되돌리기 어렵다. */
  const notes = [];
  if(got.bizes.length > 1){
    notes.push('<div class="ordwarn">⚠️ 원문에 업체가 <b>' + got.bizes.length + '곳</b> 섞여 있습니다 — <b>' + esc(got.bizes.join(', ')) + '</b>'
      + '<br>대신 발주는 <b>한 업체씩</b> 넣어야 정산업체명이 정확합니다. 업체별로 나눠서 다시 넣어주세요.</div>');
  } else if(got.bizes.length === 1){
    const read = got.bizes[0], cur = FOR && FOR.name ? FOR.name : '';
    const same = cur && read.replace(/\s/g, '') === cur.replace(/\s/g, '');
    if(!cur) notes.push('<div class="ordwarn">📌 원문에서 <b>' + esc(read) + '</b> 발주로 읽었습니다 — 위에서 <b>어느 업체 발주인지</b> 골라주세요.</div>');
    else if(!same) notes.push('<div class="ordwarn">⚠️ 원문은 <b>' + esc(read) + '</b> 발주인데, 위에 고른 업체는 <b>' + esc(cur) + '</b> 입니다. 맞는지 확인하세요.</div>');
  }
  // 변환기의 원문 대조(누락 감지) 결과를 그대로 보여준다 — 이게 누락 사고를 잡는 자리다
  if(r.recon && r.recon.html) notes.push('<div class="ordrecon ' + esc(r.recon.state || '') + '">' + r.recon.html + '</div>');
  if(r.log) notes.push('<div class="hint">변환기: ' + esc(r.log) + '</div>');
  logEl.innerHTML = notes.join('');

  toast(got.rows.length + '줄 가져왔습니다');
  const bad = ROWS.filter(x => FIELDS.some(f => S(x[f])) && checkRow(x).errs.length).length;
  if(bad) toast(bad + '줄은 상품명 확인이 필요합니다');
}

/* 붙여넣기 파싱 — 탭(엑셀 복사) 우선, 없으면 쉼표. */
function parsePaste(text){
  const lines = [];
  String(text || '').split(/\r?\n/).forEach(line => {
    if(!S(line)) return;
    lines.push((line.indexOf('\t') >= 0 ? line.split('\t') : splitCsv(line)).map(c => S(c).replace(/^"(.*)"$/, '$1')));
  });
  return rowsFromCells(lines);
}
/* 🧹 배송메시지 정리 (2026-08-24 지투지샵).
   업체 파일에 따라 배송메모 칸에 우리한테 필요 없는 게 딸려 온다 —
   창고명, 주문처 연락처, 안심번호가 한 번 더 박혀 있고 `[고객배송메모]` 뒤에 진짜 메모가 붙는다.
   홍팀장: **"고객 배송메모가 아닌 이상 배송메모 그냥 빼버려."**
     ① `[…]` 태그가 있으면 그 뒤만 남긴다
     ② 남은 게 번호뿐이거나 창고명이면 버린다 (기사님이 읽을 말이 아니다)
   ⚠️ 태그 없이 제대로 쓴 메모("부재 시 문 앞에")는 그대로 둔다. */
function cleanMsg(v){
  let t = S(v);
  if(!t) return '';
  const m = t.match(/\[[^\]]*메모[^\]]*\]\s*([\s\S]*)$/);
  if(m) t = S(m[1]);
  else t = S(t.replace(/\[[^\]]{0,20}\]/g, ''));       // 그 밖의 대괄호 표시는 떼어낸다
  if(!t) return '';
  if(!/[가-힣a-zA-Z]/.test(t)) return '';               // 숫자·기호뿐 = 연락처가 딸려온 것
  const bare = pkey(t);
  if(prodIndex() && (WHS || []).some(w => pkey(w) === bare || pkey(w + '창고') === bare)) return '';
  return t;
}

/* 셀 배열 → 발주 행. 붙여넣기·파일 둘 다 여기로 모인다.
   6칸으로 들어오면(업체명 생략) 첫 칸이 우리 상품일 때만 업체명이 빠진 것으로 본다 — 추측하지 않기 위해. */
function rowsFromCells(lines){
  const out = [];
  lines.forEach(raw => {
    let cells = (raw || []).map(c => S(c));
    if(!cells.join('')) return;
    const joined = cells.join('');
    if(/상품명/.test(joined) && /수량/.test(joined)) return;                 // 머리글 줄
    if(/카탈로그에 있는 상품명 그대로/.test(joined)) return;                  // 양식의 예시 줄
    if(cells.length === 6 && findProd(cells[0]).p) cells = [''].concat(cells);
    while(cells.length < 7) cells.push('');
    const r = blank();
    FIELDS.forEach((f, i) => { r[f] = S(cells[i]); });
    r.msg = cleanMsg(r.msg);      // 창고명·연락처가 딸려온 배송메모는 여기서 걷어낸다
    if(FIELDS.some(f => S(r[f]))) out.push(r);
  });
  return out;
}

/* 📂 파일 넣기 — 업체는 자기 쇼핑몰에서 받은 표를 그대로 올린다.
   양식을 받아 내용만 다시 복사·붙여넣게 하면 귀찮다(사장님 2026-08-20).
   · CSV/TSV는 그 자리에서 읽는다(브라우저만으로 충분)
   · 엑셀(xlsx)은 읽는 도구를 그때 한 번만 불러온다. 못 부르면 CSV로 저장해 달라고 안내한다. */
function readFile(file){
  const name = (file.name || '').toLowerCase();
  if(/\.(xlsx|xls)$/.test(name)) return readExcel(file);
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(parsePaste(String(fr.result || '').replace(/^﻿/, '')));
    fr.onerror = () => rej(new Error('파일을 읽지 못했습니다.'));
    fr.readAsText(file, 'utf-8');
  });
}
let _xlsx = null;
function loadXlsx(){
  if(window.XLSX) return Promise.resolve(window.XLSX);
  if(_xlsx) return _xlsx;
  _xlsx = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = () => res(window.XLSX);
    s.onerror = () => rej(new Error('엑셀 파일을 읽는 도구를 불러오지 못했습니다. 엑셀에서 [다른 이름으로 저장 → CSV]로 저장해 올려주시거나, 표를 복사해 붙여넣기로 넣어주세요.'));
    document.head.appendChild(s);
  });
  return _xlsx;
}
async function readExcel(file){
  const X = await loadXlsx();
  const buf = await file.arrayBuffer();
  const wb = X.read(buf, {type:'array'});
  const sh = wb.Sheets[wb.SheetNames[0]];
  const grid = X.utils.sheet_to_json(sh, {header:1, raw:false, defval:''});
  return rowsFromCells(grid);
}

/* 📂 업체 양식 변환용 파일 읽기 — 여기서는 **행으로 쪼개지 않고 원문 텍스트로** 돌려준다.
   변환기 엔진이 스스로 양식을 알아봐야 하기 때문(칸 순서를 우리가 정하는 게 아니다).
   홍팀장 2026-08-24: "카톡 같은 건 어쩔 수 없이 복붙이지만 파일로 주는 데도 있어."
   · 엑셀 → 첫 시트를 탭 구분 표로 펴서 넘긴다(변환기가 제일 잘 읽는 모양)
   · CSV/TSV/TXT → 손대지 않고 그대로 넘긴다(따옴표 삼킴 복구까지 변환기가 한다) */
async function fileToRaw(file){
  const name = (file.name || '').toLowerCase();
  if(/\.(xlsx|xls)$/.test(name)){
    const X = await loadXlsx();
    const wb = X.read(await file.arrayBuffer(), {type:'array'});
    const sh = wb.Sheets[wb.SheetNames[0]];
    const grid = X.utils.sheet_to_json(sh, {header:1, raw:false, defval:''});
    return grid.map(r => (r || []).map(c => S(c)).join('\t'))
               .filter(l => l.replace(/\t/g, '').trim())      // 통째로 빈 줄은 버린다
               .join('\n');
  }
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result || '').replace(/^﻿/, ''));
    fr.onerror = () => rej(new Error('파일을 읽지 못했습니다.'));
    fr.readAsText(file, 'utf-8');
  });
}
function splitCsv(line){
  const out = []; let cur = '', q = false;
  for(let i = 0; i < line.length; i++){
    const ch = line[i];
    if(ch === '"'){ if(q && line[i+1] === '"'){ cur += '"'; i++; } else q = !q; }
    else if(ch === ',' && !q){ out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

// ── 업체 정보 저장 ──────────────────────────────────────────────
/* 웹앱이 붙어 있으면 웹앱이 쓴다(계정 시트는 브라우저가 아예 안 만진다).
   아직 안 붙었으면 예전 방식 — 계정 시트의 그 업체 행 두 칸만. 전체 교체가 아니라 안전하다. */
async function saveMeInfo(phone, addr){
  if(hasApi()){
    const j = await api('saveinfo', {token: ME.token, phone, addr});
    ME.phone = j.phone; ME.addr = j.addr;
    try{ localStorage.setItem(NS + 'catalog_auth_v1', JSON.stringify(ME)); }catch(e){}
    return;
  }
  const token = await getAccessToken();
  const range = "'" + ACC_TAB + "'!I" + ME.row + ":J" + ME.row;
  const r = await fetch('https://sheets.googleapis.com/v4/spreadsheets/' + DOGU_ID + '/values/' + encodeURIComponent(range) + '?valueInputOption=RAW',
    {method:'PUT', headers:{Authorization:'Bearer ' + token, 'Content-Type':'application/json'}, body:JSON.stringify({values:[[phone, addr]]})});
  const j = await r.json();
  if(j.error) throw new Error(j.error.message || '저장하지 못했습니다.');
  ME.phone = phone; ME.addr = addr;
  try{ localStorage.setItem(NS + 'catalog_auth_v1', JSON.stringify(ME)); }catch(e){}
}

/* 👥 대신 발주 — 업체 고르기 칸의 이벤트. 카드를 다시 그릴 때마다 붙인다. */
function bindFor(){
  const $$ = id => document.getElementById(id);
  const redraw = () => { const b = $$('ordfor'); if(b){ b.outerHTML = forCard(); bindFor(); } paint(); };
  /* 🔎 쳐서 찾기 — 업체명·아이디 어느 쪽으로 쳐도 걸리게. 공백은 무시한다(업체명 띄어쓰기가 제각각이라).
     ⚠️ 입력칸 자체는 다시 그리지 않는다(그리면 글자 칠 때마다 커서가 튄다) — 후보 목록만 갈아끼운다. */
  const q = $$('for_q'), list = $$('for_list');
  if(q && list){
    const norm = s => S(s).replace(/\s+/g, '').toLowerCase();
    let hits = [];
    const draw = () => {
      /* 🔎 자동완성 — 띄어쓰기는 무시하고 찾는다("청년 수산"으로 쳐도 "청년수산"이 걸리게).
         찾은 업체는 **연락처·출고지까지 그 자리에서** 보여준다. 이름만 뜨면
         "등록된 업체인지 아닌지" 확인이 안 된다(홍팀장 2026-08-21). */
      const kw = pkey(q.value);
      if(!kw){ list.innerHTML = ''; list.style.display = 'none'; hits = []; return; }
      hits = (CLIENTS || []).filter(c => pkey(c.name).indexOf(kw) >= 0 || pkey(c.id).indexOf(kw) >= 0).slice(0, 12);
      list.innerHTML = hits.length
        ? hits.map((c, i) => '<div class="foritem" data-fi="' + i + '">'
            + '<b>' + esc(c.name || c.id) + (c.src === '미가입'
                ? '<span class="ftag off">계정없음</span>'
                : '<span class="ftag on">가입</span>') + '</b>'
            + '<span>' + (S(c.phone) ? '☎ ' + esc(c.phone) : '<span class="fno">☎ 연락처 없음 — 넣어야 발주됩니다</span>')
            + (S(c.addr) ? ' · 📍 ' + esc(c.addr) : '') + '</span></div>').join('')
        : '<div class="foritem none"><b>「' + esc(S(q.value)) + '」 등록된 업체가 없습니다</b>'
            + '<span>처음 받는 업체면 아래 <b>[✍️ 계정 없는 업체 직접 넣기]</b>로 넣고 저장하세요</span></div>';
      list.style.display = '';
    };
    const pick = c => {
      FOR = {id:c.id, name:c.name, addr:c.addr, phone:c.phone};
      saveFor(); redraw();
    };
    q.oninput = draw;
    q.onfocus = draw;
    q.onkeydown = e => { if(e.key === 'Enter'){ e.preventDefault(); if(hits.length) pick(hits[0]); } };
    list.onmousedown = e => {          // click이면 blur가 먼저 나 목록이 닫힌다
      const it = e.target.closest && e.target.closest('[data-fi]');
      if(!it) return;
      e.preventDefault();
      pick(hits[+it.getAttribute('data-fi')]);
    };
    q.onblur = () => setTimeout(() => { if(list) list.style.display = 'none'; }, 150);
  }
  const mb = $$('for_manual');
  if(mb) mb.onclick = () => {
    FOR = (FOR && FOR.manual) ? null : {id:'', name:'', addr:'', phone:'', manual:true};
    saveFor(); redraw();
  };
  // 💾 미가입 업체 저장 — 계정은 안 만든다(아이디·비번 없음). 대신 발주용 명부에만 올린다.
  const sv = $$('for_save');
  if(sv) sv.onclick = async () => {
    const nm = S($$('for_nm').value), ph = S($$('for_ph').value), ad = S($$('for_ad').value);
    const msg = $$('for_msg');
    if(!nm){ msg.textContent = '업체명을 넣어주세요.'; $$('for_nm').focus(); return; }
    if(!ph){ msg.textContent = '연락처를 넣어주세요. (주소는 선택입니다)'; $$('for_ph').focus(); return; }
    sv.disabled = true; msg.textContent = '저장 중…';
    try{
      const j = await api('saveclient', {token: ME.token, name: nm, phone: fmtTel(ph) || ph, addr: ad});
      const tel = fmtTel(ph) || ph;
      FOR = {id:'', name:nm, phone:tel, addr:ad};
      saveFor();
      // 목록에도 바로 반영 — 다시 불러오지 않아도 이 자리에서 검색된다
      if(Array.isArray(CLIENTS)){
        const i = CLIENTS.findIndex(c => pkey(c.name) === pkey(nm));
        const row = {id:'', name:nm, phone:tel, addr:ad, owner:'', src:'미가입'};
        if(i >= 0) CLIENTS[i] = row; else CLIENTS.push(row);
      }
      toast(j.updated ? nm + ' 정보를 갱신했습니다' : nm + ' 을(를) 명부에 올렸습니다');
      redraw();
    }catch(e){ msg.textContent = e.message || '저장하지 못했습니다'; sv.disabled = false; }
  };
  // 직접 입력칸은 타이핑할 때마다 다시 그리면 포커스가 튄다 → 값만 붙잡고 있다가 벗어날 때 반영
  ['for_nm','for_ph','for_ad'].forEach(id => {
    const el = $$(id);
    if(!el) return;
    el.onchange = () => {
      FOR = FOR || {manual:true};
      FOR.manual = true; FOR.id = '';
      FOR.name = S($$('for_nm') ? $$('for_nm').value : FOR.name);
      FOR.phone = S($$('for_ph') ? $$('for_ph').value : FOR.phone);
      FOR.addr = S($$('for_ad') ? $$('for_ad').value : FOR.addr);
      saveFor(); paint();
    };
  });
}

// ── 이벤트 ──────────────────────────────────────────────────────
function bind(){
  const $$ = id => document.getElementById(id);
  paint();
  if(amMaster()) bindFor();
  const on = (id, fn) => { const el = $$(id); if(el) el.onclick = fn; };
  on('ord_add', () => { ROWS.push(blank()); paint(); });
  on('ord_clr', () => { if(confirm('입력한 발주 내용을 전부 지울까요?')){ ROWS = [blank(), blank(), blank()]; OPEN = -1; paint(); } });
  on('ord_tpl', template);
  // 📂 파일 넣기 (엑셀·CSV). 같은 파일을 다시 고를 수 있게 value를 비운다.
  on('ord_pick', () => { const f = $$('ord_file'); if(f){ f.value = ''; f.click(); } });
  const fin = $$('ord_file');
  if(fin) fin.onchange = async () => {
    const file = fin.files && fin.files[0];
    if(!file) return;
    const btn = $$('ord_pick'); if(btn){ btn.disabled = true; btn.textContent = '읽는 중…'; }
    try{
      const got = await readFile(file);
      if(!got.length){ alert('가져올 내용이 없습니다. 첫 줄은 머리글이어도 되고, 업체명 / 상품명 / 수량 / 성함 / 주소 / 연락처 / 배송메시지 순서로 넣어주세요.'); }
      else{
        ROWS = ROWS.filter(r => FIELDS.some(f => S(r[f]))).concat(got);
        OPEN = -1; paint();
        toast(file.name + ' — ' + got.length + '줄 가져왔습니다');
      }
    }catch(e){ alert(e.message || '파일을 읽지 못했습니다.'); }
    finally{ if(btn){ btn.disabled = false; btn.textContent = '📂 파일 넣기'; } }
  };
  on('ord_paste', () => { const b = $$('ord_pastebox'); b.style.display = (b.style.display === 'none' ? '' : 'none'); if(b.style.display === '') $$('ord_pt').focus(); });
  // 🔄 업체 양식 그대로 넣기 (마스터)
  on('ord_conv', () => { const b = $$('ord_convbox'); b.style.display = (b.style.display === 'none' ? '' : 'none'); if(b.style.display === '') $$('ord_cv').focus(); });
  on('ord_cvno', () => { $$('ord_convbox').style.display = 'none'; $$('ord_cv').value = ''; $$('ord_cvlog').innerHTML = ''; });
  on('ord_cvok',  () => runConvert(false));
  on('ord_cvadd', () => runConvert(true));
  // 📂 파일로 받은 발주 — 파일을 고르면 원문 칸에 펼쳐 보여주고 바로 변환한다(무엇이 들어갔는지 눈으로 보게)
  on('ord_cvpick', () => $$('ord_cvfile').click());
  const cvf = $$('ord_cvfile');
  if(cvf) cvf.onchange = e => { const f = e.target.files[0]; e.target.value = ''; if(f) convertFile(f); };
  const dz = $$('ord_cvdrop');
  if(dz){
    ['dragenter','dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('on'); }));
    ['dragleave','drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('on'); }));
    dz.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if(f) convertFile(f); });
  }
  on('ord_ptno', () => { $$('ord_pastebox').style.display = 'none'; $$('ord_pt').value = ''; });
  on('ord_ptok', () => {
    const got = parsePaste($$('ord_pt').value);
    if(!got.length){ toast('가져올 내용이 없습니다'); return; }
    ROWS = ROWS.filter(r => FIELDS.some(f => S(r[f]))).concat(got);
    $$('ord_pt').value = ''; $$('ord_pastebox').style.display = 'none';
    paint(); toast(got.length + '줄 가져왔습니다');
  });
  bindMe();

  function redrawMe(){ const box = $$('ordme'); if(box){ box.outerHTML = meCard(); bindMe(); } }
  function bindMe(){
    const ed = $$('ord_edit');
    if(ed) ed.onclick = () => { EDIT = true; redrawMe(); };
    const cc = $$('ord_cancel');
    if(cc) cc.onclick = () => { EDIT = false; redrawMe(); };
    const sv = $$('ord_save');
    if(!sv) return;
    sv.onclick = async () => {
      const ph = S($$('ord_ph').value), ad = S($$('ord_ad').value);
      const msg = $$('ord_msg');
      if(D(ph).length < 9){ msg.textContent = '연락처를 정확히 넣어주세요.'; return; }
      // 출고지는 비워둔 채로도 저장된다 — 안 쓰는 업체가 있다 (사장님 2026-08-20)
      sv.disabled = true; msg.textContent = '저장 중…';
      try{
        await saveMeInfo(ph, ad);
        EDIT = false;
        redrawMe();
        toast('업체 정보를 저장했습니다');
        paint();
      }catch(e){
        msg.textContent = (e.message || '저장 실패') + ' — ' + TEL_HELP;
        sv.disabled = false;
      }
    };
  }
}

// 표 입력 (위임) — 다시 그리면 포커스가 날아가므로 입력 중엔 값만 담고, 검증은 잠깐 쉬었다 한다
let tmr = null;
document.addEventListener('input', e => {
  const el = e.target;
  if(!(el && el.matches && el.matches('.ordtbl input[data-f]'))) return;
  const i = +el.getAttribute('data-i'), f = el.getAttribute('data-f');
  if(!ROWS[i]) return;
  ROWS[i][f] = el.value;
  clearTimeout(tmr);
  tmr = setTimeout(() => {
    const pos = el.selectionStart, id = i + '|' + f;
    OPEN = -1;
    paint();
    const again = document.querySelector('.ordtbl input[data-i="' + i + '"][data-f="' + f + '"]');
    if(again){ again.focus(); try{ again.setSelectionRange(pos, pos); }catch(e2){} }
    void id;
  }, 500);
});

document.addEventListener('click', e => {
  const del = e.target.closest && e.target.closest('[data-del]');
  if(del){ ROWS.splice(+del.getAttribute('data-del'), 1); if(!ROWS.length) ROWS = [blank()]; OPEN = -1; paint(); return; }
  const pick = e.target.closest && e.target.closest('[data-pick]');
  if(pick){
    const i = +pick.getAttribute('data-i');
    if(ROWS[i]){ ROWS[i].name = pick.getAttribute('data-pick'); OPEN = -1; paint(); toast('상품을 바꿨습니다'); }
    return;
  }
  const cpx = e.target.closest && e.target.closest('[data-cpx]');
  if(cpx){
    const box = document.getElementById('ordoutbox');
    const o = box && box.__out;
    if(!o) return;
    const t = tsv(cpx.getAttribute('data-cpx') === '9' ? o.nine : o.ten);
    navigator.clipboard.writeText(t).then(() => toast('복사했습니다'), () => toast('복사하지 못했습니다'));
    return;
  }
  // 상태 필터 · 페이지 이동
  const fb = e.target.closest && e.target.closest('[data-ost2]');
  if(fb){ OST = fb.getAttribute('data-ost2'); OPAGE = 1; resetEdit(); syncFbtn(); ordersPaint(); return; }
  const pg = e.target.closest && e.target.closest('[data-opg]');
  if(pg && !pg.disabled){
    OPAGE = parseInt(pg.getAttribute('data-opg'), 10) || 1;
    resetEdit();
    ordersPaint();
    const t = document.getElementById('ordlist');
    if(t) window.scrollTo({top: Math.max(0, t.getBoundingClientRect().top + window.scrollY - 90), behavior:'smooth'});
    return;
  }
  // 전체 선택 체크박스
  const all = e.target.closest && e.target.closest('.ordall');
  if(all){
    document.querySelectorAll('.ordpick[data-no="' + all.getAttribute('data-no') + '"]').forEach(c => { c.checked = all.checked; });
    return;
  }
  /* 📤 당일 시트로 보내기 — 이 버튼 하나가 복사·붙여넣기·완료처리를 다 한다.
     누르는 즉시 잠가서 두 번 눌리는 일이 없게 한다(중복 발주 방지). */
  const op = e.target.closest && e.target.closest('[data-opush]');
  if(op){
    const no = op.getAttribute('data-opush');
    if(!confirm(no + ' 발주를 당일 시트로 보낼까요?\n\n보내고 나면 취소할 수 없고, 다시 보내지지도 않습니다.')) return;
    op.disabled = true; op.textContent = '보내는 중…';
    api('push', {token: ME.token, orderNo: no})
      .then(j => { toast(no + ' → 당일 시트 ' + j.col + j.row + '행에 ' + j.count + '줄'); reloadOrders(); })
      .catch(err => { alert(err.message || '보내지 못했습니다'); op.disabled = false; op.textContent = '📤 당일 시트로 보내기'; });
    return;
  }
  /* 👀 확인했습니다 — 내 이름으로 시트에 남는다. 상대가 아직 안 눌렀으면 알림은 그대로 켜져 있다. */
  const oak = e.target.closest && e.target.closest('[data-oack]');
  if(oak){
    const no = oak.getAttribute('data-oack');
    oak.disabled = true; oak.textContent = '확인 중…';
    api('ack', {token: ME.token, orderNo: no})
      .then(j => {
        if(j.masters){ MASTERS = j.masters; ACKS = j.acks || ACKS; ACKON = true; }
        NEWNOS = newSet(LIST);
        badgeOrders(unackNos(LIST).length);
        const left = ackMissing(no);
        toast(left.length ? no + ' 확인 — ' + left.map(m => nick(m.name)).join('·') + ' 팀장은 아직입니다'
                          : no + ' — 두 분 다 확인하셨습니다');
        ordersPaint();
      })
      .catch(err => { alert(err.message || '확인 처리를 하지 못했습니다'); oak.disabled = false; oak.textContent = '👀 확인했습니다'; });
    return;
  }
  /* ✏️ 선택한 줄 수정 — 체크한 줄이 그 자리에서 입력칸으로 바뀐다 */
  const oed = e.target.closest && e.target.closest('[data-oed]');
  if(oed){
    const no = oed.getAttribute('data-oed');
    const picked = Array.from(document.querySelectorAll('.ordpick[data-no="' + no + '"]:checked')).map(c => c.getAttribute('data-seq'));
    if(!picked.length){ alert('고칠 줄을 먼저 체크해 주세요.'); return; }
    EDIT_NO = no; EDIT_SEQ = picked;
    ordersPaint();
    const first = document.querySelector('.ein');
    if(first) first.focus();
    return;
  }
  const oecx = e.target.closest && e.target.closest('[data-oecx]');
  if(oecx){ EDIT_NO = ''; EDIT_SEQ = []; ordersPaint(); return; }
  const osv = e.target.closest && e.target.closest('[data-osave]');
  if(osv){
    const no = osv.getAttribute('data-osave');
    const edits = EDIT_SEQ.map(seq => {
      const g = f => { const el = document.querySelector('.ein[data-no="' + no + '"][data-seq="' + seq + '"][data-f="' + f + '"]'); return el ? S(el.value) : ''; };
      // 상품 칸은 이름은 그대로 두고 수량만 새로 조립한다
      const qs = Array.from(document.querySelectorAll('.qin[data-no="' + no + '"][data-seq="' + seq + '"]'));
      const prod = qs.length ? qs.map(q => q.getAttribute('data-name') + ' x ' + S(q.value)).join(' / ') : undefined;
      return {seq, prod, rcv:g('rcv'), addr:g('addr'), tel:(fmtTel(g('tel')) || S(g('tel'))), msg:g('msg')};
    });
    const badQ = edits.find(x => x.prod !== undefined && !/^(.+ x [1-9]\d*)( \/ .+ x [1-9]\d*)*$/.test(x.prod));
    if(badQ){ alert('수량은 1 이상 숫자로 넣어주세요.'); return; }
    const bad = edits.find(x => !x.rcv || !x.addr || !x.tel);
    if(bad){ alert('성함 · 주소 · 연락처는 비울 수 없습니다.'); return; }
    const badTel = edits.find(x => !fmtTel(x.tel));
    if(badTel && !confirm('연락처 "' + badTel.tel + '" 는 형식이 맞지 않아 보입니다. 그대로 저장할까요?')) return;
    osv.disabled = true; osv.textContent = '저장 중…';
    api('edit', {token: ME.token, orderNo: no, edits})
      .then(j => { EDIT_NO = ''; EDIT_SEQ = []; toast(j.count + '건 수정했습니다'); reloadOrders(); })
      .catch(err => { alert(err.message || '수정하지 못했습니다'); osv.disabled = false; osv.textContent = '💾 수정 완료'; });
    return;
  }
  // 선택한 줄만 취소 — 한 번에 여러 건 넣고 일부만 빼는 경우 (업체·마스터 공통)
  const ocn = e.target.closest && e.target.closest('[data-ocn]');
  if(ocn){
    const no = ocn.getAttribute('data-ocn');
    const picked = Array.from(document.querySelectorAll('.ordpick[data-no="' + no + '"]:checked')).map(c => c.getAttribute('data-seq'));
    if(!picked.length){ alert('취소할 줄을 먼저 체크해 주세요.'); return; }
    if(!confirm(no + ' 에서 체크하신 ' + picked.length + '건을 취소할까요?')) return;
    ocn.disabled = true;
    api('cancel', {token: ME.token, orderNo: no, seqs: picked})
      .then(j => { toast(j.count + '건 취소되었습니다'); reloadOrders(); })
      .catch(err => { alert(err.message || '취소하지 못했습니다'); ocn.disabled = false; });
    return;
  }
  // 카탈로그 카드의 [+ 발주담기]
  const ord = e.target.closest && e.target.closest('[data-ord]');
  if(ord){
    e.preventDefault();
    add(ord.getAttribute('data-ord'));
    return;
  }
});

/* 카탈로그에서 상품 담기 — 상품명을 타이핑하지 않게 만드는 것이 이 버튼의 존재 이유다. */
function add(name){
  if(!ROWS.length) ROWS = loadDraft();
  const empty = ROWS.find(r => !S(r.name) && !S(r.rcv) && !S(r.addr));
  if(empty){ empty.name = name; if(!S(empty.qty)) empty.qty = '1'; }
  else { const r = blank(); r.name = name; r.qty = '1'; ROWS.push(r); }
  saveDraft();
  toast('발주서에 담았습니다 — 🧾 발주하기에서 확인하세요');
  if(location.hash.replace(/^#/, '') === 'order') paint();
  badge();
}
// 메뉴의 발주 건수 배지 — 담아놓고 잊어버리지 않게
function badge(){
  const b = document.getElementById('ordCount');
  if(!b) return;
  // 마스터의 '대신 발주'는 카탈로그에서 담는 자리가 아니라 원문을 넣는 자리라 배지를 안 띄운다
  if(ME && ME.master){ b.style.display = 'none'; return; }
  const n = ROWS.filter(r => S(r.name)).length;
  b.textContent = n;
  b.style.display = n ? '' : 'none';
}

// 페이지를 새로 열어도 담아둔 게 있으면 메뉴 배지에 뜨게
window.addEventListener('load', () => { if(!ROWS.length) ROWS = loadDraft(); badge(); });

// _build·_check는 검증용 출구다(브라우저 없이 변환 결과를 확인할 때 쓴다). 화면 동작과 무관.
window.ORDER = {view, bind, add, orders: ordersView, ordersBind, rows: () => ROWS, _build: buildOut, _check: checkRow,
                _fromConverted: rowsFromConverted, _setRows: r => { ROWS = r; }};
})();
