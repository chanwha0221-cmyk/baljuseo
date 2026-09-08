/* 🔎 검색 별칭 사전 — 업체가 쓰는 말로 우리 상품이 나오게 (홍팀장 2026-09-08)
   ─────────────────────────────────────────────────────────────────────────
   왜: 우리 꽃게 이름은 「연안 활 대숫게 1kg」이라 **'숫게'라고 쳐야만** 나왔다.
       업체 사장님들은 '꽃게'로 친다. 카탈로그는 파는 화면이지 우리 내부 용어 사전이 아니다.
       (홍팀장: "이건 업체 편의에 의해 업데이트 되어야 하다 보니 유사 검색어도 넣어줘야겠다.")

   어떻게: 검색어 안에 사전에 있는 낱말이 있으면, **그 낱말만 같은 무리의 다른 낱말로 바꿔**
       또 한 번 찾아본다. 낱말을 통째로 버리고 무리 전체를 갖다 붙이지 않는다 —
       그래야 '꽃게 1kg'이 '대숫게 1kg'은 잡고 '대숫게 500g'은 안 잡는다.

   🔴 추측 매칭이 아니다. 여기 손으로 적어둔 낱말만 오간다(§3-3의 상품 매칭 규칙은 발주 저장 쪽이고,
      이건 **찾아 보여주는** 자리다 — 고르는 건 사람이 한다).
   🔴 한 글자 낱말은 넣지 말 것('게'를 넣으면 대게·홍게·골뱅이까지 다 딸려온다).

   쓰는 곳: catalog.html / catalog-test.html 검색, order.js 발주 후보·🔎 직접 찾기.
   늘리는 법: 아래 GROUPS 에 한 줄 추가하면 세 화면에 같이 먹는다. */
(function(){
  var pk = function(s){ return String(s==null?'':s).replace(/\s+/g,'').toLowerCase(); };

  /* 같은 무리로 묶인 말끼리 서로 통한다(양방향).
     ⚠️ 무리를 크게 만들수록 엉뚱한 게 섞인다. 진짜 같은 물건을 가리키는 말만 넣을 것. */
  var GROUPS = [
    // 🦀 꽃게 — 우리 이름은 숫게·대숫게, 업체는 꽃게라고 친다
    ['꽃게','꽃개','숫게','숫개','수게','대숫게','대수게','암게','암꽃게','알꽃게']
  ];

  var GK = GROUPS.map(function(g){
    var seen={}, out=[];
    g.forEach(function(w){ var k=pk(w); if(k.length>=2&&!seen[k]){seen[k]=1;out.push(k);} });
    return out;
  });

  /* 검색어 → 실제로 찾아볼 말들. 첫 번째는 언제나 사람이 친 그대로다. */
  function variants(q){
    var qk = pk(q), out = [qk];
    if(qk.length < 2) return out;
    GK.forEach(function(g){
      g.forEach(function(w){
        if(qk.indexOf(w) < 0) return;
        g.forEach(function(alt){
          if(alt === w) return;
          var v = qk.split(w).join(alt);
          if(v && out.indexOf(v) < 0) out.push(v);
        });
      });
    });
    return out;
  }

  // 이름 하나가 검색어에 걸리나 — 별칭까지 쳐서 본다
  function match(name, q){
    var nk = pk(name);
    if(!nk) return false;
    var vs = variants(q);
    for(var i=0;i<vs.length;i++){ if(vs[i] && nk.indexOf(vs[i]) >= 0) return true; }
    return false;
  }

  // 사람이 친 그대로 말고 **별칭으로** 걸린 것인지 (안내 문구용)
  function byAlias(name, q){
    var nk = pk(name), qk = pk(q);
    if(!nk || !qk) return false;
    return nk.indexOf(qk) < 0 && match(name, q);
  }

  window.SEARCHSYN = { pk: pk, variants: variants, match: match, byAlias: byAlias, groups: GROUPS };
})();
