/* =============================================================
   상품 제안서 설정 파일 — 홍찬화 팀장 버전
   -------------------------------------------------------------
   원비님의 master-proposal(wonbi.github.io) 카피본 (2026-08-06).
   원본과 달리 Supabase/DB 연결 없음 — 상품은 data/products.json(정적)에서 읽음.
   (원본의 '온라인 셀러(v=seller)' 버전 상품 23종 + 문구를 스냅샷)
   ● 담당자/문구는 여기서 고치면 됩니다.
   ● 상품 수정: data/products.json 편집 (또는 하비서한테 "제안서 상품 바꿔줘")
   ============================================================= */

window.PROPOSAL_CONFIG = {

  /* Supabase 미사용 — 비워두면 data/products.json(기본 상품)을 표시 */
  supabase: {
    url: "",
    anonKey: ""
  },

  catalogApiUrl: "",

  /* 원본의 공개시트(gviz) 방식 미사용 */
  sheetId: "",
  sheetGid: "0",

  /* -----------------------------------------------------------
     상품 데이터 — 도구 시트의 '제안서상품' 탭 (서비스계정으로 읽고 씀)
     · 사이트: 이 탭을 실시간으로 읽어 표시 (실패 시 data/products.json 폴백)
     · 관리:   admin.html (로그인 없음) 에서 이 탭을 수정
  ----------------------------------------------------------- */
  dataSheet: {
    id: "1t1E8TZ9442OvgFV6Ah5nK6gexHv7xxVFf0jBVDXFUzM",
    tab: "제안서상품"
  },

  /* 서비스계정 (다른 baljuseo 도구들과 동일한 하우스 패턴) */
  svc: {
    email: "sheets-writer@baljuseo-sheets.iam.gserviceaccount.com",
    key: `-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDtp37rFMnb+f5e\nkpdJm8VEPbvu/Pr2cEfdLvvVxvnM/WpeIlm2GwXkck0PJUJpx2d3HZB61vScNxzN\n2uaBPf490X9o0qVJW63IJQCmWRNObcWXCxqMd9kxcFVL80PgdhN4CcjoenVMk2oV\nHjx98x5K5ivpGw2dr85RwW7JnX8xxEaa0RI0qcebNtI1xzG/O72+QAy6iw3KGgJE\nSDkLX3YMjPqYpcr45+nxUBI88k6ZdFE2y198d+csMZLPN9Zq0is0LbXaI+NFpXYg\nRoUahEEvjtM0diKwEpPnZ+hfanCFvu5rQq2wqHlVfWYOXNGa0qfnkstsXkv4bpcB\n6Fsb/ZP/AgMBAAECggEAEA8T6/W1KDit4B0evPoaK+DSDLWqjbGLoZ4VpV3zLk9n\neyHuFviffs7cdywI31X6n1lvlGVnFRFCUIS8s7oJLos0BVTKl3jq9s3NS/BT9iZD\nxk+ZRSmqEwWotd+j1AyWhzN+EHuJ5plFf1TSOJ6Pivcfu3o5AtFI60xbXKNYX3fn\nCZgcFMfdEEgUV09CfDJMZ5WZxQFj6cQU8cZxkQH4L6mxXGk2a4nDleAEsSHp53tT\nDYyGlmDdCiiHtjSFkTTZj0aI3eoGSy+5uAwyVuhNv9wZDSdShBOG+4vhFYUGI3/F\n3oNOttROq9PzbjlgFtkfkG2GbKgO5XrAob3SPubUWQKBgQD4FI4Ca6bFsMxBojfy\nWe6RaeEvSVkELD+oxLQU8mzAZRL9QB6qkDTrBabeHLmzvsbBE4knaQG3xgjCrsOC\ny7YSRqtaZtXtA5ABvzh+UAPA5Ei+ZQOAswLUvbnu+/h4rvlC3PylA+5CLAIhWfzP\n6KHmc4Pf/Gq2oirQc2lzy14OxwKBgQD1PbvtQGqFRkr3RxMW2KspgPf572E2jYXL\nTOq+4SlxJRHvWbVpQrzud2AaMMbd406VYGoRwVlfdvLMrHNMnRde5XfxlELSbywm\nQ/uI4WoQFJjHpt/SNKtykFMX6qaBgYLpBHNXfLeV0FXhhqG3K18QgIK3ZnF0s9im\n77OYgrV5CQKBgH/JJrU8enVOcohEZQkjJe4lWecfowixOkFWwWQg07/u0G8+/gzh\np0CAcsnqhgV+eaaux3FTd50QFychGnhfMnQLjuxMGFm0AhPESfdWg/hyHr5kDf/X\nNdgbupDNndmcV60HY+QkODBBtv8y+TSnIe4xBnbz8IwO0Hr7WBBbayG1AoGATDH0\nE5CyB9qBLDcO/UgwVeLWKPdxEswBx9qMDOZUQ+0ql10d+ihcHxND7p89Cm+3WL3t\n9rpGFF0WrvTdle4w9rEBBTP1VwBnjTQOEMdIdtqPZWi5ncvzgNLKnmGvfglJLTDO\nzV3YhFmIdVupHwoArVXgRy8zDPlb1PIgsL/btlECgYB4WoD0Nifwfyt84vm7Ixyi\nO9TZF0nXN20Z3JQbzV84DNTMvyG+FyGAmtTwj2gFRwrQaSXxMAr0g2RjsP2QOfL9\nXd7/MhL5p6ri9vIKcnGGd1K133ZLyWFskEPCGpYFHwanR9uT3jy+9DOtYs9xH289\n4k+8F7+ROHiYYPc5EeKr/g==\n-----END PRIVATE KEY-----\n`
  },

  /* -----------------------------------------------------------
     담당자 / 회사 정보  (문의 섹션·Hero에 표시)
     ※ phone/kakao를 비우면 그 줄은 화면에서 자동으로 숨겨짐
  ----------------------------------------------------------- */
  company: "주식회사 마스터",
  team: "외부유통팀",
  managerName: "홍찬화",
  managerTitle: "팀장",
  phone: "",
  email: "chanwha0221@gmail.com",
  kakao: "",

  /* -----------------------------------------------------------
     표지(Hero) 문구 — 원본 '온라인 셀러' 버전 문구 기준
  ----------------------------------------------------------- */
  heroEyebrow: "B2B 상품 제안 드립니다",
  heroTitleLines: ["바다에서", "식탁까지,", "한 번에 채우다"], // 3번째 줄은 노란색 강조
  heroLead:
    "동해·군산·인천 산지 창고를 직접 운영하고 있는 수산물 전문 유통사입니다. \n전국 창고에서 전체 약 500여 종 취급 품목 중 일부 품목 엄선해, 산지 공급가와 택배 조건을 정리했습니다. 또한 간편식품·생활용품까지 공급해 드립니다.",

  /* -----------------------------------------------------------
     카테고리 소개
  ----------------------------------------------------------- */
  categoryText: {
    fish:   { desc: "동해·군산·인천·충무 창고를 직접 운영하여 수산물 공급", meta: "동해 · 군산 · 인천 창고" },
    meal:   { desc: "탕·전골·튀김 등 회전율 높은 즉석·냉동 품목 (하남·김포).",       meta: "하남 · 김포 · 푸카 창고" },
    living: { desc: "찐한국 위생·주방 소모품, 정기 납품에 유리한 저단가 구성.",       meta: "찐한국 · 위생/주방" }
  }
};
