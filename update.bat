@echo off
chcp 65001 > nul
title 발주서 배포

cd /d "%~dp0"

rem ── git 이 PATH 에 없을 때 흔한 설치 경로를 붙여준다 ────────────────
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

rem 🔴 예전 update.bat 은 여기서 `git config --global user.name hongchanwha` 를 박았다.
rem    박원비 팀장 PC 에서 그대로 돌면 원비씨 커밋이 전부 홍찬화 이름으로 올라간다.
rem    그래서 뺐다 (2026-08-28). 각자 PC 의 git 계정을 그대로 쓴다.

powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0_deploy_menu.ps1"
exit /b %errorlevel%
