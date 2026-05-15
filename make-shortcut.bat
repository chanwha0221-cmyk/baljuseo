@echo off
setlocal

set "DIR=%~dp0"
set "TARGET=%DIR%update.bat"
set "SHORTCUT=%DIR%Update.lnk"
set "ICON=%SystemRoot%\System32\imageres.dll,176"

echo.
echo Creating shortcut in this folder...
echo   target  : %TARGET%
echo   shortcut: %SHORTCUT%
echo.

if not exist "%TARGET%" (
  echo [ERROR] update.bat not found.
  pause
  exit /b 1
)

powershell -NoProfile -Command "$s=(New-Object -COM WScript.Shell).CreateShortcut('%SHORTCUT%'); $s.TargetPath='cmd.exe'; $s.Arguments=('/c ' + [char]34 + '%TARGET%' + [char]34); $s.WorkingDirectory='%DIR%'; $s.IconLocation='%ICON%'; $s.Save()"

if exist "%SHORTCUT%" (
  echo.
  echo [OK] Shortcut created: Update.lnk
  echo.
  echo Next steps:
  echo   1. Rename "Update.lnk" to whatever name you want
  echo   2. Drag it to the taskbar to pin
  echo.
) else (
  echo.
  echo [FAILED] Could not create shortcut.
  echo.
)

pause
endlocal
