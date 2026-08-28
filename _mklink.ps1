$ErrorActionPreference = 'Stop'
$log = Join-Path $PSScriptRoot '_mklink_log.txt'
try {
    $repo = $PSScriptRoot
    $desk = [Environment]::GetFolderPath('Desktop')
    $ws   = New-Object -ComObject WScript.Shell

    # 한글 이름은 코드포인트로 조립한다 (bat/ps1 인코딩이 깨져도 바로가기 이름이 안 깨지게)
    function KO([int[]]$cp) { -join ($cp | ForEach-Object { [char]$_ }) }

    # 버튼 2개 — 홍찬화·박원비가 각자 PC에서 같은 저장소를 clone 해서 쓰기 때문에
    #   (1) 최신받기 = 상대가 올린 걸 내 PC로 끌어온다  (작업 시작 전에 누른다)
    #   (2) 배포     = 내가 고친 걸 GitHub·사이트로 올린다 (작업 끝나고 누른다)
    # 2026-08-28 홍팀장: "물리버튼 2개 만들면 끝나는 거 아니냐" — 맞다. 배포 버튼만 있었다.
    $links = @(
        @{  # "발주서 최신받기"
            Name = KO @(48156,51452,49436,32,52572,49888,48155,44592)
            Bat  = 'git_pull.bat'
            Icon = 'shell32.dll,239'
            Desc = 'Baljuseo: pull latest from GitHub (run BEFORE editing)'
        },
        @{  # "발주서 배포"
            Name = KO @(48156,51452,49436,32,48176,54252)
            Bat  = 'update.bat'
            Icon = 'shell32.dll,46'
            Desc = 'Baljuseo deploy (update.bat) - run AFTER editing'
        }
    )

    $lines = @()
    foreach ($l in $links) {
        $bat = Join-Path $repo $l.Bat
        if (-not (Test-Path $bat)) { $lines += ('MISS=' + $l.Bat); continue }
        $lnk = Join-Path $desk ($l.Name + '.lnk')
        $s = $ws.CreateShortcut($lnk)
        $s.TargetPath       = $env:ComSpec
        $s.Arguments        = '/c "' + $bat + '"'
        $s.WorkingDirectory = $repo
        $s.IconLocation     = $l.Icon
        $s.Description      = $l.Desc
        $s.Save()
        $lines += ('OK=' + (Test-Path $lnk) + ' LNK=' + $lnk + ' BAT=' + $bat)
    }

    (($lines + ('TIME=' + (Get-Date))) -join "`n") | Out-File -FilePath $log -Encoding UTF8
} catch {
    "ERROR: $($_.Exception.Message)`nTIME=$(Get-Date)" | Out-File -FilePath $log -Encoding UTF8
}
