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

function Say($msg, $color = 'Gray') { Write-Host $msg -ForegroundColor $color }

# git 이 stale lock 때문에 멈추는 사고가 반복돼서 (드라이브 동기화 시절 유물) 먼저 치운다
if (Test-Path '.git\index.lock') { Remove-Item -Force '.git\index.lock' }

# ── 1. 배포할 파일 결정 ───────────────────────────────────────────────
if (-not $Files -or $Files.Count -eq 0) {
  $Files = @(git status --porcelain | ForEach-Object {
    $p = $_.Substring(3).Trim().Trim('"')
    if ($p -match '\.(html|js|json|css)$') { $p }
  })
}
if (-not $Files -or $Files.Count -eq 0) { Say '바뀐 파일이 없습니다. 배포할 게 없어 그냥 끝냅니다.' 'Yellow'; exit 0 }
Say ("[1/4] 배포 대상: " + ($Files -join ', ')) 'Cyan'

# ── 2. 버전 +1 (title 안의 v숫자.숫자) ────────────────────────────────
$enc = New-Object System.Text.UTF8Encoding $false
if (-not $NoBump) {
  foreach ($f in $Files) {
    $full = Join-Path $Repo $f
    if (-not (Test-Path $full)) { continue }
    $c = [IO.File]::ReadAllText($full, $enc)
    $m = [regex]::Match($c, 'v(\d+)\.(\d+)')
    if ($m.Success) {
      $oldV = 'v' + $m.Groups[1].Value + '.' + $m.Groups[2].Value
      $newV = 'v' + $m.Groups[1].Value + '.' + ([int]$m.Groups[2].Value + 1)
      [IO.File]::WriteAllText($full, $c.Replace($oldV, $newV), $enc)
      Say ("      " + $f + ": " + $oldV + " -> " + $newV)
    }
  }
}

# 올린 뒤 라이브와 대조할 기준값 — 줄바꿈(CRLF/LF) 차이는 무시하고 글자만 본다
$want = @{}
foreach ($f in $Files) {
  $full = Join-Path $Repo $f
  if (Test-Path $full) { $want[$f] = ([IO.File]::ReadAllText($full, $enc)) -replace "`r", '' }
}

# ── 3. push ───────────────────────────────────────────────────────────
Say '[2/4] git pull / add / commit / push' 'Cyan'
git pull --no-rebase --quiet
git add -- $Files
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
