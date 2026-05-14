@echo off
set SCRIPT=%TEMP%\make_shortcut.vbs
echo Set oWS = WScript.CreateObject("WScript.Shell") > "%SCRIPT%"
echo desk = oWS.SpecialFolders("Desktop") >> "%SCRIPT%"
echo WScript.Echo "바탕화면 경로: " ^& desk >> "%SCRIPT%"
echo sLinkFile = desk ^& "\발주서 업데이트.lnk" >> "%SCRIPT%"
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> "%SCRIPT%"
echo oLink.TargetPath = "cmd.exe" >> "%SCRIPT%"
echo oLink.Arguments = "/c ""G:\내 드라이브\claude\Projects\baljuseo\update.bat""" >> "%SCRIPT%"
echo oLink.WorkingDirectory = "G:\내 드라이브\claude\Projects\baljuseo" >> "%SCRIPT%"
echo oLink.WindowStyle = 1 >> "%SCRIPT%"
echo oLink.Save >> "%SCRIPT%"
echo WScript.Echo "생성 완료: " ^& sLinkFile >> "%SCRIPT%"
cscript //nologo "%SCRIPT%"
del "%SCRIPT%"
pause
