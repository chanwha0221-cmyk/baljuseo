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
  const n = D(raw);
  if(!n) return null;
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

  const ad = S(r.addr);
  if(!ad) errs.push('받는분 주소를 넣어주세요.');
  else if(ad.length < 10 || !/\d/.test(ad)) errs.push('주소가 너무 짧습니다. 건물·동·호수까지 넣어주세요.');

  const tel = D(r.tel), telFix = fmtTel(r.tel);
  if(!tel) errs.push('받는분 연락처를 넣어주세요.');
  else if(!telFix) errs.push('연락처를 다시 확인해 주세요 (' + tel.length + '자리). 010-0000-0000 처럼 넣어주시면 됩니다.');
  else if(telFix !== S(r.tel)) warns.push('☎ 연락처는 ' + telFix + ' 로 정리해서 넣습니다.');

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
  const me = (typeof ME !== 'undefined' && ME) ? ME : {name:'', addr:'', phone:''};
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
    if(g.biz) ten.push([me.name || '', g.biz, me.addr || '', myTel, '', prod, g.rcv, g.addr, tel, g.msg]);
    else      nine.push([me.name || '', me.addr || '', myTel, '', prod, g.rcv, g.addr, tel, g.msg]);
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
.ordst{font-size:11px;font-weight:800;padding:2px 8px;border-radius:20px;vertical-align:middle;margin-left:4px}
.ordst.new{background:var(--soft);color:var(--accent-d)}
.ordst.go{background:color-mix(in srgb,var(--gold) 16%,transparent);color:var(--gold)}
.ordst.no{background:color-mix(in srgb,var(--up) 12%,transparent);color:var(--up)}
.ordpaste{width:100%;min-height:120px;border:1.5px solid var(--line);border-radius:10px;padding:10px 12px;font-size:13px;background:var(--card);color:var(--ink);font-family:inherit;outline:none}
.ordpaste:focus{border-color:var(--accent)}
.ordb{margin-top:6px;width:100%;border:1.5px solid var(--accent);background:var(--soft);color:var(--accent-d);padding:6px 0;border-radius:9px;font-size:12px;font-weight:800;cursor:pointer;font-family:inherit}
.ordb:hover{background:var(--accent);color:#fff}
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
    return '<div class="ordbox" id="ordme">'
      + '<h3>📇 업체 정보를 한 번만 넣어주세요</h3>'
      + '<div class="hint">발주서의 <b>주문처 연락처·출고지</b>로 들어갑니다. 한 번 넣으시면 다음 발주부터는 자동으로 채워지고, 언제든 수정하실 수 있습니다.<br><b>출고지를 안 쓰시는 업체는 비워두셔도 발주 가능합니다.</b></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px">'
      + '<div><span class="k" style="font-size:11.5px;color:var(--muted)">업체명</span><input class="ordin" value="' + esc(me.name || '') + '" disabled></div>'
      + '<div><span class="k" style="font-size:11.5px;color:var(--muted)">연락처</span><input class="ordin" id="ord_ph" value="' + esc(me.phone || '') + '" placeholder="02-000-0000 / 010-0000-0000"></div>'
      + '<div style="grid-column:1/-1"><span class="k" style="font-size:11.5px;color:var(--muted)">출고지 주소 <b style="color:var(--accent-d)">(선택 — 안 쓰시면 비워두세요)</b></span><input class="ordin" id="ord_ad" value="' + esc(me.addr || '') + '" placeholder="안 쓰시는 업체는 비워두셔도 발주 가능합니다"></div>'
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

function view(){
  css();
  // 마스터가 주소로 직접 들어온 경우 — 발주는 업체가 넣는 것이다(위 renderUser 주석 참조)
  if(ME && ME.master){
    return subHead('🧾 발주하기', '')
      + '<div class="ordwrap"><div class="ordbox"><h3>여기는 업체가 발주를 넣는 화면입니다</h3>'
      + '<div class="hint">마스터 계정으로 발주를 넣으면 <b>정산 업체명이 관리자 계정 이름으로 박힙니다.</b><br>'
      + '들어온 발주는 <b>📋 발주 내역</b>에서 보시면 됩니다.<br>'
      + '업체 화면 그대로 확인하시려면 <b>테스트용 업체 계정</b>으로 로그인해 주세요.</div></div></div>';
  }
  if(!ROWS.length){ ROWS = loadDraft(); }
  if(!ROWS.length){ ROWS = [blank(), blank(), blank()]; }
  return subHead('🧾 발주하기', '카탈로그 상품을 담거나, 엑셀에서 복사해 붙여넣으세요')
    + '<div class="ordwrap">'
    + meCard()
    + '<div class="ordbox">'
    +   '<h3>발주서</h3>'
    // 📢 안내는 업체가 실제로 읽어야 뜻이 있다 — 특히 업체명 칸은 가장 크게 (사장님 2026-08-20)
    +   '<div class="ordtip big">📮 <b>송장에 다른 이름으로 나가야 하는 업체만</b> 맨 앞 <b>업체명</b> 칸을 적어주세요.'
    +      '<span>택배 송장에 <b>지금 로그인하신 업체명이 아닌 다른 이름</b>이 찍혀야 하는 경우입니다. 필요 없으시면 <b>비워두세요</b> — 비워두시면 로그인하신 업체명으로 나갑니다.</span></div>'
    +   '<div class="ordtip">🔎 상품명은 <b>카탈로그에 있는 이름 그대로</b>여야 합니다.'
    +      '<span>헷갈리시면 카탈로그에서 <b>[+ 발주담기]</b>를 누르시면 정확한 이름이 그대로 들어갑니다.</span></div>'
    +   '<div class="ordtip">📦 같은 분께 가는 여러 상품은 <b>줄을 나눠</b> 적어주세요.'
    +      '<span>같은 주소 · 같은 창고 상품이면 저희가 <b>합포장으로 묶어드립니다</b>.</span></div>'
    +   '<div class="ordbar">'
    +     '<button class="ordb2" id="ord_tpl">📥 발주 양식 받기</button>'
    +     '<button class="ordb2" id="ord_paste">📋 엑셀에서 붙여넣기</button>'
    +     '<button class="ordb2" id="ord_add">+ 줄 추가</button>'
    +     '<button class="ordb2" id="ord_clr">🗑 전체 비우기</button>'
    +   '</div>'
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
  h += '<div class="ordbar" style="margin-top:12px">'
    + (hasApi()
        ? '<button class="ordb2 pri" id="ord_submit">🧾 이대로 발주 넣기</button><span class="hint" id="ord_smsg" style="align-self:center"></span>'
        : '<button class="ordb2 pri" disabled>🧾 발주 넣기 (준비 중)</button><span class="hint" style="align-self:center">발주 접수는 곧 열립니다. 지금은 위 발주서를 복사해 보내주세요.</span>')
    + '</div>';
  box.innerHTML = h;
  box.__out = o;
  const sb = document.getElementById('ord_submit');
  if(sb) sb.onclick = submit;
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
  if(!confirm(items.length + '건을 발주로 넣을까요?\n\n넣으신 뒤에도 저희가 처리에 들어가기 전까지는 취소하실 수 있습니다.')) return;
  sb.disabled = true; sb.textContent = '보내는 중…'; if(msg) msg.textContent = '';
  try{
    const j = await api('submit', {token: ME.token, items});
    ROWS = [blank(), blank(), blank()];
    OPEN = -1;
    saveDraft();
    paint();
    toast('발주 ' + j.orderNo + ' 접수되었습니다');
    location.hash = 'orders';
  }catch(e){
    if(msg) msg.textContent = (e.message || '보내지 못했습니다') + ' — ' + TEL_HELP;
    sb.disabled = false; sb.textContent = '🧾 이대로 발주 넣기';
  }
}

// ── 발주 내역 (업체는 자기 것만 · 마스터는 전체) ─────────────────
/* 🔴 걸러내는 일은 웹앱이 한다. 이 화면은 받은 것을 그리기만 한다 —
   브라우저에서 거르는 방식이면 "안 보이게 한 것"일 뿐 "못 보게 한 것"이 아니다. */
async function ordersView(){
  if(!hasApi()) return subHead('📋 발주 내역', '') + '<div class="empty">발주 접수가 아직 열리지 않았습니다.</div>';
  const master = !!(ME && ME.master);
  const j = await api('list', {token: ME.token});
  const rows = j.rows || [];
  LIST = rows;
  const byNo = new Map();
  rows.forEach(r => { if(!byNo.has(r.no)) byNo.set(r.no, []); byNo.get(r.no).push(r); });
  let h = subHead(master ? '📋 전체 발주 내역' : '📋 내 발주 내역', master ? '마스터 계정 — 모든 업체의 발주가 보입니다' : '내가 넣은 발주만 보입니다');
  if(!rows.length) return h + '<div class="empty">아직 발주 내역이 없습니다.</div>';
  h += '<div class="ordwrap">';
  byNo.forEach((list, no) => {
    const f = list[0];
    const st = f.state || '접수';
    h += '<div class="ordbox">'
      + '<h3>' + esc(no) + ' <span style="font-weight:600;color:var(--muted);font-size:11.5px">' + esc(f.at) + ' · ' + list.length + '건</span>'
      + ' <span class="ordst ' + (st === '취소' ? 'no' : (st === '접수' ? 'new' : 'go')) + '">' + esc(st) + '</span>'
      + (master ? ' <span style="font-size:12px;color:var(--muted)">— ' + esc(f.cname) + '</span>' : '') + '</h3>'
      + '<div class="ordtblwrap"><table class="ordtbl"><thead><tr>'
      + (master ? '<th>송장업체</th>' : '')
      + '<th>상품</th><th>성함</th><th>주소</th><th>연락처</th><th>배송메시지</th></tr></thead><tbody>'
      + list.map(r => '<tr>' + (master ? '<td>' + esc(r.biz) + '</td>' : '')
          + '<td>' + esc(r.prod) + '</td><td>' + esc(r.rcv) + '</td><td>' + esc(r.addr) + '</td><td>' + esc(r.tel) + '</td><td>' + esc(r.msg) + '</td></tr>').join('')
      + '</tbody></table></div>'
      + '<div class="ordbar" style="margin-bottom:0;margin-top:10px">'
      + (master ? '<button class="ordb2" data-ocp="' + esc(no) + '">📋 발주서 복사</button>'
                + '<button class="ordb2" data-ost="처리중|' + esc(no) + '">처리중으로</button>'
                + '<button class="ordb2" data-ost="완료|' + esc(no) + '">완료로</button>' : '')
      + (st === '접수' ? '<button class="ordb2" data-ocn="' + esc(no) + '">✕ 발주 취소</button>' : '')
      + '</div></div>';
  });
  h += '</div>';
  return h;
}
/* 마스터 전용 — 그 발주묶음을 우리 양식(9칸/10칸)으로 복사.
   시트에 저장된 값 그대로 쓴다(그때의 주문처 주소·연락처). */
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
  try{ sub.innerHTML = await ordersView(); }catch(e){ toast(e.message || '다시 불러오지 못했습니다'); }
}

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
/* 붙여넣기 파싱 — 탭(엑셀 복사) 우선, 없으면 쉼표.
   6칸으로 들어오면(업체명 생략) 첫 칸이 우리 상품이면 업체명이 빠진 것으로 본다. */
