/* 📮 클레임 등록(업체) · 확인(마스터) — 2026-08-31 홍팀장 요청
 *
 *   업체가 카탈로그에서 클레임을 올리면 마스터가 [확인]을 누른다.
 *   확인이 찍히면 업체 화면에도 "확인됨"이 뜬다 — 업체가 "봤나?"를 묻지 않아도 되게.
 *
 *   ⚠️ 항목은 masterc 게시판 [찬]클레임등록 폼에서 **덜어낸 것**이다.
 *      리모컨에서 사람 이름으로 주문을 불러오게 바뀌어 운송장번호·창고명·주소/연락처는 받지 않는다
 *      (홍팀장 2026-08-31: "디테일한 내용이 필요가 없거든").
 *
 *   🔴 사진이 핵심이다. 유형마다 필요한 사진이 정해져 있고, 빠지면 CS가 진행되지 않는다.
 *      그래서 유형을 고르면 필요한 사진 칸만 뜨고, 안 채우면 저장 전에 막는다.
 */
(function(){
'use strict';

var S = function(v){ return v == null ? '' : String(v); };
var T = function(v){ return S(v).trim(); };
var E = function(s){ return S(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
var $c = function(id){ return document.getElementById(id); };

/* 사진 칸 — n:버튼에 뜨는 이름, d:무엇을 올리라는 설명
   🔴 2026-08-31 홍팀장 "사진을 어떤 걸 올리라는지 명확하지가 않다" → 이름만 두지 말고 설명을 같이 띄운다. */
var SLOT = {
  invoice: { n:'송장 사진',            d:'운송장 번호가 보이게 찍어주세요' },
  inner:   { n:'전체 내품사진',        d:'송장 및 상품 도착사진' },
  defect:  { n:'이상 부위 사진',       d:'문제가 있는 부분이 드러나게' },
  broken:  { n:'파손 부위 사진',       d:'파손된 곳이 드러나게' },
  talk:    { n:'대화내용',             d:'클레임 내용 사진 및 고객 응대 내역 (문자나 카톡 모두 좋습니다)' },
  order:   { n:'주문내역서 + 입금내역', d:'두 가지 모두 필요합니다' },
  refund:  { n:'환불 내역',            d:'환불한 내역이 보이게' }
};
function slotName(k){ return (SLOT[k] && SLOT[k].n) || k; }
function slotDesc(k){ return (SLOT[k] && SLOT[k].d) || ''; }

/* 클레임 유형별 필요 사진 (홍팀장이 준 <클레임 상황별 필요 이미지 가이드> 그대로).
   refundOnly:true 인 칸은 처리방법에 '환불'이 들어갈 때만 필수로 본다. */
var TYPES = [
  { k:'선도이상',        t:'상품 클레임 — 선도이상',           need:['inner','defect','talk','order'] },
  { k:'누락오배송',      t:'포장 누락 / 오배송',                need:['invoice','inner','talk','order'] },
  { k:'파손_반품',       t:'택배파손사고 — 반품건',             need:['invoice','broken','order'], ref:['refund'] },
  { k:'파손_폐기',       t:'택배파손사고 — 자체폐기',           need:['invoice','inner','broken','order'], ref:['refund'] },
  { k:'지연_미도착',     t:'택배지연배송 — 미도착',             need:['order'], ref:['refund'] },
  { k:'지연_반품요청',   t:'택배지연배송 — 도착 후 반품 요청',  need:['order'], ref:['refund'] },
  { k:'지연_폐기',       t:'택배지연배송 — 도착 후 자체폐기',   need:['invoice','order'], ref:['refund'] }
];
var HOWS = ['환불','재발송','반품/환불','반품/재발송'];

var PICK = {};      // 슬롯키 → [{name, b64}] 담긴 사진
var CUR  = null;    // 지금 고른 유형
var MINE = [];      // 불러온 클레임 목록

function typeOf(k){ for(var i=0;i<TYPES.length;i++) if(TYPES[i].k===k) return TYPES[i]; return null; }
function isRefund(how){ return S(how).indexOf('환불') >= 0; }

/* 필요한 슬롯 = 기본 + (환불일 때만) 환불내역 */
function slotsFor(ty, how){
  if(!ty) return [];
  var out = ty.need.slice();
  if(ty.ref && isRefund(how)) out = out.concat(ty.ref);
  return out;
}

/* 사진은 그대로 보내면 너무 크다 — 긴 변 1400px, jpeg 0.72 로 줄여 보낸다.
   접수용 확인 사진이라 이 정도면 글씨(주문내역서·송장)도 읽힌다. */
function shrink(file){
  return new Promise(function(res, rej){
    var fr = new FileReader();
    fr.onerror = function(){ rej(new Error('사진을 읽지 못했습니다')); };
    fr.onload = function(){
      var img = new Image();
      img.onerror = function(){ rej(new Error('사진 형식을 알 수 없습니다')); };
      img.onload = function(){
        var mx = 1400, w = img.width, h = img.height;
        if(w > mx || h > mx){ var r = Math.min(mx/w, mx/h); w = Math.round(w*r); h = Math.round(h*r); }
        var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        res(cv.toDataURL('image/jpeg', 0.72));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

/* ── 업체: 등록 폼 ───────────────────────────────────────────── */
function formHtml(){
  var opt = TYPES.map(function(x){ return '<option value="'+E(x.k)+'">'+E(x.t)+'</option>'; }).join('');
  var how = HOWS.map(function(x){ return '<option>'+E(x)+'</option>'; }).join('');
  return ''
  + '<div class="ordbox">'
  + '<h3>📮 클레임 등록</h3>'
  + '<div class="hint">받는 즉시 확인하고 [확인]을 눌러드립니다. 확인되면 아래 목록에 <b>✅ 확인됨</b>으로 바뀝니다.</div>'

  + '<div class="ordfix" style="margin-top:10px">'
  + '<div style="font-size:12.5px;font-weight:800;margin-bottom:7px">1. 어떤 클레임인가요?</div>'
  + '<select id="cl_type" class="ordin"><option value="">— 유형을 고르세요 —</option>'+opt+'</select>'
  + '</div>'

  + '<div class="ordfix" style="margin-top:9px">'
  + '<div style="font-size:12.5px;font-weight:800;margin-bottom:7px">2. 주문 정보</div>'
  + '<div style="display:flex;gap:7px;flex-wrap:wrap">'
  +   '<input id="cl_rcv" class="ordin" style="flex:1;min-width:150px" placeholder="고객 이름 (받는분)" autocomplete="off">'
  +   '<button class="ordb2" type="button" id="cl_find" style="white-space:nowrap">🔎 발주에서 찾기</button>'
  + '</div>'
  + '<div id="cl_hits" style="margin-top:7px"></div>'
  + '<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:7px">'
  +   '<input id="cl_date" class="ordin" style="flex:0 0 150px" placeholder="발주날짜 (예 2026-08-28)" autocomplete="off">'
  +   '<input id="cl_prod" class="ordin" style="flex:1;min-width:180px" placeholder="상품명" autocomplete="off">'
  + '</div>'
  + '<div class="hint" style="margin-top:6px">고객 이름을 넣고 <b>[발주에서 찾기]</b>를 누르면 발주날짜·상품명이 자동으로 들어갑니다. 없으면 직접 적으세요.</div>'
  + '</div>'

  + '<div class="ordfix" style="margin-top:9px">'
  + '<div style="font-size:12.5px;font-weight:800;margin-bottom:7px">3. 클레임 내용</div>'
  // 🔴 2026-08-31 홍팀장 "사유 적는 칸이 너무 작다" — 넉넉하게 키우고 손으로 더 늘릴 수 있게 둔다
  // width 를 인라인으로 못 박는다 — 안 그러면 textarea 의 cols 기본값(20자)이 이겨 칸이 손바닥만 해진다
  + '<textarea id="cl_body" class="ordin" rows="10" style="width:100%;box-sizing:border-box;min-height:190px;resize:vertical;line-height:1.65" '
  +   'placeholder="어떤 문제가 있었는지 적어주세요.&#10;&#10;· 고객이 뭐라고 하셨는지&#10;· 언제 받으셨고 언제 발견하셨는지&#10;· 몇 개 중 몇 개가 문제인지"></textarea>'
  + '<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:7px">'
  +   '<select id="cl_how" class="ordin" style="flex:0 0 170px"><option value="">— 처리방법 —</option>'+how+'</select>'
  +   '<input id="cl_amt" class="ordin" style="flex:0 0 170px" inputmode="numeric" placeholder="환불금액 (숫자만)" autocomplete="off">'
  + '</div>'
  + '</div>'

  + '<div class="ordfix" style="margin-top:9px;border-style:solid;border-color:#e8b4b4;background:#fff7f7">'
  + '<div style="font-size:12.5px;font-weight:800;margin-bottom:4px">4. 사진 첨부 <span style="color:#c0392b">— 필수</span></div>'
  + '<div class="hint" id="cl_guide">유형을 먼저 고르면 <b>필요한 사진 칸</b>이 여기에 나옵니다.</div>'
  + '<div id="cl_slots" style="margin-top:8px"></div>'
  + '</div>'

  + '<div id="cl_err" class="hint" style="color:#c0392b;font-weight:800;margin-top:9px;display:none"></div>'
  + '<div style="margin-top:11px"><button class="ordb2 pri" type="button" id="cl_send">📮 클레임 등록</button></div>'
  + '</div>';
}

/* 유형·처리방법이 바뀔 때마다 필요한 사진 칸을 다시 그린다 */
function drawSlots(){
  var ty = CUR, how = $c('cl_how') ? $c('cl_how').value : '';
  var box = $c('cl_slots'), gd = $c('cl_guide');
  if(!box) return;
  if(!ty){ box.innerHTML=''; if(gd) gd.innerHTML='유형을 먼저 고르면 <b>필요한 사진 칸</b>이 여기에 나옵니다.'; return; }
  var keys = slotsFor(ty, how);
  if(gd) gd.innerHTML = '<b>'+E(ty.t)+'</b> 은(는) 아래 <b>'+keys.length+'가지</b> 사진이 필요합니다. '
    + '<span style="color:#c0392b">빠지면 CS 처리가 안 될 수 있습니다.</span>';
  box.innerHTML = keys.map(function(k){
    var got = (PICK[k]||[]).length, ds = slotDesc(k);
    return '<div style="margin-bottom:11px;padding-bottom:9px;border-bottom:1px dashed var(--line)">'
      + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'
      +   '<button class="ordb2" type="button" data-slot="'+E(k)+'" style="white-space:nowrap">'
      +     (got ? '✅ ' : '📷 ') + E(slotName(k)) + (got ? ' ('+got+'장)' : '')
      +   '</button>'
      +   (got ? '<span style="font-size:12px;color:var(--muted)">'+E((PICK[k]||[]).map(function(f){return f.name;}).join(', '))+'</span>'
              + '<button class="orddel" type="button" data-clr="'+E(k)+'" title="지우기">✕</button>'
              : '<span style="font-size:12px;color:#c0392b;font-weight:700">아직 없음</span>')
      + '</div>'
      + (ds ? '<div style="font-size:12px;color:var(--muted);margin-top:4px;line-height:1.5">↳ '+E(ds)+'</div>' : '')
      + '</div>';
  }).join('');
  bindSlots();
}
function bindSlots(){
  document.querySelectorAll('[data-slot]').forEach(function(b){
    b.onclick = function(){
      var k = b.getAttribute('data-slot');
      var inp = document.createElement('input');
      inp.type='file'; inp.accept='image/*'; inp.multiple=true;
      inp.onchange = async function(){
        var fs = Array.prototype.slice.call(inp.files||[]);
        if(!fs.length) return;
        b.disabled = true; b.textContent = '⏳ 넣는 중…';
        try{
          var out = PICK[k] || [];
          for(var i=0;i<fs.length;i++) out.push({ name: fs[i].name, b64: await shrink(fs[i]) });
          PICK[k] = out;
        }catch(e){ alert(e.message || '사진을 넣지 못했습니다'); }
        b.disabled = false; drawSlots();
      };
      inp.click();
    };
  });
  document.querySelectorAll('[data-clr]').forEach(function(b){
    b.onclick = function(){ delete PICK[b.getAttribute('data-clr')]; drawSlots(); };
  });
}

/* 고객 이름으로 이 업체의 발주를 찾아 발주날짜·상품명을 채운다.
   ⚠️ 상품명은 발주에 적힌 그대로 넣는다 — 손대지 않는다(§3-3 완전일치 원칙). */
var ORD = null;   // 이 화면에서 쓸 발주 목록 (한 번 받아 들고 있는다)

/* 🔴 2026-08-31 홍팀장 "정효로 발주가 있는데 왜 못 찾냐" —
   order.js 의 `LIST` 는 [📋 발주 내역] 화면을 한 번 열어야 채워진다.
   클레임 화면만 열면 비어 있어서 무조건 '못 찾았습니다'가 떴다.
   → 여기서 직접 부른다. 이미 받아둔 게 있으면 그걸 쓴다. */
async function orderList(){
  if(ORD) return ORD;
  if(typeof LIST !== 'undefined' && LIST && LIST.length){ ORD = LIST; return ORD; }
  var j = await api('list', { token: ME.token });
  ORD = (j && j.rows) ? j.rows : [];
  return ORD;
}

async function findOrders(){
  var nm = T($c('cl_rcv').value), box = $c('cl_hits');
  if(!nm){ box.innerHTML = '<div class="hint">고객 이름을 먼저 적어주세요.</div>'; return; }
  box.innerHTML = '<div class="hint">⏳ 발주를 찾는 중입니다…</div>';
  var list;
  try{ list = await orderList(); }
  catch(e){ box.innerHTML = '<div class="hint" style="color:#c0392b">발주를 불러오지 못했습니다 — '+E(e.message||String(e))+'</div>'; return; }
  var key = nm.replace(/\s+/g,'');
  var hit = list.filter(function(r){ return S(r.rcv).replace(/\s+/g,'').indexOf(key) >= 0; });
  if(!hit.length){ box.innerHTML = '<div class="hint">그 이름으로 들어온 발주를 못 찾았습니다 — 아래에 직접 적어주세요.</div>'; return; }
  hit = hit.slice(0, 8);
  box.innerHTML = '<div class="hint">누르면 발주날짜·상품명이 아래에 들어갑니다.</div>'
    + hit.map(function(r, i){
        return '<div class="ordcd" data-pick="'+i+'" style="margin-top:6px;max-width:none">'
          + '<div><b>'+E(S(r.prod))+'</b><div style="font-size:12px;color:var(--muted)">'
          + E(S(r.at).slice(0,10)) + ' · ' + E(S(r.no)) + ' · ' + E(S(r.rcv)) + '</div></div></div>';
      }).join('');
  box.querySelectorAll('[data-pick]').forEach(function(el){
    el.onclick = function(){
      var r = hit[+el.getAttribute('data-pick')];
      $c('cl_date').value = S(r.at).slice(0,10);
      $c('cl_prod').value = S(r.prod);
      $c('cl_rcv').value  = S(r.rcv);
      box.innerHTML = '<div class="hint">✅ 발주를 불러왔습니다.</div>';
    };
  });
}

function collect(){
  var ty = CUR;
  var d = {
    type:  ty ? ty.k : '',
    rcv:   T($c('cl_rcv').value),
    date:  T($c('cl_date').value),
    prod:  T($c('cl_prod').value),
    body:  T($c('cl_body').value),
    how:   T($c('cl_how').value),
    amt:   T($c('cl_amt').value).replace(/[^0-9]/g,''),
    imgs:  {}
  };
  slotsFor(ty, d.how).forEach(function(k){ if((PICK[k]||[]).length) d.imgs[k] = PICK[k]; });
  return d;
}
function validate(d){
  var e = [];
  if(!d.type) e.push('클레임 유형을 골라주세요.');
  if(!d.rcv)  e.push('고객 이름을 적어주세요.');
  if(!d.date) e.push('발주날짜를 적어주세요.');
  if(!d.prod) e.push('상품명을 적어주세요.');
  if(!d.body) e.push('클레임 내용을 적어주세요.');
  if(!d.how)  e.push('처리방법을 골라주세요.');
  if(isRefund(d.how) && !d.amt) e.push('환불금액을 적어주세요.');
  var miss = slotsFor(CUR, d.how).filter(function(k){ return !(d.imgs[k]||[]).length; });
  if(miss.length) e.push('사진이 빠졌습니다 — ' + miss.map(function(k){ return slotName(k); }).join(' / ')
    + '. 이 사진이 없으면 CS 처리가 안 될 수 있습니다.');
  return e;
}

/* ── 목록 ────────────────────────────────────────────────────── */
function listHtml(master){
  if(!MINE.length) return '<div class="empty">아직 등록된 클레임이 없습니다.</div>';
  return MINE.map(function(c){
    var ok = !!T(c.ack_at);
    var ty = typeOf(S(c.type));
    var n = +c.imgn || 0;   // 목록엔 장수만 온다 — 사진 자체는 [펼쳐보기] 때 따로 받는다
    return '<div class="ordbox" style="margin-bottom:10px'+(ok?'':';border-color:#e8b4b4')+'">'
      + '<div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap">'
      +   '<b>'+E(ty?ty.t:S(c.type))+'</b>'
      +   (ok ? '<span class="ftag on">✅ 확인됨</span>' : '<span class="ftag off">⏳ 확인 대기</span>')
      +   (master ? '<span style="font-size:12px;color:var(--muted)">'+E(S(c.cname))+'</span>' : '')
      +   '<span style="margin-left:auto;font-size:12px;color:var(--muted)">'+E(S(c.at).slice(0,16).replace('T',' '))+'</span>'
      + '</div>'
      /* 📋 고객 이름 복사 — 리모컨에 이름을 넣으면 주문내역이 나온다 (홍팀장 2026-09-03).
         손으로 옮겨 적다 한 글자 틀리면 주문을 못 찾는다. 검색에 쓰는 값 옆엔 복사 버튼을 단다. */
      + '<div style="margin-top:6px;font-size:13px">'
      +   '<b>'+E(S(c.prod))+'</b> · '+E(S(c.rcv))
      +   '<button class="cpbtn" data-cp="'+E(S(c.rcv))+'" data-cpmsg="고객 이름 복사됨" title="리모컨 주문내역 검색에 붙여넣으세요">📋</button>'
      +   ' · '+E(S(c.date))
      +   ' · '+E(S(c.how))+(S(c.amt)?' '+E(S(c.amt))+'원':'')
      + '</div>'
      // 📋 클레임 사유도 그대로 옮겨 적을 일이 많다 — 복사 버튼을 붙인다
      + '<div style="margin-top:5px;font-size:12.5px;white-space:pre-wrap;color:var(--ink)">'+E(S(c.body))
      +   '<button class="cpbtn" data-cp="'+E(S(c.body))+'" data-cpmsg="클레임 사유 복사됨" title="클레임 사유를 복사합니다">📋</button>'
      + '</div>'
      + '<div style="margin-top:6px;font-size:12px;color:var(--muted)">📷 사진 '+n+'장'
      +   (n ? ' — <a href="#" data-see="'+E(S(c.id))+'" style="color:var(--accent)">펼쳐보기</a>'
              + ' · <a href="#" data-dl="'+E(S(c.id))+'" data-dlnm="'+E(S(c.rcv)+'_'+S(c.prod))+'" style="color:var(--accent)">⬇ 사진 전부 저장</a>' : '') + '</div>'
      + '<div id="climg_'+E(S(c.id))+'" style="display:none;margin-top:8px"></div>'
      + (master && !ok ? '<div style="margin-top:9px"><button class="ordb2 pri" type="button" data-ack="'+E(S(c.id))+'">✅ 확인</button></div>' : '')
      + (ok ? '<div class="hint" style="margin-top:7px">'+E(S(c.ack_by)||'마스터')+' 확인 · '+E(S(c.ack_at).slice(0,16).replace('T',' '))+'</div>' : '')
      + '</div>';
  }).join('');
}

/* 🔔 클레임 배지 (홍팀장 2026-09-03 — "클레임 들어왔는지 알아야 반응을 하지").
   메뉴의 [📮 클레임] 에 숫자를 띄운다. 예전엔 배지 자리만 있고 채우는 코드가 없어서,
   업체가 클레임을 올려도 **누가 들어가 보기 전엔 아무도 몰랐다.**
     · 마스터  = 아직 [✅ 확인] 안 누른 건수 (우리가 손대야 할 일)
     · 업체    = 내가 올린 것 중 아직 확인 안 된 건수 (기다리는 중인 일)
   ⚠️ 목록 화면을 열지 않아도 돌아야 한다 — 카탈로그가 켜질 때·발주 알림 주기마다 부른다. */
async function badgeCount(){
  if(!(typeof ME !== 'undefined' && ME && ME.token)) return 0;
  var j = await api('claimlist', { token: ME.token });
  var rows = (j && j.rows) ? j.rows : [];
  return rows.filter(function(c){ return !T(c.ack_at); }).length;
}
async function paintBadge(){
  var el = document.getElementById('clBadge');
  if(!el) return;
  try{
    var n = await badgeCount();
    el.textContent = n > 99 ? '99+' : String(n);
    el.style.display = n ? '' : 'none';
  }catch(e){ /* 못 받으면 배지를 건드리지 않는다 — 0으로 지우면 "없는 줄" 알게 된다 */ }
}

var CLAIM = {
  badge: paintBadge,
  view: function(){
    var master = (typeof ME !== 'undefined' && ME && S(ME.role).indexOf('마스터') >= 0);
    PICK = {}; CUR = null;
    return (typeof subHead === 'function' ? subHead('📮 클레임', '') : '')
      + (master ? '' : formHtml())
      + '<h3 style="margin-top:14px">'+(master?'📮 들어온 클레임':'📋 내가 올린 클레임')+'</h3>'
      + '<div id="cl_list"><div class="load">⏳ 불러오는 중입니다…</div></div>';
  },
  bind: async function(){
    var master = (typeof ME !== 'undefined' && ME && S(ME.role).indexOf('마스터') >= 0);
    if(!master){
      $c('cl_type').onchange = function(){ CUR = typeOf(this.value); PICK = {}; drawSlots(); };
      $c('cl_how').onchange  = drawSlots;
      $c('cl_find').onclick  = findOrders;
      $c('cl_rcv').onkeydown = function(e){ if(e.key === 'Enter'){ e.preventDefault(); findOrders(); } };
      $c('cl_send').onclick  = async function(){
        var b = this, d = collect(), errs = validate(d), eb = $c('cl_err');
        if(errs.length){
          eb.style.display = ''; eb.innerHTML = errs.map(function(x){ return '• ' + E(x); }).join('<br>');
          eb.scrollIntoView({block:'center', behavior:'smooth'});
          return;
        }
        eb.style.display = 'none';
        b.disabled = true; b.textContent = '등록 중…';
        try{
          var j = await api('claimadd', { token: ME.token, claim: d });
          if(!j || !j.ok) throw new Error((j && j.error) || '등록하지 못했습니다');
          PICK = {}; CUR = null;
          ['cl_rcv','cl_date','cl_prod','cl_body','cl_amt'].forEach(function(id){ $c(id).value = ''; });
          $c('cl_type').value = ''; $c('cl_how').value = ''; drawSlots();
          await CLAIM.reload(master);
          alert('클레임을 등록했습니다. 확인되면 목록에 ✅ 확인됨으로 바뀝니다.');
        }catch(e){ alert(e.message || '등록하지 못했습니다'); }
        b.disabled = false; b.textContent = '📮 클레임 등록';
      };
      drawSlots();
    }
    await CLAIM.reload(master);
  },
  reload: async function(master){
    var box = $c('cl_list');
    if(!box) return;
    try{
      var j = await api('claimlist', { token: ME.token });
      MINE = (j && j.rows) ? j.rows : [];
    }catch(e){
      box.innerHTML = '<div class="empty">불러오지 못했습니다 — ' + E(e.message || String(e)) + '</div>';
      return;
    }
    box.innerHTML = listHtml(master);
    paintBadge();                     // 목록을 다시 그렸으면 배지도 같이 맞춘다(확인 누른 직후 등)
    box.querySelectorAll('[data-see]').forEach(function(a){
      a.onclick = async function(ev){
        ev.preventDefault();
        var id = a.getAttribute('data-see'), wrap = $c('climg_' + id);
        if(wrap.style.display !== 'none'){ wrap.style.display = 'none'; a.textContent = '펼쳐보기'; return; }
        wrap.style.display = ''; wrap.innerHTML = '<div class="hint">⏳ 사진을 불러오는 중입니다…</div>';
        a.textContent = '접기';
        var im = {};
        try{
          var j = await api('claimimgs', { token: ME.token, id: id });
          if(!j || !j.ok) throw new Error((j && j.error) || '사진을 불러오지 못했습니다');
          im = j.imgs || {};
        }catch(e){ wrap.innerHTML = '<div class="hint" style="color:#c0392b">'+E(e.message||String(e))+'</div>'; return; }
        var h = '';
        for(var k in im) (im[k]||[]).forEach(function(f){
          h += '<div style="margin-bottom:8px"><div style="font-size:12px;color:var(--muted);margin-bottom:3px">'
            + E(slotName(k)) + '</div><img src="' + S(f.b64) + '" style="max-width:100%;border-radius:8px;border:1px solid var(--line)"></div>';
        });
        wrap.innerHTML = h || '<div class="hint">사진이 없습니다.</div>';
      };
    });
    /* ⬇ 사진 전부 저장 (홍팀장 2026-09-03) — 한 장씩 우클릭·이미지 저장을 반복하던 자리.
       파일명에 **고객 이름·상품명**을 박는다. 여러 건을 받으면 어느 클레임 사진인지 안 보인다.
       ⚠️ 브라우저가 "여러 파일 다운로드"를 물으면 허용해야 한다 — 그 안내를 미리 띄운다. */
    box.querySelectorAll('[data-dl]').forEach(function(a){
      a.onclick = async function(ev){
        ev.preventDefault();
        var id = a.getAttribute('data-dl'), base = S(a.getAttribute('data-dlnm')).replace(/[\\/:*?"<>|]/g, ' ').trim();
        var old = a.textContent; a.textContent = '⏳ 사진을 모으는 중…';
        try{
          var j = await api('claimimgs', { token: ME.token, id: id });
          if(!j || !j.ok) throw new Error((j && j.error) || '사진을 불러오지 못했습니다');
          var im = j.imgs || {}, list = [];
          for(var k in im) (im[k] || []).forEach(function(f){ list.push({ slot: slotName(k), b64: S(f.b64) }); });
          if(!list.length){ alert('저장할 사진이 없습니다.'); return; }
          for(var i = 0; i < list.length; i++){
            var r = await fetch(list[i].b64);
            var blob = await r.blob();
            var ext = (blob.type.indexOf('png') >= 0) ? 'png' : 'jpg';
            var url = URL.createObjectURL(blob);
            var el = document.createElement('a');
            el.href = url;
            el.download = base + '_' + (i + 1) + '_' + list[i].slot + '.' + ext;
            document.body.appendChild(el); el.click(); el.remove();
            setTimeout((function(u){ return function(){ URL.revokeObjectURL(u); }; })(url), 4000);
            await new Promise(function(res){ setTimeout(res, 250); });   // 연달아 쏘면 브라우저가 뒤를 버린다
          }
          if(typeof toast === 'function') toast('📷 사진 ' + list.length + '장을 저장했습니다');
        }catch(e){ alert(e.message || '사진을 저장하지 못했습니다'); }
        finally{ a.textContent = old; }
      };
    });
    box.querySelectorAll('[data-ack]').forEach(function(b){
      b.onclick = async function(){
        b.disabled = true; b.textContent = '확인 중…';
        try{
          var j = await api('claimack', { token: ME.token, id: b.getAttribute('data-ack') });
          if(!j || !j.ok) throw new Error((j && j.error) || '확인하지 못했습니다');
          await CLAIM.reload(master);
        }catch(e){ alert(e.message || '확인하지 못했습니다'); b.disabled = false; b.textContent = '✅ 확인'; }
      };
    });
  }
};
window.CLAIM = CLAIM;
})();
