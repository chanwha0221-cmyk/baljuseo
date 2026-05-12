@echo off
chcp 65001 > nul
set TASKBAR=%APPDATA%\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar
set SCRIPT=%TEMP%\pin_taskbar.vbs

echo Set oWS = WScript.CreateObject("WScript.Shell") > "%SCRIPT%"
echo Set oLink = oWS.CreateShortcut("%TASKBAR%\발주서 업데이트.lnk") >> "%SCRIPT%"
echo oLink.TargetPath = "cmd.exe" >> "%SCRIPT%"
echo oLink.Arguments = "/c ""G:\내 드라이브\claude\Projects\baljuseo\update.bat""" >> "%SCRIPT%"
echo oLink.WorkingDirectory = "G:\내 드라이브\claude\Projects\baljuseo" >> "%SCRIPT%"
echo oLink.WindowStyle = 1 >> "%SCRIPT%"
echo oLink.Save >> "%SCRIPT%"

cscript //nologo "%SCRIPT%"
del "%SCRIPT%"

echo 작업표시줄에 고정 완료!
echo (작업표시줄에 바로 보이지 않으면 로그아웃 후 다시 로그인하세요)
pause
