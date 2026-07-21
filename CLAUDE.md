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
- `update.bat` 실행 → (lock 자동삭제) → index.html 버전 자동 +1(PowerShell) → `git add . / commit / push` → GitHub Pages 1~3분 후 반영
- ✅ **2026-05 수정**: update.bat 맨 앞에 `if exist ".git\index.lock" del /f /q ".git\index.lock"` 추가 → 이제 더블클릭만 해도 lock 자동 제거. **단 update.bat은 반드시 CRLF 줄바꿈 유지**(LF로 저장되면 cmd가 줄을 못 끊어 단어마다 에러남. bash python으로 쓸 땐 `'\r\n'.join()`).
- ⚠️ **lock이 자꾸 되살아나는 진짜 이유**: `.git`이 **구글 드라이브 동기화 폴더** 안에 있어서, 0바이트 stale lock이 클라우드에 한번 올라가면 PC에서 지워도 드라이브가 다시 내려받아 복원함. update.bat 자동삭제로 우회 중. (근본해결은 .git을 드라이브 밖으로 빼는 것)
- 푸시 막힐 때 update.bat 우회 직접배포: `cd /d "...baljuseo" & del /f /q ".git\index.lock" & git add -A & git commit -m update & git push`

## 핵심 규칙 / 관례
- **식봄 판매가** = `Math.ceil(원가 × 1.15 / 100) × 100` (원가 기준, 공급가 아님)
- **식봄 대량등록 고정값**: 신선택배비 4000원 / 묶음배송 `n`(합포장 불가·개별포장) / 제조사 `(주)마스터` / 기초재고 9999. 양식 29칸, 데이터 8행부터. 판매중량 H열 = 숫자+단위(g/kg)
- **수량관리**: 동물 팀명 = 토끼·거북·기린·여우·하마·고양·늑대. 먼저 요청한 팀 = 1순위. 같은 수량 재입력 시 순위 보존, 늘어난 분만 뒤로. 팀명이 메시지에 있어야 그 팀 항목 삭제됨.
- **발주서 변환기 출력 9칸(F~N)**: 주문처 / 주소 / 연락처 / 창고명(빈) / 상품명+수량 / 상품명raw / 고객주소 / 고객연락처 / 배송메시지. 자가수령 업체(예: 호호야채)는 받는사람=업체 본인.
- pp() 정규화 예: 흑돼지 불고기 `1kg+1kg` → `산청 흑돼지 불고기 1+1` 단일상품. 수량 추출은 줄 끝에서 `slice(0, m.index)` (replace 쓰면 "200g 20"의 200 손상됨).
- **pr2 컬럼 파싱 (2026-05 수정)**: ①시트 복사 시 칸 사이 **빈 스페이서 칸(이중 탭)** 끼면 주소칸이 밀려 누락 → 이름 다음 빈 칸 건너뛰고 다음 비지 않은 칸을 주소로(`while ai... cols[ai]===''`). ②상품 단위패턴이 **`5kg급`처럼 단위 뒤 접미사(급/짜리)** 거부해서 상품칸을 못 찾고 업체주소를 상품으로 오인 → 패턴에 `(?:급|짜리)?` 추가(`1단지` 주소 오인식 방지는 유지).
- **🐟 홍어 = 삭힘정도 필수 보존 (2026-06-08, 두 번째 지적)**: 괄호제거 로직에서 '삭힘/숙성' 단어 든 괄호는 보존 처리(`_parenPreserved` 두 번째 replace). 홍어는 삭힘정도 없으면 발주 불가 — 절대 지우지 말 것.
- **대상수산 대구**: `대구` 포함 → `초대왕 생대구 5kg급` (수량 그대로, 한마리=1). pp() 대상수산 블록 맨 앞. ※`자연산 급냉 대구`는 별도 규칙(급냉 국내산 대구 1.5kg)이라 영향 없음.

## 작업 환경 주의
- **샌드박스(bash)에서 구글 API 직접 호출 불가** (DNS 차단). API는 브라우저에서만 동작.
- 🚫 **이 PC엔 node·python이 없다 (2026-07-21 Claude Code 실측)** — `python.exe`는 MS스토어 스텁이라 실행 불가. **`node --check` 구문검사·순수함수 시뮬레이션 못 씀.**
- ✅ **대체 검증 = Browser MCP** (Claude Code 기준, 이게 오히려 더 확실함):
  1. `mcp__Claude_Browser__navigate`로 `file:///C:/Users/홍찬화/내 드라이브/.../파일.html` 열기 (이미 열려 있으면 `tabs_context`로 tabId 확인 — tabId 인자 필수)
  2. `read_console_messages {onlyErrors:true}` → 에러 0이면 구문 정상
  3. `javascript_tool`로 `typeof 함수명` 찍어 주요 함수 로드 확인
  4. **렌더 함수는 가짜 데이터를 직접 넣어 결과 검증** — 예: `renderToPaint([...]); document.getElementById('toPaintList').innerText`. 브라우저에서 실제 출력을 보는 거라 시뮬레이션보다 정확. (2026-07-21 통장내역조회 fix 이렇게 검증함)
- 편집 후 잘림 확인은 그대로: `wc -l` + `grep -c '</script>'` + `tail -c 30` 을 **편집 전 baseline과 비교**. git HEAD와 `diff`도 병행 (식봄ERP.html이 끝부분 잘린 적 있음 — git HEAD에서 복구함).
- 🚨 **드라이브 동기화 = 파일 잘림 주범**: 이 폴더가 구글 드라이브라 **Edit/Write 도구로 쓰면 동기화와 충돌해 끝부분이 잘릴 수 있음**(index.html 여러 번 당함). **규칙**: ①완성본은 안정폴더 `/outputs`에서 만들고 ②`bash cp`로 한 번에 복사 ③복사 후 `wc -l` + `grep -c '</script>'` + `tail -1`로 무결성 확인. CLAUDE.md 같은 드라이브 파일 편집도 bash(python) 사용.
- 잘렸을 때 복구: `git show HEAD~N:파일 > 파일` (온전한 커밋 찾아). git log에서 줄수/`</script>` 개수로 온전판 판별.

## ⚠️ 보안 메모
- 서비스계정 PRIVATE_KEY가 GitHub Pages(공개 가능성)에 올라간 HTML에 들어있음. 레포가 public이면 노출 위험 — 나중에 키 회전/프록시 검토 권장. (지금 기존 구조라 일단 유지 중)
