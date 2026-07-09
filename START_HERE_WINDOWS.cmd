@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if "%B2B_SAFE_MODE%"=="" set B2B_SAFE_MODE=false

echo [B2B V147] Starting local server.
if /I "%B2B_SAFE_MODE%"=="true" (
  echo [B2B V147] Safe mode is enabled. Live Coupang/Toss API calls are blocked.
) else (
  echo [B2B V147] Live order collection is enabled.
)
echo [B2B V147] Coupang collection uses stable fallback collection and mapping diagnostics.
echo [B2B V147] If startup fails, check the logs folder or run DIAGNOSE_SERVER_WINDOWS.cmd.
echo.

where powershell.exe >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Windows PowerShell was not found.
  echo Please install or enable Windows PowerShell and run this file again.
  pause
  exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows_quick_start.ps1"
set EXITCODE=%ERRORLEVEL%

echo.
if not "%EXITCODE%"=="0" (
  echo [B2B V147] Server start failed. Run DIAGNOSE_SERVER_WINDOWS.cmd and check logs.
) else (
  echo [B2B V147] Server was closed.
)
pause
exit /b %EXITCODE%
