@echo off
chcp 65001 > nul
title Git Pull Sync

cd /d "%~dp0"

echo.
echo ============================================
echo    Git Pull - Sync with remote
echo ============================================
echo.

git pull --rebase

echo.
echo ============================================
echo  Done. Now run update.bat
echo ============================================
echo.
pause
