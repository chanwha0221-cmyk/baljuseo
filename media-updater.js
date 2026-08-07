/* 마스터 유통 — 상품 사진·스펙 업데이트 도구
   masterc.kr 페이지 위에서 북마클릿으로 실행한다.
   여기서 도는 이유: 상품 사진은 masterc.kr 로그인 세션이 있어야 보이고,
   카탈로그(github.io)는 도메인이 달라 그 페이지를 읽을 수 없다. */
(function(){
if(window.__mediaUpdater){window.__mediaUpdater.open();return;}
var YUTONG='1bFfYmNNzPpIztK6_AD918Hu7s3JvaqkGGlwfIi6LxqY';
var DOGU='1t1E8TZ9442OvgFV6Ah5nK6gexHv7xxVFf0jBVDXFUzM';
var TAB='상품이미지';
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
const idOf=u=>{const m=(u||'').match(/(\d{5,})/);return m?m[1]:'';};
const q=s=>encodeURIComponent(s);

/* 유통시트에서 상품 목록(창고·상품명·상세링크) — 카탈로그와 같은 규칙 */
async function loadProducts(){
  const meta=await api(YUTONG,'?fields=sheets.properties(title,hidden)');
  if(meta.error)throw new Error('유통시트 접근 실패: '+meta.error.status);
  const tabs=(meta.sheets||[]).map(s=>s.properties).filter(p=>!p.hidden&&EXCLUDE.indexOf(p.title)<0).map(p=>p.title);
  const ranges=tabs.map(t=>'ranges='+q("'"+t.replace(/'/g,"''")+"'!A1:N400")).join('&');
  const fields=q('sheets(properties.title,data.rowData.values(formattedValue,hyperlink,textFormatRuns(format.link.uri),userEnteredValue.formulaValue))');
  const grid=await api(YUTONG,'?'+ranges+'&fields='+fields);
  const out=[];
  for(const sh of (grid.sheets||[])){
    const name=sh.properties.title;
    const rows=((sh.data&&sh.data[0]&&sh.data[0].rowData)||[]).map(r=>r.values||[]);
    const disp=rows.map(r=>r.map(c=>(c&&c.formattedValue)||''));
    let hr=-1;
    for(let r=0;r<Math.min(40,disp.length);r++){const j=disp[r].join('|');if(j.indexOf('상품명')>=0&&j.indexOf('공급가')>=0){hr=r;break;}}
    if(hr<0)continue;
    const H=disp[hr];
    if(/원가|공급처|기존가/.test(H.join('|')))continue;
    const ci=H.findIndex(h=>h.indexOf('상품명')>=0);
    const cw=H.findIndex(h=>h.indexOf('창고명')>=0);
    if(ci<0)continue;
    for(let r=hr+1;r<disp.length;r++){
      const nm=(disp[r][ci]||'').trim();
      if(!nm||nm==='상품명')continue;
      const cell=rows[r][ci]||{};
      let url=cell.hyperlink||'';
      if(!url&&cell.textFormatRuns)for(const t of cell.textFormatRuns){if(t.format&&t.format.link&&t.format.link.uri){url=t.format.link.uri;break;}}
      if(!url&&cell.userEnteredValue&&cell.userEnteredValue.formulaValue){const m=cell.userEnteredValue.formulaValue.match(/HYPERLINK\(\s*"([^"]+)"/i);if(m)url=m[1];}
      const id=idOf(url);
      if(!id)continue;
      out.push({id:id,name:nm,wh:((cw>=0?(disp[r][cw]||'').trim():'')||name)});
    }
  }
  const seen={},uniq=[];
  for(const p of out){if(seen[p.id])continue;seen[p.id]=1;uniq.push(p);}
  return uniq;
}

/* 최근 변동 상품명 — 상품변동사항 탭의 적용날짜 기준 */
async function loadChanged(days){
  const v=await api(YUTONG,'/values/'+q("'상품변동사항'!A1:M300"));
  const rows=v.values||[];
  let hr=-1;
  for(let i=0;i<Math.min(10,rows.length);i++){if((rows[i]||[]).join('|').indexOf('상품명변동')>=0){hr=i;break;}}
  if(hr<0)return [];
  const H=rows[hr];
  const ci=H.findIndex(h=>(h||'').indexOf('상품명변동')>=0);
  const cd=H.findIndex(h=>(h||'').indexOf('적용')>=0);
  if(ci<0)return [];
  const lim=new Date();lim.setHours(0,0,0,0);lim.setDate(lim.getDate()-((days||1)-1));
  const names=[];
  for(let r=hr+1;r<rows.length;r++){
    const nm=((rows[r]||[])[ci]||'').trim();
    if(!nm)continue;
    if(cd>=0){
      const raw=((rows[r]||[])[cd]||'').replace(/\s/g,'');
      const m=raw.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
      if(m){const d=new Date(+m[1],+m[2]-1,+m[3]);if(d<lim)continue;}
    }
    names.push(nm);
  }
  return names;
}

async function loadCache(){
  const v=await api(DOGU,'/values/'+q("'"+TAB+"'!A1:D3000"));
  const rows=v.values||[];
  const m={};
  for(let i=1;i<rows.length;i++){
    const r=rows[i]||[];
    if(!r[0])continue;
    m[String(r[0]).trim()]={img:r[1]||'',spec:(r[2]?String(r[2]).split('\n'):[]),updated:r[3]||''};
  }
  return m;
}

/* 상품 상세 1건 수집 — masterc.kr 위에서 도니까 로그인 세션이 그대로 붙는다 */
async function scrape(id){
  const r=await fetch('https://masterc.kr/'+id,{credentials:'include',redirect:'follow'});
  const h=await r.text();
  const doc=new DOMParser().parseFromString(h,'text/html');
  let img='';
  const imgs=doc.querySelectorAll('img');
  for(let i=0;i<imgs.length;i++){
    const s=imgs[i].getAttribute('src')||'';
    if(s.indexOf('/files/attach/')>=0){img=s;break;}
  }
  if(img&&img.indexOf('http')!==0)img='https://masterc.co.kr'+(img.charAt(0)==='/'?'':'/')+img;
  img=img.replace('/./','/');
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
  return {id:id,img:img,spec:spec};
}

/* ── 화면 ── */
const S=document.createElement('style');
S.textContent='#mu-wrap{position:fixed;right:16px;bottom:16px;width:420px;max-height:82vh;background:#fff;color:#18211f;border:1px solid #d8ded9;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.25);z-index:2147483647;font-family:"Apple SD Gothic Neo","Malgun Gothic",sans-serif;display:flex;flex-direction:column;font-size:13px}'
+'#mu-wrap *{box-sizing:border-box}'
+'#mu-hd{padding:12px 14px;border-bottom:1px solid #e8ece9;display:flex;align-items:center;gap:8px}'
+'#mu-hd b{font-size:14px;flex:1}'
+'#mu-x{border:none;background:#f0f2ef;border-radius:7px;width:26px;height:26px;cursor:pointer;font-size:15px;line-height:1}'
+'#mu-body{padding:12px 14px;overflow-y:auto;flex:1}'
+'.mu-sum{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}'
+'.mu-sum span{background:#f0f2ef;border-radius:7px;padding:4px 9px;font-size:11.5px}'
+'.mu-sum span b{color:#0f7a5a}'
+'.mu-row{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}'
+'.mu-btn{border:1px solid #cfd6d1;background:#fff;border-radius:8px;padding:7px 11px;font-size:12px;cursor:pointer;font-weight:600;color:#18211f}'
+'.mu-btn:hover{border-color:#0f7a5a;color:#0f7a5a}'
+'.mu-btn.go{background:#0f7a5a;border-color:#0f7a5a;color:#fff}'
+'.mu-btn:disabled{opacity:.45;cursor:default}'
+'#mu-q{width:100%;border:1px solid #d8ded9;border-radius:8px;padding:8px 10px;font-size:13px;margin-bottom:8px}'
+'#mu-list{border:1px solid #eef1ec;border-radius:8px;max-height:34vh;overflow-y:auto}'
+'.mu-it{display:flex;gap:8px;align-items:center;padding:6px 9px;border-bottom:1px solid #f3f5f2}'
+'.mu-it:last-child{border-bottom:none}'
+'.mu-it label{flex:1;cursor:pointer;line-height:1.35}'
+'.mu-it .wh{color:#8a9a92;font-size:10.5px}'
+'.mu-badge{font-size:10px;padding:1px 5px;border-radius:4px;background:#f0f2ef;color:#7b8a83;white-space:nowrap}'
+'.mu-badge.no{background:#fde9e9;color:#c0392b}'
+'#mu-log{margin-top:10px;font-size:11.5px;color:#5d6d66;line-height:1.6;white-space:pre-wrap}'
+'#mu-bar{height:6px;background:#eef1ec;border-radius:4px;overflow:hidden;margin-top:8px;display:none}'
+'#mu-bar i{display:block;height:100%;background:#0f7a5a;width:0}';
document.head.appendChild(S);

const W=document.createElement('div');
W.id='mu-wrap';
W.innerHTML='<div id="mu-hd"><b>📸 상품 사진·스펙 업데이트</b><button id="mu-x">×</button></div>'
+'<div id="mu-body">'
+'<div class="mu-sum" id="mu-sum"><span>불러오는 중…</span></div>'
+'<div class="mu-row">'
+'<button class="mu-btn" data-pick="missing">누락만</button>'
+'<button class="mu-btn" data-pick="new">신규만</button>'
+'<button class="mu-btn" data-pick="changed">오늘 변동</button>'
+'<button class="mu-btn" data-pick="all">전체</button>'
+'<button class="mu-btn" data-pick="none">선택 해제</button>'
+'</div>'
+'<input id="mu-q" placeholder="상품명·창고 검색 (카탈로그에서 📋 복사한 이름 붙여넣기)">'
+'<div id="mu-list"></div>'
+'<div class="mu-row" style="margin-top:10px"><button class="mu-btn go" id="mu-run">선택 0건 업데이트</button></div>'
+'<div id="mu-bar"><i></i></div>'
+'<div id="mu-log"></div>'
+'</div>';
document.body.appendChild(W);
const $=function(id){return document.getElementById(id);};
const log=function(m,keep){$('mu-log').textContent=keep?($('mu-log').textContent+'\n'+m):m;};
$('mu-x').onclick=function(){W.style.display='none';};

let PRODUCTS=[],CACHE={},CHANGED=[],SEL={},BUSY=false;
const noImg=p=>!CACHE[p.id]||!CACHE[p.id].img;
const noSpec=p=>!CACHE[p.id]||!CACHE[p.id].spec.length;
const isMissing=p=>noImg(p)||noSpec(p);
const isNew=p=>!CACHE[p.id];
const isChanged=p=>CHANGED.some(n=>n&&(n===p.name||p.name.indexOf(n)>=0||n.indexOf(p.name)>=0));

function renderSum(){
  $('mu-sum').innerHTML='<span>상품 <b>'+PRODUCTS.length+'</b></span>'
    +'<span>사진없음 <b>'+PRODUCTS.filter(noImg).length+'</b></span>'
    +'<span>스펙없음 <b>'+PRODUCTS.filter(noSpec).length+'</b></span>'
    +'<span>신규 <b>'+PRODUCTS.filter(isNew).length+'</b></span>'
    +'<span>오늘변동 <b>'+PRODUCTS.filter(isChanged).length+'</b></span>';
}
function renderList(){
  const kw=($('mu-q').value||'').trim().toLowerCase();
  const list=PRODUCTS.filter(p=>!kw||p.name.toLowerCase().indexOf(kw)>=0||p.wh.toLowerCase().indexOf(kw)>=0).slice(0,300);
  $('mu-list').innerHTML=list.map(function(p){
    const c=CACHE[p.id];
    const b=[];
    if(!c||!c.img)b.push('<span class="mu-badge no">사진X</span>');
    if(!c||!c.spec.length)b.push('<span class="mu-badge no">스펙X</span>');
    if(c&&c.img&&c.spec.length)b.push('<span class="mu-badge">'+(c.updated||'')+'</span>');
    return '<div class="mu-it"><input type="checkbox" data-id="'+p.id+'"'+(SEL[p.id]?' checked':'')+'>'
      +'<label>'+p.name.replace(/</g,'&lt;')+'<br><span class="wh">'+p.wh+' · '+p.id+'</span></label>'+b.join('')+'</div>';
  }).join('')||'<div class="mu-it">검색 결과 없음</div>';
  const cbs=$('mu-list').querySelectorAll('input[type=checkbox]');
  for(let i=0;i<cbs.length;i++){
    cbs[i].onchange=function(){
      const id=this.getAttribute('data-id');
      if(this.checked)SEL[id]=1;else delete SEL[id];
      renderRun();
    };
  }
}
function renderRun(){
  const n=Object.keys(SEL).length;
  $('mu-run').textContent='선택 '+n+'건 업데이트';
  $('mu-run').disabled=(n===0||BUSY);
}
const picks=W.querySelectorAll('[data-pick]');
for(let i=0;i<picks.length;i++){
  picks[i].onclick=function(){
    const k=this.getAttribute('data-pick');
    SEL={};
    if(k==='missing')PRODUCTS.filter(isMissing).forEach(p=>SEL[p.id]=1);
    else if(k==='new')PRODUCTS.filter(isNew).forEach(p=>SEL[p.id]=1);
    else if(k==='changed')PRODUCTS.filter(isChanged).forEach(p=>SEL[p.id]=1);
    else if(k==='all')PRODUCTS.forEach(p=>SEL[p.id]=1);
    renderList();renderRun();
  };
}
$('mu-q').oninput=renderList;

/* 실행: 고른 상품만 수집 → 시트에 병합 저장(나머지 행은 그대로 유지) */
$('mu-run').onclick=async function(){
  const ids=Object.keys(SEL);
  if(!ids.length||BUSY)return;
  BUSY=true;renderRun();
  $('mu-bar').style.display='block';
  const bar=$('mu-bar').firstElementChild;
  const res=[];let done=0,fail=0,i=0;
  async function worker(){
    while(i<ids.length){
      const id=ids[i++];
      try{
        const r=await scrape(id);
        if(!r.img&&!r.spec.length)fail++;
        res.push(r);
      }catch(e){fail++;}
      done++;
      bar.style.width=Math.round(done/ids.length*100)+'%';
      log('수집 '+done+'/'+ids.length+(fail?(' · 실패 '+fail):''));
    }
  }
  await Promise.all([0,1,2,3,4,5].map(worker));
  log('시트에 저장 중…',true);
  const today=new Date().toISOString().slice(0,10);
  for(const r of res)CACHE[r.id]={img:r.img,spec:r.spec,updated:today};
  const rows=[['id','img','spec','updated']];
  Object.keys(CACHE).sort().forEach(function(id){rows.push([id,CACHE[id].img||'',(CACHE[id].spec||[]).join('\n'),CACHE[id].updated||'']);});
  const j=await api(DOGU,'/values/'+q("'"+TAB+"'!A1:D3000")+'?valueInputOption=RAW',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({values:rows})});
  BUSY=false;renderSum();renderList();
  if(j.error){log('❌ 저장 실패: '+j.error.message,true);}
  else{
    const gi=res.filter(r=>r.img).length,gs=res.filter(r=>r.spec.length).length;
    log('✅ 완료 — '+res.length+'건 처리 (사진 '+gi+' · 스펙 '+gs+')\n카탈로그를 새로고침하면 반영됩니다.',true);
    SEL={};
  }
  renderRun();
};

(async function(){
  try{
    log('유통시트·캐시 불러오는 중…');
    const r=await Promise.all([loadProducts(),loadCache(),loadChanged(1).catch(function(){return [];})]);
    PRODUCTS=r[0];CACHE=r[1];CHANGED=r[2];
    renderSum();renderList();renderRun();
    log('준비 완료. 업데이트할 상품을 고르세요.');
  }catch(e){log('❌ '+(e.message||e));}
})();

window.__mediaUpdater={open:function(){W.style.display='flex';}};
})();
