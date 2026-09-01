<#
  deploy.ps1 — 배포하고 "라이브에서 실제로 내려오는 것"까지 확인해야 끝나는 스크립트
  (2026-08-19 사장님 지시: "로컬에서 테스트하고 됐다고 하지 마라. 라이브를 확인해라.")

  왜 만들었나:
    update.bat 은 push 까지만 하고 끝난다. GitHub Pages 가 커밋을 안 굽고 넘어가는 일이 실제로 있었고
    (2026-08-19 media-updater.html, 커밋 하나를 20분 넘게 건너뜀), 그 사이 "배포 완료"라고 보고했다가
    사장님 화면엔 옛날 페이지가 떠 있었다. 그래서 배포의 마지막 단계를 사람 눈이 아니라 스크립트가 본다.

  하는 일:
    1) 바뀐 파일의 <title> 안 버전 v숫자.숫자 를 +1
    2) git add / commit / push
    3) 라이브 URL 을 폴링해서 "올린 내용과 글자 단위로 같은지" 확인 (줄바꿈 차이는 무시)
    4) 3분 지나도 안 넘어오면 빈 커밋으로 Pages 빌드를 다시 태우고 3분 더 기다림
    5) 그래도 안 되면 실패로 끝난다 — 성공했다고 말하지 않는다

  사용법 (전부 비대화형 — 입력 기다리는 곳 없음):
    powershell -ExecutionPolicy Bypass -File deploy.ps1 -Message "설명"
    powershell -ExecutionPolicy Bypass -File deploy.ps1 -Files catalog.html -Message "설명"
    powershell -ExecutionPolicy Bypass -File deploy.ps1 -Message "설명" -NoBump   (버전 안 올림)
#>
param(
  [string[]]$Files,
  [string]$Message = "update",
  [switch]$NoBump,
  [int]$WaitSeconds = 180
)

$ErrorActionPreference = 'Stop'
$Repo    = 'C:\work\baljuseo'
$BaseUrl = 'https://chanwha0221-cmyk.github.io/baljuseo/'
Set-Location $Repo

# 🔴 한글 파일명 대응 (2026-08-24 원가업데이트.html 미배포 사고)
#   git 은 기본(core.quotepath=true)으로 한글 경로를 "\354\233\220..." 로 escape 해서 뱉는다.
#   그걸 그대로 pathspec 으로 넘기면 add 가 fatal: Invalid path '/354' 로 죽고,
#   commit 은 "변경 없음"으로 넘어가고, 대조 목록($want)까지 비어서 폴링이 통째로 생략됐다.
#   → 결과: 아무것도 안 올라갔는데 "배포 완료" 초록불. 아래 두 줄이 그 뿌리를 막는다.
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding           = [Text.Encoding]::UTF8

function Say($msg, $color = 'Gray') { Write-Host $msg -ForegroundColor $color }

# git 이 stale lock 때문에 멈추는 사고가 반복돼서 (드라이브 동기화 시절 유물) 먼저 치운다
if (Test-Path '.git\index.lock') { Remove-Item -Force '.git\index.lock' }

# ── 1. 배포할 파일 결정 ───────────────────────────────────────────────
if (-not $Files -or $Files.Count -eq 0) {
  $Files = @(git -c core.quotepath=false status --porcelain | ForEach-Object {
    $p = $_.Substring(3).Trim().Trim('"')
    if ($p -match ' -> ') { $p = ($p -split ' -> ')[-1] }   # rename 은 새 이름으로
    if ($p -match '\.(html|js|json|css)$') { $p }
  })
}
if (-not $Files -or $Files.Count -eq 0) { Say '바뀐 파일이 없습니다. 배포할 게 없어 그냥 끝냅니다.' 'Yellow'; exit 0 }

