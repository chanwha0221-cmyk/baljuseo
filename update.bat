@echo off
chcp 65001 > nul
title GitHub Auto Update

cd /d "C:\Users\user9\Documents\Claude\Projects\baljuseo"

echo.
echo ============================================
echo    GitHub Auto Update - Baljuseo Repo
echo ============================================
echo.

echo [ Bumping version... ]
powershell -ExecutionPolicy Bypass -NoProfile -Command "$f='index.html'; $enc=New-Object System.Text.UTF8Encoding $false; $c=[IO.File]::ReadAllText($f,$enc); $m=[regex]::Match($c,'v(\d+)\.(\d+)'); if($m.Success){$oldV='v'+$m.Groups[1].Value+'.'+$m.Groups[2].Value; $newV='v'+$m.Groups[1].Value+'.'+([int]$m.Groups[2].Value+1); $c=$c.Replace($oldV,$newV); [IO.File]::WriteAllText($f,$c,$enc); Write-Host ('Version: '+$oldV+' -^> '+$newV)} else{Write-Host 'Version pattern not found'}"
echo.

echo [ Changed Files ]
git status -s
echo.

set /p msg="Commit message (Enter to use 'update'): "
if "%msg%"=="" set msg=update

echo.
echo [ Uploading... ]
echo --------------------------------------------
git add .
git commit -m "%msg%"
git push
echo --------------------------------------------
echo.
echo === Done! Webpage updates in 1-3 minutes ===
echo.
pause
