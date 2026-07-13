$ErrorActionPreference = 'Stop'
$log = Join-Path $PSScriptRoot '_mklink_log.txt'
try {
    $repo = $PSScriptRoot
    $bat  = Join-Path $repo 'update.bat'
    $desk = [Environment]::GetFolderPath('Desktop')

    # "발주서 배포" built from code points (avoids encoding issues)
    $name = -join (48156,51452,49436,32,48176,54252 | ForEach-Object { [char]$_ })
    $lnk  = Join-Path $desk ($name + '.lnk')

    $ws = New-Object -ComObject WScript.Shell
    $s  = $ws.CreateShortcut($lnk)
    $s.TargetPath       = $env:ComSpec
    $s.Arguments        = '/c "' + $bat + '"'
    $s.WorkingDirectory = $repo
    $s.IconLocation     = 'shell32.dll,46'
    $s.Description      = 'Baljuseo deploy (update.bat)'
    $s.Save()

    $ok = Test-Path $lnk
    "OK=$ok`nLNK=$lnk`nBAT=$bat`nTIME=$(Get-Date)" | Out-File -FilePath $log -Encoding UTF8
} catch {
    "ERROR: $($_.Exception.Message)`nTIME=$(Get-Date)" | Out-File -FilePath $log -Encoding UTF8
}
