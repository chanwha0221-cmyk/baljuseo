# update.bat 바탕화면 바로가기 생성 스크립트
$WshShell = New-Object -comObject WScript.Shell
$Desktop = [System.Environment]::GetFolderPath('Desktop')
$Shortcut = $WshShell.CreateShortcut("$Desktop\발주서 업데이트.lnk")
$Shortcut.TargetPath = "cmd.exe"
$Shortcut.Arguments = "/c `"G:\내 드라이브\claude\Projects\baljuseo\update.bat`""
$Shortcut.WorkingDirectory = "G:\내 드라이브\claude\Projects\baljuseo"
$Shortcut.WindowStyle = 1
$Shortcut.Description = "발주서 변환기 배포"
$Shortcut.Save()
Write-Host "바탕화면에 '발주서 업데이트' 바로가기가 생성됐습니다!" -ForegroundColor Green
Write-Host "이제 바탕화면 바로가기를 우클릭 → 작업 표시줄에 고정 하면 됩니다." -ForegroundColor Yellow
pause
