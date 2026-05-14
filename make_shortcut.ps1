$ws = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$s = $ws.CreateShortcut($desktop + '\발주서 업데이트.lnk')
$s.TargetPath = 'cmd.exe'
$s.Arguments = '/c "G:\내 드라이브\claude\Projects\baljuseo\update.bat"'
$s.WorkingDirectory = 'G:\내 드라이브\claude\Projects\baljuseo'
$s.WindowStyle = 1
$s.Save()
Write-Host "바탕화면에 단축아이콘 생성 완료!"