# 🔗 딸린 js 만 고쳤을 때도 그걸 불러오는 html 을 같이 올린다 (2026-08-25 사고)
#   catalog.html 은 order.js 를 <title> 의 앱 버전으로 캐시 버스팅한다(order.js?v2.25).
#   order.js 만 배포하면 버전이 그대로라 이미 들어온 브라우저는 옛 order.js 를 계속 쓴다.
#   → 실제로 원비씨 화면에만 발주 알림이 안 뜨던 원인이 이것이었다. 여기서 뿌리를 막는다.
#   ⚠️ 새 공용 js 를 만들면 **여기 한 줄부터 추가**할 것 (2026-08-31 claim.js 가 빠져 있어 같은 함정을 밟았다).
$OwnerOf = @{ 'order.js' = @('catalog.html','catalog-test.html'); 'convert-core.js' = @('catalog.html','catalog-test.html','index.html'); 'claim.js' = @('catalog.html','catalog-test.html'); 'sheets-proxy.js' = @('catalog.html','catalog-test.html') }
foreach ($k in $OwnerOf.Keys) {
  if ($Files -contains $k) {
    foreach ($owner in $OwnerOf[$k]) {
      if ((Test-Path $owner) -and ($Files -notcontains $owner)) {
        $Files += $owner
        Say ("      + $owner 같이 올림 ($k 캐시 버전 올리려고)") 'DarkGray'
      }
    }
  }
}
# 🔗 발주 삼형제는 **버전을 같이 간다** (홍팀장 2026-09-01)
#   마스터 화면·업체 화면(둘 다 catalog.html)과 발주서 변환기(index.html)는 같은 변환 엔진
#   (convert-core.js)을 쓴다. 그런데 각자 자기 <title> 버전을 따로 올려서 2.79 / 22.595 로
#   갈라져 있었고, 업체 화면에 v2.70 이 떠 있어도 그게 얼마나 낡은 건지 알 방법이 없었다.
#   → 하나가 배포되면 셋 다 **같은 번호**로 올라간다. 화면에 뜬 숫자만 보고 맞춰볼 수 있게.
$SyncSet = @('catalog.html', 'catalog-test.html', 'index.html')
if (@($Files | Where-Object { $SyncSet -contains $_ }).Count -gt 0) {
  foreach ($s in $SyncSet) {
    if ((Test-Path (Join-Path $Repo $s)) -and ($Files -notcontains $s)) {
      $Files += $s
      Say ("      + $s 같이 올림 (버전 동기화)") 'DarkGray'
    }
  }
}
Say ("[1/4] 배포 대상: " + ($Files -join ', ')) 'Cyan'

# ── 2. 버전 +1 (title 안의 v숫자.숫자) ────────────────────────────────
$enc = New-Object System.Text.UTF8Encoding $false
function Get-Ver($path) {
  $m = [regex]::Match([IO.File]::ReadAllText($path, $enc), 'v(\d+)\.(\d+)')
  if ($m.Success) { return @([int]$m.Groups[1].Value, [int]$m.Groups[2].Value) }
  return $null
}
if (-not $NoBump) {
  # 동기화 대상은 **하나의 새 번호**로 맞춘다. 지금 셋 중 가장 높은 번호 +1 —
  # 어느 파일도 버전이 뒤로 가면 안 된다(뒤로 가면 "새 버전인가" 판단이 통째로 깨진다).
  $syncNew = $null
  if (@($Files | Where-Object { $SyncSet -contains $_ }).Count -gt 0) {
    $maj = 0; $min = 0
    foreach ($s in $SyncSet) {
      $full = Join-Path $Repo $s
      if (-not (Test-Path $full)) { continue }
      $v = Get-Ver $full
      if ($v -and (($v[0] -gt $maj) -or ($v[0] -eq $maj -and $v[1] -gt $min))) { $maj = $v[0]; $min = $v[1] }
    }
    if ($maj -gt 0) { $syncNew = 'v' + $maj + '.' + ($min + 1) }
  }
  foreach ($f in $Files) {
    $full = Join-Path $Repo $f
    if (-not (Test-Path $full)) { continue }
    $c = [IO.File]::ReadAllText($full, $enc)
    $m = [regex]::Match($c, 'v(\d+)\.(\d+)')
    if ($m.Success) {
      $oldV = 'v' + $m.Groups[1].Value + '.' + $m.Groups[2].Value
      $newV = if (($SyncSet -contains $f) -and $syncNew) { $syncNew }
              else { 'v' + $m.Groups[1].Value + '.' + ([int]$m.Groups[2].Value + 1) }
      if ($oldV -ne $newV) {
        [IO.File]::WriteAllText($full, $c.Replace($oldV, $newV), $enc)
        Say ("      " + $f + ": " + $oldV + " -> " + $newV)
      } else { Say ("      " + $f + ": " + $oldV + " (그대로)") }
    }
  }
}

# 📣 지금 라이브 버전을 한 줄짜리 파일로 같이 올린다 (홍팀장 2026-09-01)
#   업체는 카탈로그 탭을 켜둔 채로 며칠 쓴다. 탭을 안 닫으면 브라우저는 catalog.html 을
#   **아예 다시 받지 않는다.** 그래서 우리가 고쳐 올려도 화면은 v2.70 그대로였고,
#   쿠팡 파일이 옛 코드로 읽혀 칸이 밀렸다(2026-09-01). 화면이 이 파일을 보고 스스로 알아챈다.
$catPath = Join-Path $Repo 'catalog.html'
if (Test-Path $catPath) {
  $cv = Get-Ver $catPath
  if ($cv) {
    $verLine = 'v' + $cv[0] + '.' + $cv[1]
    [IO.File]::WriteAllText((Join-Path $Repo 'version.txt'), $verLine, $enc)
    if ($Files -notcontains 'version.txt') { $Files += 'version.txt' }
    Say ("      version.txt: " + $verLine)
  }
}

