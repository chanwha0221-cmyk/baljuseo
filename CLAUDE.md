# 마스터 유통 작업 메모 (하비서용 오리엔테이션)

> 새 대화 시작하면 이 파일부터 읽으면 맥락 1초컷. 실제 작업물은 전부 디스크 파일에 있음 (대화에 안 묶임).

## 호칭 / 톤
- 사용자 = **홍찬화** (마스터 유통 / (주)마스터 운영). 부를 때 **"자기야"**.
- Claude = **하비서 / 마찬비서**. 반말, 친근하게.

## 폴더 / 파일 (이 폴더 = GitHub Pages 레포)
- 레포: `github.com/chanwha0221-cmyk/baljuseo` (main 브랜치)
- 라이브 URL: `https://chanwha0221-cmyk.github.io/baljuseo/<파일명>`

| 파일 | 역할 |
|---|---|
| `index.html` | **발주서 변환기**. 카톡/시트 발주 → 출고양식 변환. 상품명 정규화 = `pp()` 함수. 업체 등록 = `CC` 객체 + `data/clients.js`. 제목에 버전 `v22.x` (update.bat이 자동 +1) |
| `secretary.html` | **비서** — 업무일지/합포장 기억소/데일리 초안/공유서. 구글시트 서비스계정 연동 |
| `sales.html` | 판매 분석 |
| `식봄ERP.html` | **식봄 ERP** 3탭: ①상품 대량등록(엑셀 생성) ②상세페이지 HTML 변환기 ③마진 체크. 서비스계정 + SheetJS |
| `수량관리.html` | **팀 수량 관리** (하이브리드 v2.0): 브라우저 계산 + 구글시트 저장 → IMPORTRANGE 소스 |

### 별도 (GitHub 아님, 구글시트 Apps Script에 붙여넣어 사용)
- `C:\내드라이브\claude\github\마찬발주관리_AppsScript_최신코드.txt` — 시트 발주관리 메뉴(상품 수량 확인 다이얼로그 등). 수정 후 script.google.com에 붙여넣어야 적용됨.

## 구글시트 서비스계정 (브라우저에서 직접 API 호출)
- `CLIENT_EMAIL = sheets-writer@baljuseo-sheets.iam.gserviceaccount.com`
- `OAUTH_SCOPE = https://www.googleapis.com/auth/spreadsheets`
- **secretary/식봄ERP 시트** ID: `1t1E8TZ9442OvgFV6Ah5nK6gexHv7xxVFf0jBVDXFUzM` (전체상품원가 등)
- **수량 리더 시트** ID: `1WrasAPb8uQLacnwOe2_vVZHD-3cQR7oYKLxOEB_k0SI` — 탭: `입력 시트`(업데이트시간/팀명/창고명/상품명/필요수량), `현황판`(창고명/품목명/수량보유팀/1~10순위/합계), `삭제 로그`
- PRIVATE_KEY는 secretary.html / 식봄ERP.html / 수량관리.html에 하드코딩 (`getAccessToken()` JWT RS256, crypto.subtle)

## 배포 (update.bat)
- `update.bat` 실행 → index.html 버전 자동 +1 → `git add . / commit / push` → GitHub Pages 1~3분 후 반영
- ⚠️ **자주 나는 함정**: `.git/index.lock`이 남아 commit 실패 → 화면엔 "Done!"인데 끝에 "Everything up-to-date"면 **실제론 안 올라간 것**. 해결: `del "C:\내드라이브\claude\발주\baljuseo\.git\index.lock"` 후 재실행.

## 핵심 규칙 / 관례
- **식봄 판매가** = `Math.ceil(원가 × 1.15 / 100) × 100` (원가 기준, 공급가 아님)
- **식봄 대량등록 고정값**: 신선택배비 4000원 / 묶음배송 `n`(합포장 불가·개별포장) / 제조사 `(주)마스터` / 기초재고 9999. 양식 29칸, 데이터 8행부터. 판매중량 H열 = 숫자+단위(g/kg)
- **수량관리**: 동물 팀명 = 토끼·거북·기린·여우·하마·고양·늑대. 먼저 요청한 팀 = 1순위. 같은 수량 재입력 시 순위 보존, 늘어난 분만 뒤로. 팀명이 메시지에 있어야 그 팀 항목 삭제됨.
- **발주서 변환기 출력 9칸(F~N)**: 주문처 / 주소 / 연락처 / 창고명(빈) / 상품명+수량 / 상품명raw / 고객주소 / 고객연락처 / 배송메시지. 자가수령 업체(예: 호호야채)는 받는사람=업체 본인.
- pp() 정규화 예: 흑돼지 불고기 `1kg+1kg` → `산청 흑돼지 불고기 1+1` 단일상품. 수량 추출은 줄 끝에서 `slice(0, m.index)` (replace 쓰면 "200g 20"의 200 손상됨).

## 작업 환경 주의
- **샌드박스(bash)에서 구글 API 직접 호출 불가** (DNS 차단). API는 브라우저에서만 동작. 로직 검증은 `node`로 순수 함수 시뮬레이션 / `node --check`로 구문 검사.
- 큰 HTML 편집 후엔 `<script>` 추출해서 `node --check` + git HEAD와 `diff`로 잘림/손상 확인 (식봄ERP.html이 끝부분 잘린 적 있음 — git HEAD에서 복구함).

## ⚠️ 보안 메모
- 서비스계정 PRIVATE_KEY가 GitHub Pages(공개 가능성)에 올라간 HTML에 들어있음. 레포가 public이면 노출 위험 — 나중에 키 회전/프록시 검토 권장. (지금 기존 구조라 일단 유지 중)
