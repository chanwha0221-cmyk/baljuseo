@echo off
chcp 65001 > nul
title GitHub Auto Update

cd /d "G:\내 드라이브\claude\Projects\baljuseo"

echo.
echo ============================================
echo    GitHub Auto Update - Baljuseo Repo
echo ============================================
echo.

echo [ Bumping version... ]
powershell -ExecutionPolicy Bypass -NoProfile -Command "$f='index.html'; $enc=New-Object System.Text.UTF8Encoding $false; $c=[IO.File]::ReadAllText($f,$enc); $m=[regex]::Match($c,'v(\d+)\.(\d+)'); if($m.Success){$oldV='v'+$m.Groups[1].Value+'.'+$m.Groups[2].Value; $newV='v'+$m.Groups[1].Value+'.'+([int]$m.Groups[2].Value+1); $c=$c.Replace($oldV,$newV); [IO.File]::WriteAllText($f,$c,$enc); Write-Host ('Version: '+$oldV+' -^> '+$newV)} else{Write-Host 'Version pattern not found'}"
echo.

echo [ Checking git... ]
git config --global user.email "chanwha0221@gmail.com"
git config --global user.name "hongchanwha"
where git >nul 2>&1
if %errorlevel% neq 0 (
  if exist "C:\Program Files\Git\cmd\git.exe" (
    set "PATH=%PATH%;C:\Program Files\Git\cmd"
  ) else if exist "C:\Program Files (x86)\Git\cmd\git.exe" (
    set "PATH=%PATH%;C:\Program Files (x86)\Git\cmd"
  ) else (
    echo.
    echo [ERROR] git 을 찾을 수 없습니다.
    echo https://git-scm.com/download/win 에서 Git 을 설치해주세요.
    echo.
    pause
    exit /b 1
  )
)
echo.

echo [ Pulling latest from GitHub... ]
git pull
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
