/* 마스터 유통 — 상품 사진·스펙 업데이트 도구 (v2)
   masterc.kr 페이지 위에서 북마클릿으로 실행한다.
   여기서 도는 이유: 상품 사진은 masterc.kr 로그인 세션이 있어야 보이고,
   카탈로그(github.io)는 도메인이 달라 그 페이지를 읽을 수 없다.

   상품 기준 = 상품명. 링크는 '상품정보 업데이트' 시트의 링크 탭이 정본이다
   (유통시트 하이퍼링크는 낡아서 죽은 링크가 섞여 있음 — 2026-08-07 확인). */
(function(){
if(window.__mediaUpdater){window.__mediaUpdater.open();return;}
var YUTONG='1bFfYmNNzPpIztK6_AD918Hu7s3JvaqkGGlwfIi6LxqY';   // 유통시트(상품 목록)
var LINKSS='1Gfjvk_4u-sFCm-u6xLE5idMxtqmBq9X3dC_BHanq-uQ';   // 상품정보 업데이트(링크 정본)
var DOGU='1t1E8TZ9442OvgFV6Ah5nK6gexHv7xxVFf0jBVDXFUzM';     // 도구시트(캐시·대기목록)
var TAB='상품이미지_v2', QTAB='상품이미지대기', DTAB='상품삭제요청';
var EXCLUDE=['상품변동사항','공급가','리모콘','링크','마감시간','유통시트_1차','유통시트_2차','변동사항'];
const PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDtp37rFMnb+f5e\nkpdJm8VEPbvu/Pr2cEfdLvvVxvnM/WpeIlm2GwXkck0PJUJpx2d3HZB61vScNxzN\n2uaBPf490X9o0qVJW63IJQCmWRNObcWXCxqMd9kxcFVL80PgdhN4CcjoenVMk2oV\nHjx98x5K5ivpGw2dr85RwW7JnX8xxEaa0RI0qcebNtI1xzG/O72+QAy6iw3KGgJE\nSDkLX3YMjPqYpcr45+nxUBI88k6ZdFE2y198d+csMZLPN9Zq0is0LbXaI+NFpXYg\nRoUahEEvjtM0diKwEpPnZ+hfanCFvu5rQq2wqHlVfWYOXNGa0qfnkstsXkv4bpcB\n6Fsb/ZP/AgMBAAECggEAEA8T6/W1KDit4B0evPoaK+DSDLWqjbGLoZ4VpV3zLk9n\neyHuFviffs7cdywI31X6n1lvlGVnFRFCUIS8s7oJLos0BVTKl3jq9s3NS/BT9iZD\nxk+ZRSmqEwWotd+j1AyWhzN+EHuJ5plFf1TSOJ6Pivcfu3o5AtFI60xbXKNYX3fn\nCZgcFMfdEEgUV09CfDJMZ5WZxQFj6cQU8cZxkQH4L6mxXGk2a4nDleAEsSHp53tT\nDYyGlmDdCiiHtjSFkTTZj0aI3eoGSy+5uAwyVuhNv9wZDSdShBOG+4vhFYUGI3/F\n3oNOttROq9PzbjlgFtkfkG2GbKgO5XrAob3SPubUWQKBgQD4FI4Ca6bFsMxBojfy\nWe6RaeEvSVkELD+oxLQU8mzAZRL9QB6qkDTrBabeHLmzvsbBE4knaQG3xgjCrsOC\ny7YSRqtaZtXtA5ABvzh+UAPA5Ei+ZQOAswLUvbnu+/h4rvlC3PylA+5CLAIhWfzP\n6KHmc4Pf/Gq2oirQc2lzy14OxwKBgQD1PbvtQGqFRkr3RxMW2KspgPf572E2jYXL\nTOq+4SlxJRHvWbVpQrzud2AaMMbd406VYGoRwVlfdvLMrHNMnRde5XfxlELSbywm\nQ/uI4WoQFJjHpt/SNKtykFMX6qaBgYLpBHNXfLeV0FXhhqG3K18QgIK3ZnF0s9im\n77OYgrV5CQKBgH/JJrU8enVOcohEZQkjJe4lWecfowixOkFWwWQg07/u0G8+/gzh\np0CAcsnqhgV+eaaux3FTd50QFychGnhfMnQLjuxMGFm0AhPESfdWg/hyHr5kDf/X\nNdgbupDNndmcV60HY+QkODBBtv8y+TSnIe4xBnbz8IwO0Hr7WBBbayG1AoGATDH0\nE5CyB9qBLDcO/UgwVeLWKPdxEswBx9qMDOZUQ+0ql10d+ihcHxND7p89Cm+3WL3t\n9rpGFF0WrvTdle4w9rEBBTP1VwBnjTQOEMdIdtqPZWi5ncvzgNLKnmGvfglJLTDO\nzV3YhFmIdVupHwoArVXgRy8zDPlb1PIgsL/btlECgYB4WoD0Nifwfyt84vm7Ixyi\nO9TZF0nXN20Z3JQbzV84DNTMvyG+FyGAmtTwj2gFRwrQaSXxMAr0g2RjsP2QOfL9\nXd7/MhL5p6ri9vIKcnGGd1K133ZLyWFskEPCGpYFHwanR9uT3jy+9DOtYs9xH289\n4k+8F7+ROHiYYPc5EeKr/g==\n-----END PRIVATE KEY-----\n";
const CLIENT_EMAIL='sheets-writer@baljuseo-sheets.iam.gserviceaccount.com';

let _tok=null,_exp=0;
async function token(){
  const now=Math.floor(Date.now()/1000);
  if(_tok&&_exp-now>300)return _tok;
  const enc=o=>btoa(JSON.stringify(o)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const toSign=enc({alg:'RS256',typ:'JWT'})+'.'+enc({iss:CLIENT_EMAIL,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',exp:now+3600,iat:now});
  const pem=PRIVATE_KEY.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g,'');
  const bin=Uint8Array.from(atob(pem),c=>c.charCodeAt(0));
  const key=await crypto.subtle.importKey('pkcs8',bin,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const sg=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(toSign));
  const jwt=toSign+'.'+btoa(String.fromCharCode.apply(null,new Uint8Array(sg))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const res=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion='+jwt});
  const d=await res.json();_tok=d.access_token;_exp=now+3600;return _tok;
}
async function api(ss,path,opt){
  const t=await token();
  const o=Object.assign({headers:{}},opt||{});
  o.headers=Object.assign({Authorization:'Bearer '+t},o.headers||{});
  const r=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+ss+path,o);
  return r.json();
}
const q=s=>encodeURIComponent(s);
const pkey=s=>String(s||'').replace(/\s+/g,'').toLowerCase();
const idOf=u=>{const m=(u||'').match(/(\d{5,})/);return m?m[1]:'';};

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
  const fields=q('sheets(properties(title,sheetId),data.rowData.values(formattedValue,hyperlink,textFormatRuns(format.link.uri),userEnteredValue.formulaValue))');
  const grid=await api(YUTONG,'?'+ranges+'&fields='+fields);
  const out=[],seen={};
  for(const sh of (grid.sheets||[])){
    const tabName=sh.properties.title;
    const gid=sh.properties.sheetId;
    const rows=((sh.data&&sh.data[0]&&sh.data[0].rowData)||[]).map(r=>r.values||[]);
    const disp=rows.map(r=>r.map(c=>(c&&c.formattedValue)||''));
    let hr=-1;
    for(let i=0;i<Math.min(40,disp.length);i++){const j=disp[i].join('|');if(j.indexOf('상품명')>=0&&j.indexOf('공급가')>=0){hr=i;break;}}
    if(hr<0)continue;
    const H=disp[hr];
    if(/원가|공급처|기존가/.test(H.join('|')))continue;
    const ci=H.findIndex(h=>h.indexOf('상품명')>=0);
    const cw=H.findIndex(h=>h.indexOf('창고명')>=0);
    if(ci<0)continue;
    for(let i=hr+1;i<disp.length;i++){
      const nm=(disp[i][ci]||'').trim();
      if(!nm||nm==='상품명')continue;
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
async function loadQueue(){
  const v=await api(DOGU,'/values/'+q("'"+QTAB+"'!A2:C1000"));
  const out=[];
  for(const r of (v.values||[])){const nm=(r[0]||'').trim();if(nm)out.push({name:nm,at:r[1]||'',src:r[2]||''});}
  return out;
}
/* 삭제 요청 — 이 도구는 유통시트에 쓰기 권한이 없다(서비스계정=읽기 전용, 키가 공개라 일부러 안 올림).
   그래서 여기서는 "삭제할 상품"만 적어두고, 실제 행 삭제는 팀장님 구글 계정으로 도는
   상품정보 업데이트(byeondong)의 [🗑 삭제 대기 처리] 버튼이 한다. */
async function loadDelReq(){
  const v=await api(DOGU,'/values/'+q("'"+DTAB+"'!A2:E400"));
  const out=[];
  for(const r of (v.values||[])){
    const nm=(r[0]||'').trim();
    if(nm&&(r[4]||'')!=='완료')out.push({name:nm,tab:r[1]||'',cell:r[2]||'',at:r[3]||''});
  }
  return out;
}
async function addDelReq(p){
  const now=new Date();
  const p2=n=>(n<10?'0':'')+n;
  const at=now.getFullYear()+'-'+p2(now.getMonth()+1)+'-'+p2(now.getDate())+' '+p2(now.getHours())+':'+p2(now.getMinutes());
  return api(DOGU,'/values/'+q("'"+DTAB+"'!A:E")+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',
    {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({values:[[p.name,p.tab||'',p.cell||'',at,'']]})});
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
async function scrape(url){
  const r=await fetch(url,{credentials:'include',redirect:'follow'});
  const h=await r.text();
  const doc=new DOMParser().parseFromString(h,'text/html');
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
  if(!img&&cands.length)img=cands[0];
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
  return {img:img,spec:spec,backs:backs};
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
+'<div class="mu-row"><button class="mu-btn go" id="mu-runq" style="width:100%">⚡ 오늘 변경분(대기) 한번에 업데이트</button></div>'
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

let PRODUCTS=[],CACHE={},LINKS={},QUEUE=[],SEL={},BUSY=false,LASTFAIL=[],FILTER='',DELREQ=[];
const inDel=p=>DELREQ.some(x=>pkey(x.name)===pkey(p.name));
const cacheOf=p=>CACHE[pkey(p.name)];
const linkOf=p=>{const c=cacheOf(p);return LINKS[pkey(p.name)]||(c&&c.link)||p.sheetUrl||'';};
const noImg=p=>{const c=cacheOf(p);return !c||!c.img;};
const noSpec=p=>{const c=cacheOf(p);return !c||!c.spec.length;};
const isMissing=p=>noImg(p)||noSpec(p);
const inQueue=p=>QUEUE.some(x=>pkey(x.name)===pkey(p.name));

/* 요약 칩 = 목록 필터. 누르면 아래 목록이 그 상품들만 보여준다(뭐가 문제인지 바로 확인). */
const FILTERS={'':()=>true,queue:inQueue,noimg:noImg,nospec:noSpec,nolink:p=>!linkOf(p)};
function renderSum(){
  const chip=(k,label,n)=>'<span data-f="'+k+'"'+(FILTER===k?' class="on"':'')+'>'+label+' <b>'+n+'</b></span>';
  $('mu-sum').innerHTML=chip('','상품',PRODUCTS.length)
    +chip('queue','📮 대기',PRODUCTS.filter(inQueue).length)
    +chip('noimg','사진없음',PRODUCTS.filter(noImg).length)
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
    if(!c||!c.spec.length)b.push('<span class="mu-badge no">스펙X</span>');
    if(c&&c.img&&c.spec.length)b.push('<span class="mu-badge">'+(c.updated||'')+'</span>');
    const su=sheetLink(p);
    const go=su?('<a class="mu-go" href="'+su+'" target="_blank" rel="noopener" title="유통시트 '+p.tab+' 탭 '+p.cell+'칸으로 이동">시트↗</a>'):'';
    // 🗑 = 유통시트에서 이 상품 행을 지우도록 요청(운영 안 할 상품). 링크 없는 상품에만 노출.
    const del=inDel(p)?'<span class="mu-badge no">삭제대기</span>'
              :(!linkOf(p)&&p.tab?('<button class="mu-go del" data-del="'+pkey(p.name)+'" title="유통시트에서 이 상품 행 삭제 요청">🗑</button>'):'');
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
      if(!confirm('유통시트에서 이 상품 행을 삭제할까요?\n\n'+p.name+'\n위치: '+p.tab+' 탭 '+p.cell+'\n\n지금 바로 지워지는 건 아니고 삭제 대기에 올라갑니다.\n실제 삭제는 상품정보 업데이트(변동가) 도구에서 [🗑 삭제 대기 처리]를 누르면 팀장님 계정으로 실행됩니다.'))return;
      this.disabled=true;this.textContent='…';
      const j=await addDelReq(p);
      if(j&&j.error){alert('삭제 요청 실패: '+j.error.message);this.disabled=false;this.textContent='🗑';return;}
      DELREQ.push({name:p.name,tab:p.tab,cell:p.cell});
      renderList();
      log('🗑 삭제 대기에 올렸습니다 — '+p.name+' ('+p.tab+' '+p.cell+')\n실제 삭제는 상품정보 업데이트 도구의 [🗑 삭제 대기 처리] 버튼에서 실행됩니다. (현재 대기 '+DELREQ.length+'건)');
    };
  }
}
function renderRun(){
  const n=Object.keys(SEL).length;
  $('mu-run').textContent='선택 '+n+'건 업데이트';
  $('mu-run').disabled=(n===0||BUSY);
  const nq=PRODUCTS.filter(inQueue).length;
  $('mu-runq').textContent=nq?('⚡ 오늘 변경분 '+nq+'건 한번에 업데이트'):'⚡ 오늘 변경분 없음 (대기 0건)';
  $('mu-runq').disabled=(nq===0||BUSY);
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

/* 🔗 링크 업데이트 — 상품정보 업데이트 시트의 링크 탭에서 최신 링크를 받아 캐시에 반영.
   링크가 바뀐 상품은 사진도 바뀌었을 가능성이 크니 자동으로 선택해 둔다. */
$('mu-link').onclick=async function(){
  if(BUSY)return;
  BUSY=true;$('mu-link').disabled=true;log('링크 시트에서 최신 링크 가져오는 중…');
  try{
    LINKS=await loadLinks();
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
    if(j.error)log('❌ 저장 실패: '+j.error.message);
    else log('🔗 링크 갱신 완료 — 바뀐 링크 '+changed+'건 · 새로 채운 링크 '+added+'건\n'
      +(changed+added?'바뀐 상품을 자동 선택해 뒀습니다. 아래 [선택 N건 업데이트]를 누르면 사진·스펙을 새로 받습니다.':'바뀐 링크가 없습니다.'));
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
  const done0=[];let done=0,i=0;
  async function worker(){
    while(i<targets.length){
      const t=targets[i++];
      let r={img:'',spec:[]};
      if(t.url){try{r=await scrape(t.url);}catch(e){}}
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
    if(x.r.img)c.img=x.r.img;
    if(x.r.spec.length)c.spec=x.r.spec;
    if(x.r.backs&&x.r.backs.length)c.backs=x.r.backs;
    if(x.r.img||x.r.spec.length)c.updated=today;
    if(!x.r.img||!x.r.spec.length)fails.push(x.t);
  }
  const okNames={};
  done0.forEach(function(x){if(x.r.img&&x.r.spec.length)okNames[x.t.key]=1;});
  QUEUE=QUEUE.filter(function(x){return !okNames[pkey(x.name)];});
  const j=await saveCache();
  const jq=await saveQueue();
  BUSY=false;renderSum();renderList();
  if(j.error){log('❌ 저장 실패: '+j.error.message,true);}
  else{
    const gi=done0.filter(x=>x.r.img).length,gs=done0.filter(x=>x.r.spec.length).length;
    log('✅ 완료 — '+done0.length+'건 처리 (사진 '+gi+' · 스펙 '+gs+')'
      +(jq&&jq.error?'\n⚠️ 대기 목록 정리 실패':'')
      +'\n카탈로그를 새로고침하면 반영됩니다.',true);
    SEL={};
  }
  LASTFAIL=fails;
  if(fails.length){
    $('mu-fail').style.display='block';
    $('mu-faillist').innerHTML=fails.map(function(t){
      const why=!t.url?'링크 없음':'링크는 있는데 상품정보를 못 읽음(글이 삭제·이동됐을 수 있음)';
      const go=t.sheet?(' <a class="mu-go" href="'+t.sheet+'" target="_blank" rel="noopener">시트↗ '+t.tab+' '+t.cell+'</a>'):'';
      return '· ['+t.wh+'] '+t.name.replace(/</g,'&lt;')+go+'<br>&nbsp;&nbsp;'+(t.url?('<a href="'+t.url+'" target="_blank">'+t.url+'</a> — '):'')+why;
    }).join('<br>');
  }
  renderRun();
}

/* ⚡ 오늘 변경분 한번에 — 상품정보 업데이트(byeondong 엑셀 생성)에서 쌓인 대기 목록을 고르고 바로 실행 */
$('mu-runq').onclick=function(){
  if(BUSY)return;
  const q=PRODUCTS.filter(inQueue);
  if(!q.length){log('📮 대기 목록이 비어 있습니다. (상품정보 업데이트에서 📗 엑셀 생성을 하면 여기에 쌓입니다)');return;}
  SEL={};q.forEach(p=>SEL[pkey(p.name)]=1);
  FILTER='queue';renderSum();renderList();renderRun();
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
    const r=await Promise.all([loadProducts(),loadCache(),loadLinks(),loadQueue().catch(function(){return [];}),loadDelReq().catch(function(){return [];})]);
    PRODUCTS=r[0];CACHE=r[1];LINKS=r[2];QUEUE=r[3];DELREQ=r[4];
    renderSum();renderList();renderRun();
    const nq=PRODUCTS.filter(inQueue).length;
    log(nq?('📮 상품정보 업데이트에서 넘어온 대기 '+nq+'건이 있습니다. [📮 업데이트 대기]로 한 번에 고를 수 있어요.')
         :'준비 완료. 업데이트할 상품을 고르세요.');
  }catch(e){log('❌ '+(e.message||e));}
})();

window.__mediaUpdater={open:function(){W.style.display='flex';}};
})();
