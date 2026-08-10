# 마스터 유통 작업 메모 (하비서용 오리엔테이션)

> 새 대화 시작하면 이 파일부터 읽으면 맥락 1초컷. 실제 작업물은 전부 디스크 파일에 있음 (대화에 안 묶임).

## 호칭 / 톤
- 사용자 = **홍찬화 = 홍팀장** (마스터 유통 / (주)마스터 운영). 부를 때 **"팀장님"**.
- Claude = **하비서 / 마찬비서**. **존댓말로 모신다** (2026-07-28 지적 — 반말·"자기야"로 맞먹지 말 것).

## 폴더 / 파일 (이 폴더 = GitHub Pages 레포)
- **레포 위치: `C:\work\baljuseo` (2026-08-04 구글드라이브 밖으로 이전 — 사장님 지시)**. 드라이브 동기화가 git과 충돌해 파일 잘림·index.lock 부활 사고를 내던 근본 원인 제거. 드라이브의 옛 경로는 `발주/baljuseo_이전됨_백업0804`로 백업만 남음 — 절대 편집 금지. **로컬 디스크라 이 레포는 Edit/Write 도구를 잘림 걱정 없이 바로 사용**(아래 "드라이브 동기화 = 파일 잘림 주범" 절은 이 레포엔 더 이상 해당 없음 — 드라이브 안 파일들에만 유효).
- 레포: `github.com/chanwha0221-cmyk/baljuseo` (main 브랜치)
- 라이브 URL: `https://chanwha0221-cmyk.github.io/baljuseo/<파일명>`

| 파일 | 역할 |
|---|---|
| `index.html` | **발주서 변환기**. 카톡/시트 발주 → 출고양식 변환. 상품명 정규화 = `pp()` 함수. 업체 등록 = `CC` 객체 + `data/clients.js`. 제목에 버전 `v22.x` (update.bat이 자동 +1) |
| `secretary.html` | **비서** — 업무일지/합포장 기억소/데일리 초안/공유서. 구글시트 서비스계정 연동 |
| `sales.html` | 판매 분석 |
| `식봄ERP.html` | **식봄 ERP** 3탭: ①상품 대량등록(엑셀 생성) ②상세페이지 HTML 변환기 ③마진 체크. 서비스계정 + SheetJS |
| `수량관리.html` | **팀 수량 관리** (하이브리드 v2.0): 브라우저 계산 + 구글시트 저장 → IMPORTRANGE 소스 |
| `제안서.html` | **상품 제안서 생성기** — 팀원 원본 pptx를 토큰화한 `제안서_assets/template.pptx`에 글자만 치환. 배경=원본 슬라이드 실렌더(`제안서_assets/bg1~6`), 브라우저 JSZip으로 pptx 생성 → **원본 디자인 100% 보존, 글자만 편집.** 좌표/스타일 맵=`제안서_assets/fields.js`. 라이브: `/제안서.html` |
| `통장내역조회/통장내역조회.html` | **통장 내역 조회 v5.6** — 통장 입금내역 × 정산(색칠) 대사. 미정산 현황·선입금 배정. 사고이력·교훈은 WORKFLOW §2026-07-31 블록 참조 |
| `byeondong.html` | **상품 정보 업데이트(변동가)** — 외부팀 공유용, OAuth 로그인(아래 별도 섹션) |
| `소식글.html` | **마스터 소식글 저장** — 소식글 본문 붙여넣고 💾저장(히스토리 시트) + 📋복사 |
| `밴드글.html` | **밴드글 메이커 v4.3** — 밴드 발송글 작성 도구 (규칙은 메모리 bandgeul-rules 참조) |
| `3pl.html` | 냉동식품 3PL 업체 선정·견적 관리 |
| `상세메이커.html` / `상세메이커_업체용.html` / `상세메이커_팀용.html` / `상세페이지.html` | 상세페이지 메이커 계열 (마스터/새벽소리 · 업체용 · 팀용 · 구버전) |
| `썸네일추출.html` | 식봄 썸네일 추출기 |
| `신규업체메일링.html` / `신규업체메일링_원비.html` | 신규업체 메일링 관리 (본인용 / 원비용) |
| `법인발굴.html` | 법인 발굴 — 직원수·업종 검색(선물세트 영업). 3.2MB 대용량 — 통째로 읽지 말 것 |
| `신규발굴_데이터.js` / `신규발굴_원비.js` / `신규발굴_홍찬화.js` | 법인/신규 발굴용 데이터 파일 (대용량 0.4~0.8MB) — 통째로 읽지 말 것 |
| `vendor/index.html` | **외부 업체 등록 도구 v3.0 통합등록** (2026-08-10 개편) — ①사업자등록증 정보 칸(하비서가 이미지에서 뽑아준 "라벨: 값" 줄 붙여넣기) ②업체 회신 칸(자유형식 자동파싱) → [조합] = 리모컨 23칸 TSV 생성+자동복사. 사업자번호 체크섬 검증 내장. ⚠️ 활성여부 컬럼 없음(옛 ERP 18칸과 다름 — 컬럼 순서는 파일 상단 `COLS` 참조). 그룹웨어/북마클릿/OCR 연동은 v3.0에서 제거(통합등록 전환으로 폐기) |
| `vendor/bookmarklet.html` | (레거시) 그룹웨어 북마클릿 설치 페이지 — v3.0부터 미사용, 링크 제거됨 |
| `nuby1.html` | 뉴비1 — 신규업체 가입 안내(고정 안내문) |
| `수량관리_test.html` | 🧪 수량관리 TEST 구버전(v2.6) — **레거시, 본편은 수량관리.html** |

