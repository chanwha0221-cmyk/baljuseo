/* 마스터 유통 — 상품 사진·스펙 업데이트 도구 (v3)
   masterc.kr 페이지 위에서 북마클릿으로 실행한다.
   여기서 도는 이유: 상품 사진은 masterc.kr 로그인 세션이 있어야 보이고,
   카탈로그(github.io)는 도메인이 달라 그 페이지를 읽을 수 없다.

   상품 기준 = 상품명. 링크는 '상품정보 업데이트' 시트의 링크 탭이 정본이다
   (유통시트 하이퍼링크는 낡아서 죽은 링크가 섞여 있음 — 2026-08-07 확인).

   v3 (2026-08-11) — 링크 없는 상품 자동 찾기.
   게시판 제목 검색(`/<mid>?search_target=title&search_keyword=`)이 공백 토큰 AND로 걸려서,
   상품명을 통째로 넣으면 그 상품 글만 나온다. 찾으면 링크 정본 시트에 바로 등록하고
   사진·스펙까지 이어서 받는다 → 링크 없던 상품(예: 너비아니)도 사람 손 없이 채워진다. */
(function(){
if(window.__mediaUpdater){window.__mediaUpdater.open();return;}
/* 🚫 실행 위치 가드 (2026-08-20 사장님 지적) — 이 도구는 masterc.kr 페이지 위에서만 글을 읽을 수 있다.
   masterc.co.kr·카탈로그·다른 사이트에서 누르면 시트(목록)는 읽히는데 글 fetch만 교차출처로 전멸해,
   멀쩡한 상품이 전부 '상품정보를 못 읽음'으로 뜬다. 그래서 시작 자체를 막고 어디서 눌러야 하는지 알려준다. */
if(location.hostname!=='masterc.kr'){
  alert('📸 상품사진 채우기 — 여기서는 실행할 수 없습니다.\n\n'
    +'현재 페이지: '+location.hostname+'\n필요한 페이지: masterc.kr\n\n'
    +'masterc.kr 의 상품 글 화면(예: https://masterc.kr/board_eJGl96)을 연 뒤 북마클릿을 눌러주세요.\n\n'
    +'※ masterc.co.kr 은 주소가 비슷해도 브라우저가 다른 사이트로 취급해서 글을 읽지 못합니다.');
  return;
}
var YUTONG='1bFfYmNNzPpIztK6_AD918Hu7s3JvaqkGGlwfIi6LxqY';   // 유통시트(상품 목록)
var LINKSS='1Gfjvk_4u-sFCm-u6xLE5idMxtqmBq9X3dC_BHanq-uQ';   // 상품정보 업데이트(링크 정본)
var DOGU='1t1E8TZ9442OvgFV6Ah5nK6gexHv7xxVFf0jBVDXFUzM';     // 도구시트(캐시·대기목록)
var TAB='상품이미지_v2', QTAB='상품이미지대기';
var MID='board_eJGl96';   // 상품 게시판(제목 검색용). 아래 ensureMid()가 실제 링크로 다시 확인한다.
var EXCLUDE=['상품변동사항','공급가','리모콘','링크','마감시간','유통시트_1차','유통시트_2차','변동사항'];
const CLIENT_EMAIL='sheets-writer@baljuseo-sheets.iam.gserviceaccount.com';

let _tok=null,_exp=0;
async function token(){
  // 실제 인증은 sheets-proxy.js 가 프록시로 처리한다. 이 값은 쓰이지 않는다.
  return 'via-proxy';
}
/* 🔴 2026-08-27 — 이 파일은 **북마클릿으로 masterc.kr 페이지에 주입**된다.
   그 페이지에는 sheets-proxy.js 가 없다. 그런데 개인키를 걷어내면서 인증을 그 shim 에 맡겨버려서,
   가짜 토큰 `Bearer via-proxy` 를 그대로 구글로 보내고 있었다 → 사진 채우기가 통째로 죽었다(전부 401).
   도구 HTML 들은 <script src="sheets-proxy.js"> 로 미리 불러오지만 **여기는 아니다.**
   그래서 이 파일이 **스스로** shim 을 불러온다. shim 이 먼저 실려야 fetch 가로채기가 걸린다.
   ⚠️ masterc.kr 은 github.io 와 다른 출처라 팀 비밀번호를 여기서 한 번 더 묻는다(그 브라우저에 30일 저장). */
var PROXY_SRC='https://chanwha0221-cmyk.github.io/baljuseo/sheets-proxy.js';
var _proxyReady=null;
function ensureProxy(){
  if(window.SheetsProxy) return Promise.resolve();
  if(_proxyReady) return _proxyReady;
  _proxyReady=new Promise(function(res,rej){
    var s=document.createElement('script');
    s.src=PROXY_SRC+'?v='+Date.now();        // 캐시로 옛 shim 이 물리면 또 조용히 죽는다
    s.onload=function(){
      if(window.SheetsProxy) res();
      else rej(new Error('시트 연결 도구를 불러왔지만 준비되지 않았습니다.'));
    };
    s.onerror=function(){ rej(new Error('시트 연결 도구를 불러오지 못했습니다. 인터넷 상태를 확인해 주세요.')); };
    document.head.appendChild(s);
  });
  return _proxyReady;
}

async function api(ss,path,opt){
  await ensureProxy();                        // ← 이게 먼저다. 빠지면 인증 없이 나가서 전부 401
  const t=await token();
  const o=Object.assign({headers:{}},opt||{});
  o.headers=Object.assign({Authorization:'Bearer '+t},o.headers||{});
  const r=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+ss+path,o);
  return r.json();
}
const q=s=>encodeURIComponent(s);
const pkey=s=>String(s||'').replace(/\s+/g,'').toLowerCase();
const idOf=u=>{const m=(u||'').match(/(\d{5,})/);return m?m[1]:'';};

/* ── 🔎 링크 없는 상품 자동 찾기 (게시판 제목 검색) ──────────────────────────
   · 검색은 공백으로 나뉜 낱말 AND — 상품명을 통째로 넣으면 그 낱말이 전부 든 제목만 나온다.
     그래서 통짜 검색으로 나온 건 거의 확실 → 낮은 문턱(0.5)으로 받는다.
   · 통짜로 0건이면 긴 낱말 몇 개로만 다시 찾는데, 이건 엉뚱한 상품이 섞일 수 있어
     문턱을 0.75로 높인다 (예: '주먹참소라'를 '연평참소라'로 잘못 받지 않게).
   · 무게·단위가 서로 다르면(1kg vs 450g) 점수를 크게 깎는다. */
const normNm=s=>String(s||'').replace(/\[[^\]]*\]/g,' ').replace(/[^0-9A-Za-z가-힣]+/g,'').toLowerCase();
function bigrams(s){const a=[];for(let i=0;i<s.length-1;i++)a.push(s.slice(i,i+2));return a;}
function simScore(a,b){
  a=normNm(a);b=normNm(b);
  if(!a||!b)return 0;
  if(a===b)return 1;
  const A=bigrams(a),B=bigrams(b);
  if(!A.length||!B.length)return 0;
  const m={};A.forEach(function(x){m[x]=(m[x]||0)+1;});
  let hit=0;B.forEach(function(x){if(m[x]>0){m[x]--;hit++;}});
  return 2*hit/(A.length+B.length);
}
function units(s){
  const out=[],re=/(\d+(?:\.\d+)?)\s*(kg|g|ml|l|미|말|팩|봉|입|과|구|장|매|개)/gi;
  let m;while((m=re.exec(String(s||''))))out.push((m[1]+m[2]).toLowerCase());
  return out;
}
function unitOk(a,b){
  const A=units(a),B=units(b);
  if(!A.length||!B.length)return true;   // 한쪽에 단위가 없으면 판단 보류
  return A.some(function(x){return B.indexOf(x)>=0;});
}
let MIDdone=false;
async function ensureMid(){   // 상품 링크 하나를 따라가 실제 게시판 주소(mid)를 확인 — 게시판이 바뀌어도 따라간다
  if(MIDdone)return MID;
  MIDdone=true;
  try{
    const any=Object.keys(LINKS).map(function(k){return LINKS[k];}).filter(function(u){return /masterc/.test(u||'');})[0];
    if(any){
      const r=await fetch(any,{credentials:'include',redirect:'follow'});
      const m=(r.url||'').match(/\/(board_[A-Za-z0-9]+)\//);
      if(m)MID=m[1];
    }
  }catch(e){}
  return MID;
}
async function searchBoard(kw){
  const r=await fetch(location.origin+'/'+MID+'?search_target=title&search_keyword='+encodeURIComponent(kw),{credentials:'include'});
  const h=await r.text();
  const d=new DOMParser().parseFromString(h,'text/html');
  const out=[],seen={},as=d.querySelectorAll('a');
  for(let i=0;i<as.length;i++){
    const href=as[i].getAttribute('href')||'';
    const m=href.match(/document_srl=(\d{4,})/);
    if(!m||seen[m[1]])continue;
    const t=(as[i].textContent||'').replace(/\s+/g,' ').trim();
    if(t.length<2)continue;
    seen[m[1]]=1;
    out.push({srl:m[1],title:t});
  }
  return out;
}
async function findLink(name){
  const base=String(name||'').replace(/\[[^\]]*\]/g,' ').replace(/[()]/g,' ').replace(/\s+/g,' ').trim();
  if(!base)return null;
  const toks=base.split(' ').filter(function(t){return t.length>1;});
  const longFirst=toks.slice().sort(function(a,b){return b.length-a.length;});
  const tries=[base];
  if(longFirst.length>2)tries.push(longFirst.slice(0,2).join(' '));
  if(longFirst.length>1)tries.push(longFirst[0]);
  for(let i=0;i<tries.length;i++){
    const kw=tries[i];
    let cands=[];
    try{cands=await searchBoard(kw);}catch(e){}
    if(!cands.length)continue;
    let best=null;
    cands.forEach(function(c){
      let sc=simScore(name,c.title);
      if(!unitOk(name,c.title))sc*=0.45;
      if(!best||sc>best.score||(sc===best.score&&+c.srl>+best.srl))best={srl:c.srl,title:c.title,score:sc};
    });
    const need=(kw===base)?0.5:0.75;   // 통짜 검색은 낱말 AND라 이미 걸러짐 / 줄인 검색은 엄격하게
    if(best&&best.score>=need)return{url:'https://masterc.kr/'+best.srl,title:best.title,score:best.score,kw:kw};
  }
  return null;
}
/* 찾은 링크를 링크 정본 시트에 저장 — 이미 줄이 있으면 그 줄 B칸을 갈아끼우고,
   없으면 맨 위(2행부터)에 한꺼번에 끼워 넣는다(위쪽이 최신 = loadLinks 규칙 유지). */