function parsePaste(text){
  const out = [];
  String(text || '').split(/\r?\n/).forEach(line => {
    if(!S(line)) return;
    let cells = line.indexOf('\t') >= 0 ? line.split('\t') : splitCsv(line);
    cells = cells.map(c => S(c).replace(/^"(.*)"$/, '$1'));
    const joined = cells.join('');
    if(/상품명/.test(joined) && /수량/.test(joined)) return;   // 머리글 줄
    if(cells.length === 6 && findProd(cells[0]).p) cells = [''].concat(cells);
    while(cells.length < 7) cells.push('');
    const r = blank();
    FIELDS.forEach((f, i) => { r[f] = S(cells[i]); });
    if(FIELDS.some(f => S(r[f]))) out.push(r);
  });
  return out;
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

// ── 이벤트 ──────────────────────────────────────────────────────
function bind(){
  const $$ = id => document.getElementById(id);
  paint();
  const on = (id, fn) => { const el = $$(id); if(el) el.onclick = fn; };
  on('ord_add', () => { ROWS.push(blank()); paint(); });
  on('ord_clr', () => { if(confirm('입력한 발주 내용을 전부 지울까요?')){ ROWS = [blank(), blank(), blank()]; OPEN = -1; paint(); } });
  on('ord_tpl', template);
  on('ord_paste', () => { const b = $$('ord_pastebox'); b.style.display = (b.style.display === 'none' ? '' : 'none'); if(b.style.display === '') $$('ord_pt').focus(); });
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
  // 발주 내역 — 발주서 복사 / 상태 변경(마스터) / 취소
  const ocp = e.target.closest && e.target.closest('[data-ocp]');
  if(ocp){
    const no = ocp.getAttribute('data-ocp');
    const t = ordersTsv(LIST.filter(r => r.no === no));
    navigator.clipboard.writeText(t).then(() => toast(no + ' 발주서 복사됨'), () => toast('복사하지 못했습니다'));
    return;
  }
  const ost = e.target.closest && e.target.closest('[data-ost]');
  if(ost){
    const [st, no] = ost.getAttribute('data-ost').split('|');
    ost.disabled = true;
    api('setstatus', {token: ME.token, orderNo: no, state: st})
      .then(() => { toast(no + ' → ' + st); reloadOrders(); })
      .catch(err => { toast(err.message || '바꾸지 못했습니다'); ost.disabled = false; });
    return;
  }
  const ocn = e.target.closest && e.target.closest('[data-ocn]');
  if(ocn){
    const no = ocn.getAttribute('data-ocn');
    if(!confirm(no + ' 발주를 취소할까요?')) return;
    ocn.disabled = true;
    api('cancel', {token: ME.token, orderNo: no})
      .then(() => { toast(no + ' 취소되었습니다'); reloadOrders(); })
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
  if(ME && ME.master){ b.style.display = 'none'; return; }   // 마스터에겐 발주 메뉴 자체가 없다
  const n = ROWS.filter(r => S(r.name)).length;
  b.textContent = n;
  b.style.display = n ? '' : 'none';
}

// 페이지를 새로 열어도 담아둔 게 있으면 메뉴 배지에 뜨게
window.addEventListener('load', () => { if(!ROWS.length) ROWS = loadDraft(); badge(); });

// _build·_check는 검증용 출구다(브라우저 없이 변환 결과를 확인할 때 쓴다). 화면 동작과 무관.
window.ORDER = {view, bind, add, orders: ordersView, rows: () => ROWS, _build: buildOut, _check: checkRow};
})();
