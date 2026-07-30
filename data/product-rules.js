// 상품명 매핑 + 박스 분리 규칙 (pp 함수)
// 입력: 업체명(cl), 상품명 원본(pr), 수량(qty)
// 출력: {name, qty, maxB} - maxB는 한 박스 최대 수량(초과 시 박스 분리)
//
// 새 매핑 규칙 추가는 이 파일에서. update.bat 그대로.

function norm(s){return s.replace(/\s+/g,'');}

function pp(cl,pr,qty){
  const FREE_SHIP_KEYWORDS=['동치미','옥돔','초당옥수수'];
  for(const kw of FREE_SHIP_KEYWORDS){
    if(norm(pr).includes(kw)){
      let _r=pr.replace(/\*/g,'x');
      const gaeM=_r.match(/(\d+)\s*개\s*$/);
      const xM=!gaeM&&_r.match(/[xX×]\s*(\d+)\s*$/);
      let _qty=qty,_cn=_r;
      if(gaeM){_qty=parseInt(gaeM[1]);_cn=_r.slice(0,gaeM.index).trim();}
      else if(xM){_qty=parseInt(xM[1]);_cn=_r.slice(0,xM.index).trim();}
      _cn=_cn.replace(/(\d+)[kK]\b/g,'$1kg').trim();
      return{name:_cn,qty:_qty,maxB:1};
    }
  }
  if(cl==='빅피쉬마켓'){
    const colonIdx=pr.indexOf(':');const _actual=norm(colonIdx>=0?pr.slice(colonIdx+1):pr);
    if(_actual.includes('알도루묵'))return{name:'알도루묵 1팩',qty,maxB:999};
    if(_actual.includes('양미리'))return{name:'양미리 1kg',qty,maxB:999};
  }
  let r=pr.replace(/\*/g,'x');
  if(r.includes('+')){const it=r.split('+').map(i=>i.trim());return{name:it.map(i=>/[xX×]\s*\d+/.test(i)?i:i+' x 1').join(' / '),qty,maxB:999};}
  if(r.includes('/')){const pt=r.split('/').map(s=>s.trim()).filter(Boolean);if(pt.length>1)return{name:pt.map(i=>/[xX×]\s*\d+/.test(i)?i:i+' x 1').join(' / '),qty,maxB:999};r=pt[0];}
  const qm=r.match(/\s*[xX×]\s*(\d+)$/);let cn=r;
  if(qm){qty=parseInt(qm[1]);cn=r.slice(0,qm.index).trim();}
  cn=cn.replace(/\[마스터\]/g,'').replace('연안명게','연안 멍게').replace('난간','난각').replace(/초별/g,'초벌').replace(/(\d+)[kK]\b/g,'$1kg').trim();
  if(cn.includes('자연산 급냉 대구'))cn='급냉 국내산 대구 1.5kg';
  if(norm(cn).includes('참치오마카세'))cn='참치 오마카세 한판';
  if(cl==='신선한아침'&&cn.includes('노르웨이 생연어'))cn='연안 생연어';
  if(cn.includes('유정란')){const em=cn.match(/(\d+)\s*[구알]/);const en=em?em[1]:'';if(cn.includes('1번'))return{name:'자연방사 난각 1번 유정란 '+en+'구',qty,maxB:999};if(cn.includes('2번'))return{name:'동물복지 난각 2번 유정란 '+en+'구',qty,maxB:999};}
  if(cl==='아크미소프트'&&cn.includes('홍어'))cn='아 '+cn;
  const wm=cn.match(/([\d.]+)kg/);const gm=!wm&&cn.match(/(\d+)g\b/);const wi=wm?parseFloat(wm[1]):gm?parseInt(gm[1])/1000:1;
  const pn=qm?cn:cn.replace(/[xX×]\s*[\d.]+/g,'').trim();
  if(cl==='대상수산'){
    // 반건조 오징어 피데기: 5미 단위로 발주 (5미=x1, 10미=x2). 마지막 'N미'가 발주 마릿수 (2026-07-30 사장님 지시)
    if((norm(pn).includes('피데기')||norm(pn).includes('반건조오징어'))&&!norm(pn).includes('버터')){const _mi=norm(pn).match(/(\d+)미/g);const _n=_mi?parseInt(_mi[_mi.length-1]):5;return{name:'정품 반건조 오징어 1.2kg급',qty:Math.max(1,Math.round(qty*_n/5)),maxB:999};}
    if(norm(pn).includes('호래기'))return{name:'횟감 대짜 호래기 500g',qty:Math.round(qty*wi*2),maxB:999};
    if(norm(pn).includes('참소라'))return{name:'연안 주먹참소라 1kg',qty:Math.round(qty*wi),maxB:999};
    if(norm(pn).includes('주꾸미')||norm(pn).includes('쭈꾸미'))return{name:'연안 활 주꾸미 1kg',qty:Math.round(qty*wi),maxB:999};
    if(norm(pn).includes('전복'))return{name:'연안 오육미전복 1kg',qty:Math.round(qty*wi),maxB:999};
    if(norm(pn).includes('멍게'))return{name:'향긋 깐 멍게 500g',qty:Math.round(qty*wi*2),maxB:999};
    if(norm(pn).includes('해삼'))return{name:'자연산 활 해삼 500g',qty:Math.round(qty*wi*2),maxB:999};
    if(norm(pn).includes('홍가리비'))return{name:'활 홍가리비 1kg',qty:Math.round(qty*wi),maxB:999};
    if(norm(pn).includes('바지락')&&!norm(pn).includes('깐'))return{name:'왕 바지락 1kg',qty:Math.round(qty*wi),maxB:999};
    if(norm(pn).includes('바지락살')||(norm(pn).includes('깐')&&norm(pn).includes('바지락')))return{name:'깐 바지락 500g',qty:Math.round(qty*wi*2),maxB:999};
  }
  if(norm(pn).includes('홍가리비'))return{name:'활 홍가리비 1kg',qty,maxB:999};
  if(norm(pn).includes('생굴')&&!norm(pn).includes('kg'))return{name:'생굴 1kg',qty,maxB:999};
  if(norm(pn).includes('꼼장어'))return{name:'생물 꼼장어 1kg',qty,maxB:999};
  if(norm(pn).includes('염소탕'))return{name:'김대헌 장수 염소탕 1팩',qty,maxB:999};
  if(norm(pn).includes('자반')&&norm(pn).includes('고등어'))return{name:'국내산 자반 고등어 가정용 10미',qty,maxB:999};
  if(norm(pn).includes('삼배체')&&norm(pn).includes('굴'))return{name:'통통 삼배체 굴 1kg',qty:Math.max(1,Math.round(qty*wi)),maxB:1};
  if(norm(pn).includes('도다리회')){const units=Math.max(1,Math.round(qty*wi*1000/250));return{name:'통통 활 도다리회 250g',qty:units,maxB:999};}
  if(norm(pn).includes('바지락살')||(norm(pn).includes('깐')&&norm(pn).includes('바지락')))return{name:'깐 바지락 500g',qty,maxB:999};
  if(norm(pn).includes('대극천'))return{name:'프리미엄 대극천 복숭아 2kg',qty,maxB:1};
  if(norm(pn).includes('총알한치')&&norm(pn).includes('1kg'))return{name:'총알한치 500g',qty:qty*2,maxB:999};
  if((norm(pn).includes('피데기')||norm(pn).includes('반건조오징어'))&&!norm(pn).includes('버터'))return{name:'반건조오징어 1kg 5미',qty,maxB:999};
  if(cl==='대상수산'&&(norm(pn).includes('바다장어')||norm(pn).includes('바다 장어')))return{name:'비만 바다장어 1kg',qty:Math.round(qty*wi),maxB:999};
  if(cl==='대상수산'&&(norm(pn).includes('생물 풍천 민물 장어')||(norm(pn).includes('민물')&&norm(pn).includes('장어'))))return{name:'특왕 민물장어 1kg',qty:Math.round(qty*wi),maxB:999};
  if(norm(pn).includes('풍천')&&norm(pn).includes('장어'))return{name:pn.replace(/([\d.]+)kg/,'1kg'),qty:Math.round(qty*wi),maxB:999};
  if(norm(pn).includes('풀도다리'))return{name:'연안 활 풀도다리 1kg',qty:Math.round(qty*wi),maxB:999};
  if(norm(pn).includes('골뱅이')&&(norm(pn).includes('급냉')||norm(pn).includes('자숙')||norm(pn).includes('어묵')))return{name:pn,qty,maxB:999}; // 급냉·자숙·어묵탕 골뱅이는 활 골뱅이 아님 — 그대로 (2026-07-29)
  if(norm(pn).includes('골뱅이'))return{name:'동해 활 골뱅이 1kg',qty:Math.round(qty*wi),maxB:999};
  if(norm(pn).includes('거북손')&&norm(pn).includes('1kg'))return{name:'연안 거북손 500g',qty:qty*2,maxB:999};
  if(norm(pn).includes('석화')){const sw=wm?wm[0]:'';return{name:('국내산 석화 '+sw).trim(),qty,maxB:qty>=2?1:999};}
  if(norm(pn).includes('새꼬막'))return{name:pn,qty,maxB:qty>=2?1:999};
  if(norm(pn).includes('박달홍게'))return{name:pn,qty,maxB:1};
  if(norm(pn).includes('생대구'))return{name:pn,qty,maxB:6};
  if(norm(pn).includes('옥돔')){const _m=pn.match(/(\d+)\s*(?:미|마리)/);return{name:'제주 반건조 옥돔 '+(_m?_m[1]:'5')+'마리',qty,maxB:999};}
  if(norm(pn).includes('보리굴비'))return{name:pn.replace(/(\d+)\s*미/,'$1마리'),qty,maxB:999};
  if(norm(pn).includes('미더덕'))return{name:'통통 미더덕 1kg',qty:Math.round(qty*wi),maxB:999};
  // 찐한국 시리즈 (자체제작, 상품명 미정의 → 오타 그대로 들어옴. 키워드 정규화)
  {const _z=norm(pn).toLowerCase();
    if(_z.includes('고무장갑')){
      if(/퍼플|purple|보라/.test(_z))return{name:'찐한국 고무장갑 퍼플',qty,maxB:999};
      if(/그레이|그래이|그레의|gray|grey|회색/.test(_z))return{name:'찐한국 고무장갑 그레이',qty,maxB:999};
    }
    if(_z.includes('주방')&&_z.includes('세'))return{name:'찐한국 주방세제 500ml',qty,maxB:999};
    if(_z.includes('핸드')||_z.includes('손결')||_z.includes('handwash')||_z.includes('핸워'))return{name:'찐한국 손결 핸드워시 300ml',qty,maxB:999};
    if(_z.includes('치약'))return{name:'찐한국 그냥치약 100g',qty,maxB:999};
  }
  return{name:pn,qty,maxB:999};
}