# 올린 뒤 라이브와 대조할 기준값 — 줄바꿈(CRLF/LF) 차이는 무시하고 글자만 본다
$want = @{}
foreach ($f in $Files) {
  $full = Join-Path $Repo $f
  if (Test-Path $full) { $want[$f] = ([IO.File]::ReadAllText($full, $enc)) -replace "`r", '' }
  else { Say ("파일을 못 찾았습니다: " + $f + " (경로가 깨졌을 수 있음)") 'Red'; exit 3 }
}
# 대조할 게 하나도 없으면 폴링이 통째로 생략돼 무조건 성공으로 끝난다 — 그건 배포가 아니다
if ($want.Count -eq 0) { Say '라이브와 대조할 파일이 없습니다. 배포로 인정하지 않고 멈춥니다.' 'Red'; exit 3 }

# ── 3. push ───────────────────────────────────────────────────────────
Say '[2/4] git pull / add / commit / push' 'Cyan'
git pull --no-rebase --quiet
git add -- $Files
if ($LASTEXITCODE -ne 0) { Say ('git add 실패 — 배포 안 됐습니다. 대상: ' + ($Files -join ', ')) 'Red'; exit 3 }
git commit -m $Message | Out-Null
if ($LASTEXITCODE -ne 0) { Say '      커밋할 변경이 없습니다 (이미 커밋됨) — 라이브 확인만 진행합니다.' 'Yellow' }
git push --quiet
if ($LASTEXITCODE -ne 0) { Say 'push 실패. 여기서 멈춥니다.' 'Red'; exit 1 }
$sha = (git rev-parse --short HEAD).Trim()
Say ("      push 완료: " + $sha) 'Green'

# ── 4. 라이브가 실제로 새 내용을 내줄 때까지 확인 ──────────────────────
function Test-Live($file, $expected) {
  $url = $BaseUrl + ($file -replace '\\', '/') + '?cachebust=' + [guid]::NewGuid().ToString('N')
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 25 -Headers @{ 'Cache-Control' = 'no-cache' }
    if ($r.StatusCode -ne 200) { return $false }
    # PS 5.1 은 텍스트 응답이면 Content 를 string 으로, 아니면 byte[] 로 준다 — 둘 다 받는다
    if ($r.Content -is [byte[]]) { $got = [Text.Encoding]::UTF8.GetString($r.Content) } else { $got = [string]$r.Content }
    $got = $got -replace "`r", ''
    return ($got -eq $expected)
  } catch { return $false }
}

function Wait-Live($seconds, $label) {
  Say ("[3/4] 라이브 확인 중 (" + $label + ", 최대 " + $seconds + "초)") 'Cyan'
  $deadline = (Get-Date).AddSeconds($seconds)
  $pending  = @($want.Keys)
  while ((Get-Date) -lt $deadline -and $pending.Count -gt 0) {
    Start-Sleep -Seconds 15
    $still = @()
    foreach ($f in $pending) {
      if (Test-Live $f $want[$f]) { Say ("      OK  " + $f) 'Green' } else { $still += $f }
    }
    $pending = $still
    if ($pending.Count -gt 0) { Say ("      아직: " + ($pending -join ', ')) }
  }
  return $pending
}

$pending = Wait-Live $WaitSeconds '1차'

if ($pending.Count -gt 0) {
  # Pages 가 커밋을 건너뛴 상태 — 빈 커밋으로 빌드를 다시 태운다 (2026-08-19 실제로 이걸로 풀렸음)
  Say '[4/4] 아직 안 넘어옴 → 빈 커밋으로 Pages 빌드 재시도' 'Yellow'
  git commit --allow-empty -m ("Pages 빌드 재시도 (" + $sha + " 미반영)") | Out-Null
  git push --quiet
  $pending = Wait-Live $WaitSeconds '재시도'
}

if ($pending.Count -gt 0) {
  Say ''
  Say ("배포 실패로 처리합니다 — 라이브에 아직 안 올라온 파일: " + ($pending -join ', ')) 'Red'
  Say '완료라고 말하면 안 되는 상태입니다. GitHub Pages 설정/빌드 로그를 봐야 합니다.' 'Red'
  exit 2
}

Say ''
Say ("배포 완료 — 라이브에서 새 내용 확인함 (" + $sha + ")") 'Green'
foreach ($f in $want.Keys) { Say ('      ' + $BaseUrl + ($f -replace '\\', '/')) }
exit 0
