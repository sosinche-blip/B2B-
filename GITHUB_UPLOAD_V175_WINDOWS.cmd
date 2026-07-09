@echo off
setlocal
cd /d "%~dp0"
echo [V175] Running install and verification...
where git >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Git is not available. Install Git for Windows and reopen PowerShell/CMD.
  exit /b 1
)
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm.cmd is not available. Install Node.js.
  exit /b 1
)
npm.cmd ci || exit /b 1
npm.cmd run verify:all || exit /b 1
npm.cmd run verify:git-safe || exit /b 1
echo.
echo [V175] Verification completed. Review git status below before commit.
git status --short
git branch --show-current
echo.
echo If status is correct, run the git add/commit/push commands in GITHUB_UPLOAD_GUIDE_V175.md.
endlocal