async function saveFoundLinks(found){
  if(!found.length)return{};
  const v=await api(LINKSS,'/values/'+q("'링크'!A2:A3000"));
  const rowOf={};
  ((v.values)||[]).forEach(function(r,i){const k=pkey(r[0]);if(k&&!rowOf[k])rowOf[k]=i+2;});
  const upd=[],add=[];
  found.forEach(function(f){
    const r=rowOf[pkey(f.name)];
    if(r)upd.push({range:"'링크'!B"+r,values:[[f.url]]});
    else add.push([f.name,f.url]);
  });
  if(upd.length){
    const j=await api(LINKSS,'/values:batchUpdate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({valueInputOption:'RAW',data:upd})});
    if(j.error)return j;
  }
  if(add.length){
    const meta=await api(LINKSS,'?fields=sheets.properties(title,sheetId)');
    const lk=((meta.sheets)||[]).map(function(s){return s.properties;}).filter(function(p){return p.title==='링크';})[0];
    if(!lk)return{error:{message:'링크 탭을 못 찾았습니다'}};
    let j=await api(LINKSS,':batchUpdate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requests:[{insertDimension:{range:{sheetId:lk.sheetId,dimension:'ROWS',startIndex:1,endIndex:1+add.length}}}]})});
    if(j.error)return j;
    j=await api(LINKSS,'/values/'+q("'링크'!A2:B"+(1+add.length))+'?valueInputOption=RAW',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({values:add})});
    if(j.error)return j;
  }
  return{};
}

/* 링크 정본 — 상품정보 업데이트 시트의 링크 탭 (위쪽이 최신) */
async function loadLinks(){
  const v=await api(LINKSS,'/values/'+q("'링크'!A2:B3000"));
  const m={};
  for(const r of (v.values||[])){
    const nm=(r[0]||'').trim(),u=(r[1]||'').trim();
    if(nm&&u&&!m[pkey(nm)])m[pkey(nm)]=u;
  }
  return m;
}
/* 유통시트 상품 목록(창고·상품명 + 그 상품이 시트 어디에 있는지) */
const colLetter=i=>{let s='';i++;while(i>0){const m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26);}return s;};
const sheetLink=p=>p.gid?('https://docs.google.com/spreadsheets/d/'+YUTONG+'/edit#gid='+p.gid+'&range='+p.cell):'';
async function loadProducts(){
  const meta=await api(YUTONG,'?fields=sheets.properties(title,hidden)');
  if(meta.error)throw new Error('유통시트 접근 실패: '+meta.error.status);
  const tabs=(meta.sheets||[]).map(s=>s.properties).filter(p=>!p.hidden&&EXCLUDE.indexOf(p.title)<0).map(p=>p.title);
  const ranges=tabs.map(t=>'ranges='+q("'"+t.replace(/'/g,"''")+"'!A1:N400")).join('&');
  // 🙈 숨겨진 행도 같이 받는다 — 숨긴 상품은 안 파는 것이니 '손봐야 할 상품'에 올리지 않는다 (홍팀장 2026-08-24)
  const fields=q('sheets(properties(title,sheetId),data(rowMetadata.hiddenByUser,rowData.values(formattedValue,hyperlink,textFormatRuns(format.link.uri),userEnteredValue.formulaValue)))');
  const grid=await api(YUTONG,'?'+ranges+'&fields='+fields);
  const out=[],seen={};
  for(const sh of (grid.sheets||[])){
    const tabName=sh.properties.title;
    const gid=sh.properties.sheetId;
    const rows=((sh.data&&sh.data[0]&&sh.data[0].rowData)||[]).map(r=>r.values||[]);
    const rowHidden=((sh.data&&sh.data[0]&&sh.data[0].rowMetadata)||[]).map(m=>!!(m&&m.hiddenByUser));
    const disp=rows.map(r=>r.map(c=>(c&&c.formattedValue)||''));
    let hr=-1;
    for(let i=0;i<Math.min(40,disp.length);i++){const j=disp[i].join('|');if(j.indexOf('상품명')>=0&&j.indexOf('공급가')>=0){hr=i;break;}}
    if(hr<0)continue;
    const H=disp[hr];
    if(/원가|공급처|기존가/.test(H.join('|')))continue;
    const ci=H.findIndex(h=>h.indexOf('상품명')>=0);
    const cw=H.findIndex(h=>h.indexOf('창고명')>=0);
    const cp=H.findIndex(h=>h.indexOf('공급가')>=0);
    if(ci<0)continue;
    for(let i=hr+1;i<disp.length;i++){
      const nm=(disp[i][ci]||'').trim();
      if(!nm||nm==='상품명')continue;
      /* 📢 상품이 아니라 '공지 행'은 건너뛴다 (사장님 2026-08-20).
         변동공지 도구가 창고 탭에 `<택배사 변동>`·`<○○창고 전상품>` 같은 안내 행을 넣는데,
         이건 팔 물건이 아니라 코멘트다 — 사진·링크가 없는 게 정상이라 '손봐야 할 상품'에 올리면 안 된다.
         판정 = ①이름이 <…>로 감싸였거나 ②공급가 칸이 비었거나(카탈로그도 같은 기준으로 거른다). */
      if(/^[<〈][\s\S]*[>〉]$/.test(nm))continue;
      // 🙈 숨긴 행 = 지금 안 파는 상품 → 품절과 똑같이 취급(카탈로그·링크정본도 같은 기준) — 홍팀장 2026-08-24
      if(rowHidden[i])continue;
      if(cp>=0&&!(disp[i][cp]||'').trim())continue;
      if(seen[pkey(nm)])continue;seen[pkey(nm)]=1;
      const cell=rows[i][ci]||{};
      let su=cell.hyperlink||'';
      if(!su&&cell.textFormatRuns)for(const t of cell.textFormatRuns){if(t.format&&t.format.link&&t.format.link.uri){su=t.format.link.uri;break;}}
      if(!su&&cell.userEnteredValue&&cell.userEnteredValue.formulaValue){const m=cell.userEnteredValue.formulaValue.match(/HYPERLINK\(\s*"([^"]+)"/i);if(m)su=m[1];}
      out.push({name:nm,wh:((cw>=0?(disp[i][cw]||'').trim():'')||tabName),sheetUrl:su,
                tab:tabName,gid:gid,cell:colLetter(ci)+(i+1)});
    }
  }
  return out;
}
async function loadCache(){
  const v=await api(DOGU,'/values/'+q("'"+TAB+"'!A1:G3000"));
  const m={};
  for(const r of (v.values||[]).slice(1)){
    const nm=(r[0]||'').trim();
    if(!nm)continue;
    m[pkey(nm)]={name:nm,id:r[1]||'',img:r[2]||'',spec:(r[3]?String(r[3]).split('\n'):[]),updated:r[4]||'',link:r[5]||'',backs:(r[6]?String(r[6]).split('\n').filter(Boolean):[])};
  }
  return m;
}
/* ✓ 문제없음 — 도구 페이지에서 "확인해 봤는데 이상 없음"으로 넘긴 상품(도구시트 '문제없음' 탭).
   여기서도 똑같이 빼줘야 못 고치는 상품(예: 게시글 자체가 없는 추가옵션)이 버튼에 계속 남지 않는다. */
async function loadOkList(){
  const v=await api(DOGU,'/values/'+q("'문제없음'!A2:A3000"));
  const m={};
  ((v.values)||[]).forEach(function(r){const n=(r[0]||'').trim();if(n)m[pkey(n)]=1;});
  return m;
}
async function loadQueue(){
  const v=await api(DOGU,'/values/'+q("'"+QTAB+"'!A2:C1000"));
  const out=[];
  for(const r of (v.values||[])){const nm=(r[0]||'').trim();if(nm)out.push({name:nm,at:r[1]||'',src:r[2]||''});}
  return out;
}
/* 🗑 직접 삭제 — 2026-08-10부터 서비스계정이 유통시트 편집자라 대기 큐 없이 바로 지운다.
   지우기 전에 그 셀의 상품명을 재확인하고(그 사이 시트가 바뀌었으면 중단), 삭제 후 같은 탭 아래 행 번호를 당긴다. */
async function delProduct(p){
  const rowIdx=parseInt(String(p.cell).replace(/\D/g,''),10);
  const chk=await api(YUTONG,'/values/'+q("'"+p.tab.replace(/'/g,"''")+"'!"+p.cell));
  const got=(chk.values&&chk.values[0]&&chk.values[0][0])?String(chk.values[0][0]).trim():'';
  if(pkey(got)!==pkey(p.name))return{error:{message:'그 칸의 상품명이 달라졌어요(시트가 바뀐 듯) — 패널을 다시 열어 주세요. 현재 칸: '+got}};
  const j=await api(YUTONG,':batchUpdate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requests:[{deleteDimension:{range:{sheetId:p.gid,dimension:'ROWS',startIndex:rowIdx-1,endIndex:rowIdx}}}]})});
  if(j.error)return j;
  PRODUCTS=PRODUCTS.filter(function(x){return x!==p;});
  PRODUCTS.forEach(function(x){   // 같은 탭 아래 행들은 한 칸 위로
    if(x.tab!==p.tab)return;
    const m=String(x.cell).match(/^([A-Z]+)(\d+)$/);
    if(m&&parseInt(m[2],10)>rowIdx)x.cell=m[1]+(parseInt(m[2],10)-1);
  });
  return{};
}
async function saveCache(){
  const rows=[['상품명','id','img','spec','updated','link','예비사진']];
  Object.keys(CACHE).sort().forEach(function(k){
    const c=CACHE[k];
    rows.push([c.name,c.id||'',c.img||'',(c.spec||[]).join('\n'),c.updated||'',c.link||'',(c.backs||[]).join('\n')]);
  });
  return api(DOGU,'/values/'+q("'"+TAB+"'!A1:G3000")+'?valueInputOption=RAW',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({values:rows})});
}
async function saveQueue(){
  const rows=[['상품명','등록일시','출처']];
  QUEUE.forEach(function(x){rows.push([x.name,x.at||'',x.src||'']);});
  while(rows.length<400)rows.push(['','','']);   // 지운 줄이 남지 않게 여백까지 덮어씀
  return api(DOGU,'/values/'+q("'"+QTAB+"'!A1:C400")+'?valueInputOption=RAW',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({values:rows})});
}

/* 🩹 깨진 사진 검사 — 창고에 주소는 있는데 실제로는 안 열리는 사진.
   '사진없음'(주소가 아예 없음)과 다른 문제라 따로 검사한다. 통과한 주소는 7일 기억(다음부턴 빠름).
   응답이 없는 건(느린 것) 깨진 걸로 치지 않는다 — 오탐 방지. */
const IMGOK_KEY='mu_imgok_v1';
let IMGOK={};try{IMGOK=JSON.parse(localStorage.getItem(IMGOK_KEY)||'{}');}catch(e){}
function imgTest(u){
  if(IMGOK[u]&&Date.now()-IMGOK[u]<7*24*3600*1000)return Promise.resolve(true);
  return new Promise(function(res){
    const im=new Image();
    const t=setTimeout(function(){res(true);},8000);
    im.onload=function(){clearTimeout(t);IMGOK[u]=Date.now();res(true);};
    im.onerror=function(){clearTimeout(t);res(false);};
    im.src=u;
  });
}
async function scanBroken(){
  const list=PRODUCTS.filter(function(p){const c=cacheOf(p);return c&&c.img;});
  let i=0;
  async function w(){
    while(i<list.length){
      const p=list[i++],c=cacheOf(p);
      const ok=await imgTest(c.img);
      if(!ok)BROKEN[pkey(p.name)]=1;
    }
  }
  await Promise.all(Array.from({length:20},function(_,k){return k;}).map(w));
  try{localStorage.setItem(IMGOK_KEY,JSON.stringify(IMGOK));}catch(e){}
}

/* 상품 상세 1건 수집 — masterc.kr 위에서 도니까 로그인 세션이 그대로 붙는다 */
/* 첫 번째 첨부 사진이 깨진 파일인 게시물이 있어(살치살 2026-08-09) 실제로 로드되는 첫 사진을 고른다 */
function imgLoads(u){
  return new Promise(function(res){
    const im=new Image();
    const t=setTimeout(function(){res(false);},6000);
    im.onload=function(){clearTimeout(t);res(true);};
    im.onerror=function(){clearTimeout(t);res(false);};
    im.src=u;
  });
}
/* 실패 사유를 반드시 구분해서 돌려준다 (2026-08-20).
   예전엔 호출부가 try{}catch(e){} 로 통째 삼키고 실패를 전부 '글이 삭제·이동됐을 수 있음'으로 표시해서,
   멀쩡한 글까지 삭제된 것처럼 보고했다(사장님 지적). why: cross='이 페이지에서 masterc.kr을 못 읽음'
   / login='로그인 풀림' / gone='진짜 삭제된 글' / noimg='글은 있는데 첨부 사진이 없음'. */
async function scrape(url){
  let r,h;
  try{
    r=await fetch(url,{credentials:'include',redirect:'follow'});
    h=await r.text();
  }catch(e){ return {img:'',spec:[],backs:[],bad:false,why:'cross',detail:e.message}; }
  if(!r.ok) return {img:'',spec:[],backs:[],bad:false,why:'http',detail:'HTTP '+r.status};
  const doc=new DOMParser().parseFromString(h,'text/html');
  const title=(doc.title||'').trim();
  if(h.indexOf('권한이 없')>=0||h.indexOf('dispMemberLoginForm')>=0)
    return {img:'',spec:[],backs:[],bad:false,why:'login',detail:title};
  // 삭제·이동된 글은 masterc 메인으로 리다이렉트돼 제목이 '(주)마스터'가 된다
  const gone=(!title||/^\(주\)\s*마스터/.test(title));
  const cands=[];
  const imgs=doc.querySelectorAll('img');
  for(let i=0;i<imgs.length;i++){
    let s=imgs[i].getAttribute('src')||'';
    if(s.indexOf('/files/attach/')<0)continue;
    if(s.indexOf('http')!==0)s='https://masterc.co.kr'+(s.charAt(0)==='/'?'':'/')+s;
    cands.push(s.replace('/./','/'));
  }
  let img='';
  for(let i=0;i<Math.min(5,cands.length);i++){
    if(await imgLoads(cands[i])){img=cands[i];break;}
  }
  /* 후보 5장이 전부 안 열리면(글의 첨부파일이 서버에서 사라진 경우) 일단 첫 장을 쓰되 '깨짐'으로 표시해,
     이미 멀쩡한 사진이 있는 상품을 깨진 주소로 덮어쓰지 않게 한다. */
  let bad=false;
  if(!img&&cands.length){img=cands[0];bad=true;}
  const backs=cands.slice(0,6);   // 예비 사진 — 대표가 나중에 깨지면 취합 화면이 자동 교체한다
  let spec=[];
  const txt=(doc.body?doc.body.textContent:'')||'';
  const si=txt.indexOf('상품 스펙');
  if(si>=0)spec=txt.slice(si,si+900).split('\n').map(s=>s.trim()).filter(s=>s.indexOf('※')===0).slice(0,7);
  if(!spec.length){
    const md=h.match(/<meta name="description" content="([^"]*)"/);
    if(md){
      const d=md[1].replace(/&quot;/g,'"').replace(/&#039;/g,"'").replace(/&amp;/g,'&').replace(/&nbsp;/g,' ');
      spec=d.split('※').slice(1).map(function(p){return '※ '+p.split(/○/)[0].replace(/\.\.\.$/,'').trim().replace(/\s+/g,' ');}).filter(function(s){return s.length>4&&s.length<80;}).slice(0,7);
    }
  }
  const why=img?'':(gone?'gone':(cands.length?'':'noimg'));
  return {img:img,spec:spec,backs:backs,bad:bad,why:why,detail:title};
}

/* ── 화면 ── */
const S=document.createElement('style');
S.textContent='#mu-wrap{position:fixed;right:16px;bottom:16px;width:430px;max-height:84vh;background:#fff;color:#18211f;border:1px solid #d8ded9;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.25);z-index:2147483647;font-family:"Apple SD Gothic Neo","Malgun Gothic",sans-serif;display:flex;flex-direction:column;font-size:13px}'
+'#mu-wrap *{box-sizing:border-box}'
+'#mu-hd{padding:12px 14px;border-bottom:1px solid #e8ece9;display:flex;align-items:center;gap:8px}'
+'#mu-hd b{font-size:14px;flex:1}'
+'#mu-x{border:none;background:#f0f2ef;border-radius:7px;width:26px;height:26px;cursor:pointer;font-size:15px;line-height:1}'
+'#mu-body{padding:12px 14px;overflow-y:auto;flex:1}'
+'.mu-sum{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}'
+'.mu-sum span{background:#f0f2ef;border-radius:7px;padding:4px 9px;font-size:11.5px;cursor:pointer;border:1px solid transparent}'
+'.mu-sum span:hover{border-color:#0f7a5a}'
+'.mu-sum span.on{background:#0f7a5a;color:#fff}'
+'.mu-sum span.on b{color:#fff}'
+'.mu-sum span b{color:#0f7a5a}'
+'.mu-row{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:9px}'
+'.mu-btn{border:1px solid #cfd6d1;background:#fff;border-radius:8px;padding:7px 11px;font-size:12px;cursor:pointer;font-weight:600;color:#18211f}'
+'.mu-btn:hover{border-color:#0f7a5a;color:#0f7a5a}'
+'.mu-btn.go{background:#0f7a5a;border-color:#0f7a5a;color:#fff}'
+'.mu-btn.q{background:#fff6e5;border-color:#e8c37a;color:#8a5a00}'
+'.mu-btn:disabled{opacity:.45;cursor:default}'
+'#mu-q{width:100%;border:1px solid #d8ded9;border-radius:8px;padding:8px 10px;font-size:13px;margin-bottom:8px}'
+'#mu-list{border:1px solid #eef1ec;border-radius:8px;max-height:32vh;overflow-y:auto}'
+'.mu-it{display:flex;gap:8px;align-items:center;padding:6px 9px;border-bottom:1px solid #f3f5f2}'
+'.mu-it:last-child{border-bottom:none}'
+'.mu-it label{flex:1;cursor:pointer;line-height:1.35}'
+'.mu-it .wh{color:#8a9a92;font-size:10.5px}'
+'.mu-go{border:1px solid #cfd6d1;background:#fff;border-radius:6px;padding:2px 6px;font-size:10.5px;cursor:pointer;color:#5d6d66;white-space:nowrap;text-decoration:none}'
+'.mu-go:hover{border-color:#0f7a5a;color:#0f7a5a}'
+'.mu-go.del:hover{border-color:#c0392b;color:#c0392b}'
+'.mu-badge{font-size:10px;padding:1px 5px;border-radius:4px;background:#f0f2ef;color:#7b8a83;white-space:nowrap}'
+'.mu-badge.no{background:#fde9e9;color:#c0392b}'
+'.mu-badge.q{background:#fff6e5;color:#8a5a00}'
+'#mu-log{margin-top:10px;font-size:11.5px;color:#5d6d66;line-height:1.6;white-space:pre-wrap}'
+'#mu-bar{height:6px;background:#eef1ec;border-radius:4px;overflow:hidden;margin-top:8px;display:none}'
+'#mu-bar i{display:block;height:100%;background:#0f7a5a;width:0}'
+'#mu-fail{margin-top:10px;border:1px solid #f0c9c9;background:#fdf3f3;border-radius:9px;padding:10px 12px;display:none}'
+'#mu-fail h4{font-size:12.5px;color:#c0392b;margin:0 0 6px}'
+'#mu-faillist{font-size:11.5px;color:#7d4b4b;line-height:1.65;max-height:20vh;overflow-y:auto}'
+'#mu-faillist a{color:#c0392b}';
document.head.appendChild(S);

const W=document.createElement('div');
W.id='mu-wrap';
W.innerHTML='<div id="mu-hd"><b>📸 상품 사진·스펙 업데이트</b><button id="mu-x">×</button></div>'
+'<div id="mu-body">'
+'<div class="mu-sum" id="mu-sum"><span>불러오는 중…</span></div>'
+'<div class="mu-row"><button class="mu-btn go" id="mu-fill" style="width:100%">🖼 지금 손봐야 할 상품 전부 업데이트</button></div>'
+'<div id="mu-why" style="font-size:11px;color:#8a9a92;margin:-4px 0 9px;line-height:1.5"></div>'
+'<div class="mu-row">'
+'<button class="mu-btn q" data-pick="queue">📮 대기만 선택</button>'
+'<button class="mu-btn" data-pick="missing">사진·스펙 없는 것</button>'
+'<button class="mu-btn" data-pick="all">전체</button>'
+'<button class="mu-btn" data-pick="none">선택 해제</button>'
+'</div>'
+'<div class="mu-row"><button class="mu-btn" id="mu-link">🔗 링크 업데이트</button><span style="font-size:11px;color:#8a9a92;align-self:center">상품정보 업데이트 시트에서 최신 링크 가져오기</span></div>'
+'<input id="mu-q" placeholder="상품명·창고 검색 (카탈로그에서 📋 복사한 이름 붙여넣기)">'
+'<div id="mu-list"></div>'
+'<div class="mu-row" style="margin-top:10px"><button class="mu-btn go" id="mu-run">선택 0건 업데이트</button></div>'
+'<div id="mu-bar"><i></i></div>'
+'<div id="mu-log"></div>'
+'<div id="mu-fail"><h4>⚠️ 업데이트했는데 상품정보가 안 나온 것</h4><div id="mu-faillist"></div><button class="mu-btn" id="mu-failcp" style="margin-top:8px">📋 목록 복사</button></div>'
+'</div>';
document.body.appendChild(W);
const $=function(id){return document.getElementById(id);};
const log=function(m,keep){$('mu-log').textContent=keep?($('mu-log').textContent+'\n'+m):m;};
$('mu-x').onclick=function(){W.style.display='none';};

let PRODUCTS=[],CACHE={},LINKS={},QUEUE=[],SEL={},BUSY=false,LASTFAIL=[],FILTER='',BROKEN={},OKLIST={};
const cacheOf=p=>CACHE[pkey(p.name)];
const linkOf=p=>{const c=cacheOf(p);return LINKS[pkey(p.name)]||(c&&c.link)||p.sheetUrl||'';};
const noImg=p=>{const c=cacheOf(p);return !c||!c.img;};
const noSpec=p=>{const c=cacheOf(p);return !c||!c.spec.length;};
const isMissing=p=>noImg(p)||noSpec(p);
const inQueue=p=>QUEUE.some(x=>pkey(x.name)===pkey(p.name));
const isBroken=p=>!!BROKEN[pkey(p.name)];
/* 🖼 큰 버튼이 고르는 대상 = 지금 손봐야 할 것 전부.
   ① 사진 없음(창고가 빔) ② 사진 깨짐(주소는 있는데 안 열림) ③ 대기(엑셀 생성으로 값이 바뀐 상품 — 사진도 바뀌었을 수 있음) */
const needsFix=p=>!OKLIST[pkey(p.name)]&&(noImg(p)||isBroken(p)||inQueue(p));

/* 요약 칩 = 목록 필터. 누르면 아래 목록이 그 상품들만 보여준다(뭐가 문제인지 바로 확인). */
const FILTERS={'':()=>true,queue:inQueue,noimg:noImg,broken:isBroken,nospec:noSpec,nolink:p=>!linkOf(p)};
function renderSum(){
  const chip=(k,label,n)=>'<span data-f="'+k+'"'+(FILTER===k?' class="on"':'')+'>'+label+' <b>'+n+'</b></span>';
  $('mu-sum').innerHTML=chip('','상품',PRODUCTS.length)
    +chip('queue','📮 대기',PRODUCTS.filter(inQueue).length)
    +chip('noimg','사진없음',PRODUCTS.filter(noImg).length)
    +chip('broken','사진깨짐',PRODUCTS.filter(isBroken).length)
    +chip('nospec','스펙없음',PRODUCTS.filter(noSpec).length)
    +chip('nolink','링크없음',PRODUCTS.filter(p=>!linkOf(p)).length);
  const chips=$('mu-sum').querySelectorAll('span[data-f]');
  for(let i=0;i<chips.length;i++){
    chips[i].onclick=function(){
      const f=this.getAttribute('data-f');
      FILTER=(FILTER===f)?'':f;
      renderSum();renderList();
    };
  }
}
function renderList(){
  const kw=($('mu-q').value||'').trim().toLowerCase();
  const pass=FILTERS[FILTER]||FILTERS[''];
  const hit=PRODUCTS.filter(p=>pass(p)).filter(p=>!kw||p.name.toLowerCase().indexOf(kw)>=0||p.wh.toLowerCase().indexOf(kw)>=0);
  const list=hit.slice(0,300);
  $('mu-list').innerHTML=list.map(function(p){
    const c=cacheOf(p);
    const b=[];
    if(inQueue(p))b.push('<span class="mu-badge q">대기</span>');
    if(!linkOf(p))b.push('<span class="mu-badge no">링크X</span>');
    if(!c||!c.img)b.push('<span class="mu-badge no">사진X</span>');
    else if(isBroken(p))b.push('<span class="mu-badge no">사진깨짐</span>');
    if(!c||!c.spec.length)b.push('<span class="mu-badge no">스펙X</span>');
    if(c&&c.img&&c.spec.length)b.push('<span class="mu-badge">'+(c.updated||'')+'</span>');
    const su=sheetLink(p);
    const go=su?('<a class="mu-go" href="'+su+'" target="_blank" rel="noopener" title="유통시트 '+p.tab+' 탭 '+p.cell+'칸으로 이동">시트↗</a>'):'';
    // 🗑 = 유통시트에서 이 상품 행 바로 삭제(운영 안 할 상품). 링크 없는 상품에만 노출.
    const del=(!linkOf(p)&&p.tab)?('<button class="mu-go del" data-del="'+pkey(p.name)+'" title="유통시트에서 이 상품 행 삭제">🗑</button>'):'';
    return '<div class="mu-it"><input type="checkbox" data-k="'+pkey(p.name)+'"'+(SEL[pkey(p.name)]?' checked':'')+'>'
      +'<label>'+p.name.replace(/</g,'&lt;')+'<br><span class="wh">'+p.wh+(p.tab?(' · '+p.tab+' '+p.cell):'')+'</span></label>'+b.join('')+go+del+'</div>';
  }).join('')||'<div class="mu-it">해당 상품 없음</div>';
  if(hit.length>list.length)$('mu-list').innerHTML+='<div class="mu-it" style="color:#8a9a92">…외 '+(hit.length-list.length)+'건 (검색으로 좁혀 보세요)</div>';
  const cbs=$('mu-list').querySelectorAll('input[type=checkbox]');
  for(let i=0;i<cbs.length;i++){
    cbs[i].onchange=function(){
      const k=this.getAttribute('data-k');
      if(this.checked)SEL[k]=1;else delete SEL[k];
      renderRun();
    };
  }
  const dels=$('mu-list').querySelectorAll('button[data-del]');
  for(let i=0;i<dels.length;i++){
    dels[i].onclick=async function(){
      const k=this.getAttribute('data-del');
      const p=PRODUCTS.filter(x=>pkey(x.name)===k)[0];
      if(!p)return;
      if(!confirm('유통시트에서 이 상품 행을 지금 바로 삭제합니다.\n\n'+p.name+'\n위치: '+p.tab+' 탭 '+p.cell+'\n\n되돌리려면 유통시트에서 실행취소(Ctrl+Z)를 해야 합니다. 삭제할까요?'))return;
      this.disabled=true;this.textContent='…';
      const j=await delProduct(p);
      if(j&&j.error){alert('삭제 실패: '+j.error.message);this.disabled=false;this.textContent='🗑';return;}
      renderSum();renderList();
      log('🗑 유통시트에서 삭제했습니다 — '+p.name+' ('+p.tab+' '+p.cell+')');
    };
  }
}
function renderRun(){
  const n=Object.keys(SEL).length;
  $('mu-run').textContent='선택 '+n+'건 업데이트';
  $('mu-run').disabled=(n===0||BUSY);
  const nq=PRODUCTS.filter(inQueue).length,ni=PRODUCTS.filter(noImg).length,nb=PRODUCTS.filter(isBroken).length;
  const nf=PRODUCTS.filter(needsFix).length;
  $('mu-fill').textContent=nf?('🖼 지금 손봐야 할 '+nf+'건 전부 업데이트'):'🖼 손봐야 할 상품 없음 🎉';
  $('mu-fill').disabled=(nf===0||BUSY);
  $('mu-why').innerHTML=nf
    ?('= 사진없음 '+ni+' · 사진깨짐 '+nb+' · 📮 대기 '+nq+' 중 ✓ 문제없음으로 넘긴 건 빼고 (겹치는 건 한 번만)<br>📮 대기 = 상품정보 업데이트에서 📗 엑셀 생성한 상품 — 값이 바뀌었으니 사진·스펙도 다시 받는 목록입니다. 이 버튼을 눌러야 줄어듭니다.')
    :'사진없음·사진깨짐·📮 대기 모두 0건입니다.';
}
const picks=W.querySelectorAll('[data-pick]');
for(let i=0;i<picks.length;i++){
  picks[i].onclick=function(){
    const k=this.getAttribute('data-pick');
    SEL={};
    if(k==='queue')PRODUCTS.filter(inQueue).forEach(p=>SEL[pkey(p.name)]=1);
    else if(k==='missing')PRODUCTS.filter(isMissing).forEach(p=>SEL[pkey(p.name)]=1);
    else if(k==='all')PRODUCTS.forEach(p=>SEL[pkey(p.name)]=1);
    renderList();renderRun();
  };
}
$('mu-q').oninput=renderList;

/* 🩺 상세가 안 뜨는 링크만 골라 고친다 (홍팀장 2026-08-21: "링크 눌렀을 때 상세설명 안 나오는 것만
   잡아 달랑게, 그럼 전체 다 돌릴 필요도 없잖여").
   🔴 왜 필요했나: 이 버튼은 사진캐시(`상품이미지_v2`)의 링크만 고치고, **카탈로그가 1순위로 읽는
      `상품링크` 정본은 안 건드렸다.** 그래서 소스 시트에서 링크를 고치고 버튼을 눌러도 카탈로그는
      옛 링크 그대로였다 (건중하새우포 1박스 — 캐시 706476 / 정본 698810, 정본이 이김).
      게다가 그 옛 링크 698810은 **죽은 글**이라 업체가 누르면 마스터 메인으로 튕겼다.
   🧰 판정법: `masterc.kr/<글번호>`를 열어 `<title>`이 `(주)마스터`거나 비면 죽은 글이다.
      로그인 없이도 제목은 나온다 — 단 **masterc 페이지 위에서 눌러야** 한다(교차출처 차단).
   ⚡ 전수 검사 안 한다: **정본과 소스가 다른 것만** 본다. 둘이 같으면 바꿔 넣을 후보 자체가 없다. */
function liveTitle(url){
  return fetch(url, {credentials:'include'}).then(function(r){ return r.text(); }).then(function(t){
    var m = t.match(/<title>([^<]*)<\/title>/);
    return m ? m[1].trim() : '';
  })['catch'](function(){ return null; });     // null = 확인 못 함(끊김) → 죽었다고 단정하지 않는다
}
function isDeadTitle(t){ return t !== null && (!t || t.indexOf('(주)마스터') === 0); }

/* 🔗 정본 → 미러 통째 동기화 (홍팀장 2026-08-27: "매번 링크 깨졌다고 수정 요청 할 수가 없잖아").
   🔴 왜 필요했나: 카탈로그가 1순위로 읽는 건 도구시트 `상품링크` 미러인데,
      "스케줄 작업이 매시간 덮어쓴다"던 게 실제로는 안 돌고 있었다. 그래서 정본 시트에
      새 글번호가 다 들어와 있어도 미러는 옛 글번호 그대로 — 업체가 누르면 마스터 메인으로 튕겼다.
      (2026-08-27 경기창고 게시판 신설: 판매중 74건이 낡았고 그중 54건이 죽은 글)
   🩺 fixDeadLinks 로는 못 막는다 — 그건 masterc 페이지 위에서만 돌고, 살아 있는 옛 글은 안 고친다.
      이건 masterc 없이도 돌고, 정본과 다르면 무조건 맞춘다.
   ⚠️ 안 건드리는 것 둘:
      ① 정본 B칸에 '당일' 같은 메모가 섞인 행 — 주소가 아니면 버린다.
      ② masterc.kr/618298 과 masterc.kr/board_eJGl96/618298 — 글번호가 같으면 같은 글이다.
         표기만 다른 걸 바꿔 얻는 게 없고, 멀쩡한 걸 건드리면 그게 사고다. */
async function syncCanonLinks(linkMap){
  const cur = await api(DOGU, '/values/' + q("'상품링크'!A2:F2400"));
  if(cur.error) return {error:cur.error};
  const rows = cur.values || [];
  const today = new Date().toISOString().slice(0,10);
  const upd=[], add=[], seen={}, changed=[];
  for(let i=0;i<rows.length;i++){
    const nm=(rows[i][0]||'').trim(); if(!nm) continue;
    const k=pkey(nm); seen[k]=1;
    const nu=linkMap[k]; if(!nu) continue;
    const now=(rows[i][2]||'').trim();
    if(now===nu) continue;
    if(now && idOf(now) && idOf(now)===idOf(nu)) continue;
    upd.push({range:"'상품링크'!A"+(i+2)+':F'+(i+2),
      values:[[nm, idOf(nu), nu, (rows[i][3]||'판매').trim()||'판매', '정본동기화', today]]});
    changed.push(nm+' → '+idOf(nu));
  }
  for(const k in linkMap){
    if(seen[k]) continue;
    const p=PRODUCTS.filter(function(x){return pkey(x.name)===k;})[0];
    if(!p) continue;                                  // 지금 파는 상품만 새로 올린다
    add.push([p.name, idOf(linkMap[k]), linkMap[k], '판매', '정본동기화', today]);
  }
  if(upd.length){
    const j=await api(DOGU,'/values:batchUpdate',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({valueInputOption:'RAW',data:upd})});
    if(j.error) return {error:j.error};
  }
  if(add.length){
    const j=await api(DOGU,'/values/'+q("'상품링크'!A2")+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',
      {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({values:add})});
    if(j.error) return {error:j.error};
  }
  return {fixed:upd.length, added:add.length, changed:changed};
}

/* 전부 업데이트 / 링크 업데이트 앞에 공통으로 붙는 단계 — 로그도 여기서 찍는다 */
async function runLinkSync(){
  log('🔗 링크 정본 맞추는 중…', true);
  LINKS = await loadLinks();
  const s = await syncCanonLinks(LINKS);
  if(s.error){ log('❌ 링크 정본 동기화 실패: '+(s.error.message||s.error), true); return s; }
  if(!s.fixed && !s.added) log('✅ 링크 정본 이미 최신 — 고칠 것 없음', true);
  else log('🔗 링크 정본 '+s.fixed+'건 고침'+(s.added?' · 새로 올린 것 '+s.added+'건':'')
      +(s.changed.length?'\n   '+s.changed.slice(0,40).join('\n   ')+(s.changed.length>40?'\n   …외 '+(s.changed.length-40)+'건':''):''), true);
  return s;
}

async function fixDeadLinks(linkMap){
  const CANON = "'상품링크'!A2:F2400";
  const cur = await api(DOGU, '/values/' + q(CANON));
  if(cur.error) return {error:cur.error};
  const rows = cur.values || [];
  const sell = {}; PRODUCTS.forEach(function(p){ sell[pkey(p.name)] = p.name; });

  // 정본 ≠ 소스 인 판매중 상품만 후보. 나머지는 손댈 이유가 없다.
  const cand = [];
  for(let i=0;i<rows.length;i++){
    const nm = (rows[i][0]||'').trim(); if(!nm) continue;
    const k = pkey(nm); if(!sell[k]) continue;
    const now = (rows[i][2]||'').trim(), nu = linkMap[k];
    if(nu && now && nu !== now) cand.push({row:i+2, k:k, name:nm, now:now, next:nu});
  }
  if(!cand.length) return {checked:0, fixed:0, alive:0, unknown:0, fixedList:[]};

  // 지금 링크가 정말 죽었는지 확인 — 살아 있으면 건드리지 않는다(멀쩡한 걸 바꾸면 그게 사고다)
  const fixedList = [], stillAlive = [];
  let unknown = 0, ci = 0;
  async function worker(){
    while(ci < cand.length){
      const c = cand[ci++];
      log('🩺 상세 확인 중 ' + Math.min(ci, cand.length) + '/' + cand.length + ' — ' + c.name);
      const t = await liveTitle(c.now);
      if(t === null){ unknown++; continue; }
      if(!isDeadTitle(t)){ stillAlive.push(c.name); continue; }
      const t2 = await liveTitle(c.next);
      if(t2 === null || isDeadTitle(t2)){ unknown++; continue; }   // 새 링크도 죽었으면 그대로 둔다
      c.title = t2;
      fixedList.push(c);
    }
  }
  await Promise.all([0,1,2].map(worker));

  // 고칠 것만 그 행에 딱 써 넣는다 — 표 전체를 다시 쓰지 않는다
  const today = new Date().toISOString().slice(0,10);
  for(const c of fixedList){
    const j = await api(DOGU, '/values/' + q("'상품링크'!A" + c.row + ':F' + c.row) + '?valueInputOption=RAW',
      {method:'PUT', headers:{'Content-Type':'application/json'},
       body:JSON.stringify({values:[[c.name, idOf(c.next), c.next, '판매', '새소스', today]]})});
    if(j.error) return {error:j.error, fixedList:fixedList};
  }
  return {checked:cand.length, fixed:fixedList.length, alive:stillAlive.length, unknown:unknown, fixedList:fixedList};
}

/* 🔗 링크 업데이트 — 소스 시트의 최신 링크를 캐시에 반영하고,
   그중 **상세가 안 뜨는 링크(죽은 글)만** 골라 정본까지 고친다. */
$('mu-link').onclick=async function(){
  if(BUSY)return;
  BUSY=true;$('mu-link').disabled=true;log('링크 시트에서 최신 링크 가져오는 중…');
  try{
    await runLinkSync();      // 정본 → 미러 통째로 먼저 맞추고 (LINKS 도 여기서 채워진다)
    let changed=0,added=0;
    SEL={};
    for(const p of PRODUCTS){
      const k=pkey(p.name);
      const nu=LINKS[k]||p.sheetUrl||'';
      if(!nu)continue;
      const c=CACHE[k]||(CACHE[k]={name:p.name,id:'',img:'',spec:[],updated:'',link:''});
      if(c.link!==nu){
        if(c.link)changed++;else added++;
        c.link=nu;c.id=idOf(nu);
        SEL[k]=1;   // 링크가 바뀌었으면 사진도 다시 받아야 함
      }
    }
    const j=await saveCache();
    renderSum();renderList();renderRun();
    if(j.error){log('❌ 저장 실패: '+j.error.message);}
    else{
      log('🔗 캐시 링크 갱신 — 바뀐 링크 '+changed+'건 · 새로 채운 링크 '+added+'건');
      /* 카탈로그는 캐시가 아니라 `상품링크` 정본을 먼저 본다 → 여기서 상세 안 뜨는 것만 고쳐야 끝난다. */
      if(!/masterc/.test(location.hostname)){
        log('⚠️ 상세가 뜨는지는 masterc 페이지 위에서만 확인할 수 있습니다. 게시판 글 화면에서 다시 눌러주세요.');
      }else{
        const f=await fixDeadLinks(LINKS);
        if(f.error){log('❌ 정본 수정 실패: '+(f.error.message||f.error));}
        else if(!f.checked){log('✅ 정본과 소스가 같습니다 — 고칠 링크 없습니다.');}
        else{
          log('🩺 상세 확인 '+f.checked+'건 → 안 뜨던 '+f.fixed+'건 고침'
            +(f.alive?' · 멀쩡해서 그대로 둔 것 '+f.alive+'건':'')
            +(f.unknown?' · 확인 못 한 것 '+f.unknown+'건':''));
          if(f.fixed)log('🔧 '+f.fixedList.map(function(c){return c.name+' → '+idOf(c.next);}).join('\n🔧 ')
            +'\n업체 화면에 반영하려면 카탈로그에서 🔄 새로고침을 눌러주세요.');
        }
      }
      if(changed+added)log('바뀐 상품을 자동 선택해 뒀습니다. 아래 [선택 N건 업데이트]를 누르면 사진·스펙을 새로 받습니다.');
    }
  }catch(e){log('❌ '+(e.message||e));}
  BUSY=false;$('mu-link').disabled=false;renderRun();
};

/* 선택분만 수집 → 캐시 병합 저장 → 대기 목록에서 성공분 제거 → 실패 목록 표시 */
$('mu-run').onclick=function(){runSelected();};
async function runSelected(){
  const keys=Object.keys(SEL);
  if(!keys.length||BUSY)return;
  BUSY=true;renderRun();
  $('mu-fail').style.display='none';
  $('mu-bar').style.display='block';
  const bar=$('mu-bar').firstElementChild;
  const targets=keys.map(function(k){
    const p=PRODUCTS.filter(function(x){return pkey(x.name)===k;})[0];
    return p?{key:k,name:p.name,wh:p.wh,url:linkOf(p),sheet:sheetLink(p),tab:p.tab,cell:p.cell}:null;
  }).filter(Boolean);
  /* 🔎 링크 없는 상품은 게시판 제목 검색으로 먼저 찾는다 (masterc 위에서만 가능).
     찾은 링크는 링크 정본 시트에 바로 등록하고, 이어서 사진·스펙까지 받는다. */
  const found=[];
  const noLink=targets.filter(function(t){return !t.url;});
  if(noLink.length){
    if(!/masterc/.test(location.hostname)){
      log('⚠️ 링크 없는 '+noLink.length+'건은 masterc 페이지 위에서 눌러야 자동으로 찾을 수 있습니다.');
    }else{
      log('🔎 링크 없는 '+noLink.length+'건 게시판에서 찾는 중…');
      await ensureMid();
      let fi=0;
      async function fw(){
        while(fi<noLink.length){
          const t=noLink[fi++];
          let f=null;
          try{f=await findLink(t.name);}catch(e){}
          if(f){t.url=f.url;t.foundTitle=f.title;found.push({name:t.name,url:f.url});}
          log('🔎 링크 찾는 중 '+Math.min(fi,noLink.length)+'/'+noLink.length+' — 찾음 '+found.length+'건');
        }
      }
      await Promise.all([0,1,2].map(fw));
      if(found.length){
        const jl=await saveFoundLinks(found);
        if(jl&&jl.error)log('⚠️ 찾은 링크 저장 실패: '+jl.error.message,true);
        else found.forEach(function(f){LINKS[pkey(f.name)]=f.url;});
      }
    }
  }
  const done0=[];let done=0,i=0;
  async function worker(){
    while(i<targets.length){
      const t=targets[i++];
      let r={img:'',spec:[]};
      if(t.url){r=await scrape(t.url);}   // scrape가 사유(why)를 담아 돌려준다 — 여기서 삼키지 않는다
      done0.push({t:t,r:r});
      done++;
      bar.style.width=Math.round(done/targets.length*100)+'%';
      log('수집 '+done+'/'+targets.length);
    }
  }
  await Promise.all([0,1,2,3,4,5].map(worker));
  log('시트에 저장 중…',true);
  const today=new Date().toISOString().slice(0,10);
  const fails=[];
  for(const x of done0){
    const k=x.t.key;
    const c=CACHE[k]||(CACHE[k]={name:x.t.name,id:'',img:'',spec:[],updated:'',link:''});
    c.name=x.t.name;c.link=x.t.url;c.id=idOf(x.t.url);
    // 수집 실패 시 기존 사진·스펙을 빈 값으로 덮어쓰지 않는다 (2026-08-09 왕갈치 사고)
    // 멀쩡한 사진을 '안 열리는 사진'으로 바꾸지도 않는다 (2026-08-11)
    if(x.r.img&&!(x.r.bad&&c.img))c.img=x.r.img;
    if(x.r.spec.length)c.spec=x.r.spec;
    if(x.r.backs&&x.r.backs.length)c.backs=x.r.backs;
    if(x.r.img||x.r.spec.length)c.updated=today;
    if(x.r.bad)x.t.badImg=true;
    x.t.why=x.r.why||'';x.t.whyDetail=x.r.detail||'';
    if(!x.r.img||!x.r.spec.length||x.r.bad)fails.push(x.t);
  }
  /* 대기에서 빼는 기준 = 사진을 새로 받아왔는가. (예전엔 스펙까지 있어야 빠져서,
     ※ 스펙 문구가 없는 글은 대기에 영원히 남아 있었다 — 2026-08-11 사장님 지적) */
  const okNames={};
  done0.forEach(function(x){if(x.r.img||x.r.spec.length)okNames[x.t.key]=1;});
  QUEUE=QUEUE.filter(function(x){return !okNames[pkey(x.name)];});
  done0.forEach(function(x){if(x.r.img&&!x.r.bad)delete BROKEN[x.t.key];});
  const j=await saveCache();
  const jq=await saveQueue();
  BUSY=false;renderSum();renderList();
  if(j.error){log('❌ 저장 실패: '+j.error.message,true);}
  else{
    const gi=done0.filter(x=>x.r.img).length,gs=done0.filter(x=>x.r.spec.length).length;
    log('✅ 완료 — '+done0.length+'건 처리 (사진 '+gi+' · 스펙 '+gs+')'
      +(found.length?('\n🔎 링크 없던 '+found.length+'건은 게시판에서 찾아 링크까지 등록했습니다 — '+found.map(f=>f.name).join(', ')):'')
      +(jq&&jq.error?'\n⚠️ 대기 목록 정리 실패':'')
      +'\n카탈로그를 새로고침하면 반영됩니다.',true);
    SEL={};
  }
  LASTFAIL=fails;
  if(fails.length){
    $('mu-fail').style.display='block';
    $('mu-faillist').innerHTML=fails.map(function(t){
      const why=!t.url?'링크 없음'
        :(t.why==='cross'?'🚫 <b>이 페이지에서는 masterc.kr 글을 읽을 수 없습니다</b> — masterc.kr 상품 글 화면에서 북마클릿을 다시 눌러주세요(masterc.<b>co.</b>kr·카탈로그에서 누르면 전부 이렇게 나옵니다)'
        :t.why==='login'?'🔑 <b>masterc.kr 로그인이 풀렸습니다</b> — 로그인 후 다시 눌러주세요'
        :t.why==='http'?('서버 응답 이상 — '+(t.whyDetail||''))
        :t.why==='gone'?'글이 삭제·이동됐습니다(주소를 열면 마스터 메인으로 튕김) — 게시판에 글을 다시 올려주셔야 합니다'
        :t.why==='noimg'?'글은 멀쩡한데 <b>본문에 첨부 사진이 한 장도 없습니다</b>'
        :(t.badImg?'글은 멀쩡한데 <b>붙어 있는 사진 파일이 서버에서 사라졌습니다</b> — 그 글에 사진을 다시 올려주셔야 합니다'
                  :'사진은 받았는데 ※ 스펙 문구를 못 찾았습니다'));
      const go=t.sheet?(' <a class="mu-go" href="'+t.sheet+'" target="_blank" rel="noopener">시트↗ '+t.tab+' '+t.cell+'</a>'):'';
      return '· ['+t.wh+'] '+t.name.replace(/</g,'&lt;')+go+'<br>&nbsp;&nbsp;'+(t.url?('<a href="'+t.url+'" target="_blank">'+t.url+'</a> — '):'')+why;
    }).join('<br>');
  }
  renderRun();
}

/* 🖼 지금 손봐야 할 것 전부 — 사장님이 누르는 단 하나의 버튼.
   사진없음 + 사진깨짐 + 📮 대기를 한꺼번에 처리한다(예전엔 버튼 두 개로 나뉘어 있어 대기가 안 지워졌음).
   링크 있는 건 그 페이지에서, 링크 없는 건 게시판 제목 검색으로 찾아서 채운다.
   🔗 사진·스펙에 앞서 링크 정본부터 맞춘다 (홍팀장 2026-08-27) — 링크가 낡으면 그 낡은 글에서
      사진을 긁어오게 되고, 업체 화면 링크도 죽은 글로 남는다. 순서가 뒤집히면 둘 다 헛일이다.
      손볼 사진이 하나도 없어도 링크 동기화는 돈다. */
$('mu-fill').onclick=async function(){
  if(BUSY)return;
  BUSY=true;$('mu-fill').disabled=true;
  log('🔗 링크 정본 맞추는 중…');
  try{ await runLinkSync(); }catch(e){ log('❌ 링크 정본 동기화 실패: '+(e.message||e),true); }
  BUSY=false;$('mu-fill').disabled=false;
  const t=PRODUCTS.filter(needsFix);
  if(!t.length){log('🎉 사진·스펙은 손볼 게 없습니다.',true);renderRun();return;}
  SEL={};t.forEach(p=>SEL[pkey(p.name)]=1);
  renderSum();renderList();renderRun();
  runSelected();
};
$('mu-failcp').onclick=function(){
  const txt=LASTFAIL.map(function(t){return '['+t.wh+'] '+t.name+(t.tab?('  (시트 '+t.tab+' '+t.cell+')'):'')+(t.url?('  → '+t.url):'  → 링크 없음');}).join('\n');
  navigator.clipboard.writeText(txt).then(function(){
    const b=$('mu-failcp');b.textContent='복사됨!';setTimeout(function(){b.textContent='📋 목록 복사';},2000);
  });
};

(async function(){
  try{
    log('유통시트·링크시트·캐시 불러오는 중…');
    const r=await Promise.all([loadProducts(),loadCache(),loadLinks(),loadQueue().catch(function(){return [];}),loadOkList().catch(function(){return {};})]);
    PRODUCTS=r[0];CACHE=r[1];LINKS=r[2];QUEUE=r[3];OKLIST=r[4];
    renderSum();renderList();renderRun();
    log('🩹 사진이 실제로 열리는지 검사 중… (처음 한 번만 오래 걸립니다)');
    await scanBroken();
    renderSum();renderList();renderRun();
    const nf=PRODUCTS.filter(needsFix).length;
    log(nf?('위의 [🖼 지금 손봐야 할 '+nf+'건 전부 업데이트]만 누르시면 됩니다.')
         :'✅ 사진·스펙 모두 최신입니다. 손볼 게 없습니다.');
  }catch(e){log('❌ '+(e.message||e));}
})();

window.__mediaUpdater={open:function(){W.style.display='flex';}};
})();
