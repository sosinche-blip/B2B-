@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set B2B_SAFE_MODE=true

echo [B2B V147] Starting safe mode.
echo [B2B V147] Live Coupang/Toss API calls will be blocked.
call "%~dp0START_HERE_WINDOWS.cmd"
