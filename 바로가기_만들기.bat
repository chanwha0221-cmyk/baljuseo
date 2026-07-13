@echo off
chcp 65001 > nul
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0_mklink.ps1"
timeout /t 2 > nul