⚠️ 잡파일(무시할 것): `_synctest.txt` `_ft_synctest.txt` — 드라이브 동기화 테스트 흔적 / `_mklink.ps1` `_mklink_log.txt` `바로가기_만들기.bat` `Update.lnk` `update - 바로 가기.lnk` `git_pull.bat` — 로컬 편의용. 도구 아님, 배포와 무관.

### 별도 (GitHub 아님, 구글시트 Apps Script에 붙여넣어 사용)
- `C:\내드라이브\claude\github\마찬발주관리_AppsScript_최신코드.txt` — 시트 발주관리 메뉴(상품 수량 확인 다이얼로그 등). 수정 후 script.google.com에 붙여넣어야 적용됨.

## byeondong.html OAuth (외부팀 공유용 — 2026-07-27 게시)
- **byeondong 로그인 Client ID = `337370860058-...` (프로젝트 `baljuseo-sheets`)**, 모든 팀 **공용 고정**(칸 readonly). ⚠️ `machan-byeondong` 프로젝트는 **빈 프로젝트**(클라이언트 없음) — 헷갈리지 말 것.
- **2026-07-27 `baljuseo-sheets` OAuth 동의화면을 프로덕션 게시** → 아무 구글계정이나 로그인 가능(첫 로그인 시 '확인되지 않은 앱' 경고 → 고급>계속). 테스트 사용자 등록 불필요.
- 팀이 넣는 건 **반영 시트·링크 시트 2개뿐**(둘 다 기본값 없음·비면 막힘). Client ID는 안 건드림. → **"팀마다 Client ID 각자 발급"은 옛 설명(게시 전). 이제 공용 하나.**

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
- ✅ **node 있음 (2026-08-04 설치)**: `C:\Users\user9\tools\node\node.exe` v22.23.2 (포터블, 사용자 PATH 등록 — 새 세션부턴 그냥 `node`). **`node --check` 구문검사·순수함수 시뮬레이션 사용 가능.** 이전 "이 PC엔 node 없다"(07-21) 기록은 폐기. python은 여전히 없음(MS스토어 스텁).
- ✅ **대체 검증 = Browser MCP** (Claude Code 기준, 이게 오히려 더 확실함):
  1. `mcp__Claude_Browser__navigate`로 `file:///C:/Users/user9/.../파일.html` 열기 (이미 열려 있으면 `tabs_context`로 tabId 확인 — tabId 인자 필수)
     · ⚠️ 2026-07-31 실측: 인앱 브라우저가 file:// 로드에서 300초 멈춤(외부 파일은 정적 스냅샷이라 JS 안 돎) + 크롬 MCP는 file:// 자체 불가(https 강제) → PowerShell HttpListener 임시 서버(scratchpad, `http://localhost:8422/파일.html`)로 서빙
     · ✅ 2026-08-03 정식 해결: 인앱 브라우저의 localhost "정책 차단"은 **`C:\내드라이브\.claude\launch.json`에 서버 등록**으로 풀림(이미 만들어 둠 — `local-test-8422`, url http://localhost:8422, 명령 없이 attach). `mcp__Claude_Browser__preview_start {name:"local-test-8422"}` → 인앱 브라우저가 localhost 정식으로 열고 javascript_tool 검증 가능. **크롬 MCP 우회 불필요.** 끝나면 preview_stop + 서버 프로세스 kill
     · ✅ 2026-08-03 라이브 사이트도 동일: 인앱 브라우저 `navigate`로 라이브 URL 직접 열면 "denied or failed" 뜸 → launch.json의 **`baljuseo-live`** 항목(url https://chanwha0221-cmyk.github.io/baljuseo/)으로 `preview_start {name:"baljuseo-live"}` 하면 정식으로 열림. **크롬 MCP(`mcp__claude-in-chrome__navigate`)는 프롬프트 없이 라이브 URL 바로 열림** — 사장님 로그인 세션 필요하면 크롬 MCP, 아니면 아무거나. 접근 안 된다고 curl 우회만 하지 말 것(사장님 지시).
  2. `read_console_messages {onlyErrors:true}` → 에러 0이면 구문 정상
  3. `javascript_tool`로 `typeof 함수명` 찍어 주요 함수 로드 확인
  4. **렌더 함수는 가짜 데이터를 직접 넣어 결과 검증** — 예: `renderToPaint([...]); document.getElementById('toPaintList').innerText`. 브라우저에서 실제 출력을 보는 거라 시뮬레이션보다 정확. (2026-07-21 통장내역조회 fix 이렇게 검증함)
- 편집 후 잘림 확인은 그대로: `wc -l` + `grep -c '</script>'` + `tail -c 30` 을 **편집 전 baseline과 비교**. git HEAD와 `diff`도 병행 (식봄ERP.html이 끝부분 잘린 적 있음 — git HEAD에서 복구함).
- 🚨 **드라이브 동기화 = 파일 잘림 주범**: 이 폴더가 구글 드라이브라 **Edit/Write 도구로 쓰면 동기화와 충돌해 끝부분이 잘릴 수 있음**(index.html 여러 번 당함). **규칙**: ①완성본은 안정폴더 `/outputs`에서 만들고 ②`bash cp`로 한 번에 복사 ③복사 후 `wc -l` + `grep -c '</script>'` + `tail -1`로 무결성 확인. CLAUDE.md 같은 드라이브 파일 편집도 bash(python) 사용.
- 잘렸을 때 복구: `git show HEAD~N:파일 > 파일` (온전한 커밋 찾아). git log에서 줄수/`</script>` 개수로 온전판 판별.

## ⚠️ 보안 메모
- 서비스계정 PRIVATE_KEY가 GitHub Pages(공개 가능성)에 올라간 HTML에 들어있음. 레포가 public이면 노출 위험 — 나중에 키 회전/프록시 검토 권장. (지금 기존 구조라 일단 유지 중)
