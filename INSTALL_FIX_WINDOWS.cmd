@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo [B2B V147] Repairing npm package installation.
where powershell.exe >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Windows PowerShell was not found.
  pause
  exit /b 1
)
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows_install_fix.ps1"
echo.
echo [B2B V147] Install repair finished.
pause
