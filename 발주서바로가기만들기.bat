@echo off
chcp 65001 > nul
set BAT=G:\내 드라이브\claude\Projects\baljuseo\update.bat
set LNK=%USERPROFILE%\Desktop\발주서 업데이트.lnk
powershell -ExecutionPolicy Bypass -NoProfile -Command "$s=(New-Object -COM WScript.Shell).CreateShortcut('%LNK%');$s.TargetPath='cmd.exe';$s.Arguments='/c \"%BAT%\"';$s.WorkingDirectory='G:\내 드라이브\claude\Projects\baljuseo';$s.WindowStyle=1;$s.Save()"
echo 바탕화면에 바로가기 생성 완료!
pause
