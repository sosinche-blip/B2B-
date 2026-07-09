$ErrorActionPreference = "Continue"
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
try { [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false) } catch {}

$Root = Get-Location
$LogDir = Join-Path $Root "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$LogFile = Join-Path $LogDir "start_v147_$Stamp.log"
try { Start-Transcript -Path $LogFile -Append | Out-Null } catch {}

Write-Host "[B2B V169] Checking runtime settings before startup." -ForegroundColor Cyan
Write-Host "[B2B V169] Log file: $LogFile"

Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

if (!(Get-Command node.exe -ErrorAction SilentlyContinue)) {
  Write-Host "[ERROR] Node.js was not found. Install Node.js LTS and run START_HERE_WINDOWS.cmd again." -ForegroundColor Red
  try { Stop-Transcript | Out-Null } catch {}
  exit 1
}
if (!(Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  Write-Host "[ERROR] npm.cmd was not found. Install Node.js LTS and run START_HERE_WINDOWS.cmd again." -ForegroundColor Red
  try { Stop-Transcript | Out-Null } catch {}
  exit 1
}

node.exe .\scripts\normalize_safe_env.mjs
if ($LASTEXITCODE -ne 0) {
  Write-Host "[WARN] Environment normalization failed. Startup diagnostics will continue." -ForegroundColor Yellow
}

if (Test-Path .\package-lock.json) {
  Write-Host "[B2B V169] package-lock.json found."
}

npm.cmd config set registry https://registry.npmjs.org/
npm.cmd config set progress false | Out-Null
npm.cmd config set audit false | Out-Null
npm.cmd config set fund false | Out-Null

if (!(Test-Path .\node_modules\.bin\vite.cmd) -or !(Test-Path .\node_modules\.bin\wrangler.cmd)) {
  Write-Host "[B2B V169] Packages are not installed. Installing from the public npm registry. This may take a few minutes on the first run..."
  npm.cmd ci --registry=https://registry.npmjs.org/ --include=optional --no-audit --no-fund --progress=false
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARN] npm ci failed. Retrying once with npm install compatibility mode..." -ForegroundColor Yellow
    npm.cmd install --registry=https://registry.npmjs.org/ --include=optional --no-audit --no-fund --progress=false --legacy-peer-deps
  }
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Install failed. Run INSTALL_FIX_WINDOWS.cmd and try again." -ForegroundColor Red
    Write-Host "[B2B V169] Check log file: $LogFile" -ForegroundColor Yellow
    try { Stop-Transcript | Out-Null } catch {}
    exit $LASTEXITCODE
  }
}

npm.cmd run check:env
if ($LASTEXITCODE -ne 0) {
  Write-Host "[WARN] Environment check reported warnings. V169 will still continue startup." -ForegroundColor Yellow
}

Write-Host "[B2B V169] Starting server. The browser URL will be printed shortly." -ForegroundColor Green
npm.cmd run dev:all
$ExitCode = $LASTEXITCODE
if ($ExitCode -ne 0) {
  Write-Host "[ERROR] Server start failed. Run DIAGNOSE_SERVER_WINDOWS.cmd." -ForegroundColor Red
  Write-Host "[B2B V169] Log file: $LogFile" -ForegroundColor Yellow
}
try { Stop-Transcript | Out-Null } catch {}
exit $ExitCode
