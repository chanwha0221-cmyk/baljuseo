<#
  _deploy_menu.ps1 — "발주서 배포" 버튼의 알맹이

  왜 만들었나 (2026-08-28 홍팀장):
    옛 update.bat 은 `git add .` 였다. catalog.html 하나만 고쳤어도 그 순간 폴더에
    떠 있던 다른 변경분까지 통째로 같이 커밋된다. 혼자 쓸 땐 티가 안 났지만
    홍찬화·박원비 두 사람이 각자 PC에서 같은 저장소를 쓰기 시작하면
    "남이 작업 중이던 파일이 내 커밋에 실려 나가는" 사고가 난다.

  하는 일:
    1) pull 로 상대가 올린 것부터 받는다
    2) 바뀐 파일만 목록으로 보여준다 (파일명 + <title> 에서 뽑은 이름·버전)
    3) 올릴 것을 번호로 고른다 (엔터 = 전부)
    4) deploy.ps1 에 넘긴다 — 버전 올리기·커밋·push·라이브 확인은 거기가 한다
#>
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding           = [Text.Encoding]::UTF8

$repo = $PSScriptRoot
Set-Location $repo

function Say($m, $c = 'Gray') { Write-Host $m -ForegroundColor $c }

if (Test-Path '.git\index.lock') { Remove-Item -Force '.git\index.lock' }

Say ''
Say '============================================' 'Cyan'
Say '   발주서 배포' 'Cyan'
Say '============================================' 'Cyan'
Say ''

# ── 1. 먼저 받는다 ────────────────────────────────────────────────
Say '[1/4] 상대가 올린 것부터 받는다 (git pull)' 'Cyan'
git pull --no-rebase
if ($LASTEXITCODE -ne 0) {
  Say ''
  Say '받아오기가 실패했다. 여기서 멈춘다 — 이 상태로 올리면 남의 작업을 덮어쓸 수 있다.' 'Red'
  Say '충돌 메시지를 홍팀장이나 클로드에게 그대로 보여줄 것.' 'Yellow'
  Say ''
  cmd /c pause
  exit 1
}
Say ''

# ── 2. 바뀐 파일 목록 ─────────────────────────────────────────────
$files = @(git -c core.quotepath=false status --porcelain | ForEach-Object {
  $p = $_.Substring(3).Trim().Trim('"')
  if ($p -match ' -> ') { $p = ($p -split ' -> ')[-1] }   # rename 은 새 이름으로
  if ($p -match '\.(html|js|json|css)$') { $p }
})

if ($files.Count -eq 0) {
  Say '올릴 게 없다. 바뀐 파일이 하나도 없음.' 'Yellow'
  Say ''
  cmd /c pause
  exit 0
}

function Get-Label($path) {
  if (-not (Test-Path $path)) { return '(삭제됨)' }
  if ($path -notmatch '\.html$') { return '(딸린 파일 - 위 html 이 불러 씀)' }
  try {
    $enc = New-Object System.Text.UTF8Encoding $false
    $c   = [IO.File]::ReadAllText((Resolve-Path $path), $enc)
    $m   = [regex]::Match($c, '(?is)<title>\s*(.*?)\s*</title>')
    if ($m.Success) { return ($m.Groups[1].Value -replace '\s+', ' ') }
  } catch { }
  return ''
}

Say '[2/4] 바뀐 파일' 'Cyan'
Say ''
for ($i = 0; $i -lt $files.Count; $i++) {
  $n = ('{0,2}' -f ($i + 1))
  Write-Host ("  [" + $n + "] ") -ForegroundColor Yellow -NoNewline
  Write-Host ($files[$i].PadRight(28)) -ForegroundColor White -NoNewline
  Write-Host ('  ' + (Get-Label $files[$i])) -ForegroundColor DarkGray
}
Say ''

# ── 3. 고른다 ─────────────────────────────────────────────────────
Say '[3/4] 올릴 것을 고른다' 'Cyan'
$sel = Read-Host '   번호 (여러 개면 1,3 / 그냥 엔터면 전부)'

if ([string]::IsNullOrWhiteSpace($sel)) {
  $chosen = $files
} else {
  $idx = @()
  foreach ($t in ($sel -split '[,\s]+')) {
    if ($t -match '^\d+$') {
      $k = [int]$t
      if ($k -ge 1 -and $k -le $files.Count) { $idx += ($k - 1) }
      else { Say ("   번호 " + $k + " 는 목록에 없다 - 무시한다.") 'Yellow' }
    }
  }
  $chosen = @($idx | Sort-Object -Unique | ForEach-Object { $files[$_] })
}

if ($chosen.Count -eq 0) {
  Say '   고른 게 없다. 아무것도 안 올리고 끝낸다.' 'Yellow'
  Say ''
  cmd /c pause
  exit 0
}

Say ''
Say ('   올릴 것: ' + ($chosen -join ', ')) 'Green'
Say ''

$msg = Read-Host '   무엇을 고쳤는지 한 줄 (엔터면 update)'
if ([string]::IsNullOrWhiteSpace($msg)) { $msg = 'update' }

# ── 4. deploy.ps1 에 넘긴다 ───────────────────────────────────────
Say ''
Say '[4/4] 올리고, 라이브에 실제로 반영됐는지 확인까지 한다' 'Cyan'
Say '      (사이트 반영 확인에 최대 3분까지 걸린다 - 창을 닫지 말 것)' 'DarkGray'
Say ''

& (Join-Path $repo 'deploy.ps1') -Files $chosen -Message $msg
$rc = $LASTEXITCODE

Say ''
if ($rc -eq 0) { Say '=== 끝. 사이트에 반영됐다. ===' 'Green' }
else           { Say '=== 실패했다. 위 빨간 글자를 홍팀장이나 클로드에게 보여줄 것. ===' 'Red' }
Say ''
cmd /c pause
exit $rc
