@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo [B2B V147] Running startup diagnostics.
where node.exe >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Install Node.js LTS first.
  pause
  exit /b 1
)
node.exe "%~dp0scripts\diagnose_server_start.mjs"
echo.
echo [B2B V147] Diagnostics finished. Check the logs folder if needed.
pause
