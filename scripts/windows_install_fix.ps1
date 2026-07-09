$ErrorActionPreference = "Continue"
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
try { [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false) } catch {}

Write-Host "[B2B V169] npm install repair started." -ForegroundColor Cyan
if (!(Get-Command node.exe -ErrorAction SilentlyContinue)) {
  Write-Host "[ERROR] Node.js was not found. Install Node.js LTS first." -ForegroundColor Red
  exit 1
}
if (!(Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  Write-Host "[ERROR] npm.cmd was not found. Install Node.js LTS first." -ForegroundColor Red
  exit 1
}

Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
npm.cmd cache verify
npm.cmd config set registry https://registry.npmjs.org/
npm.cmd config set progress false | Out-Null
npm.cmd config set audit false | Out-Null
npm.cmd config set fund false | Out-Null
if (Test-Path .\node_modules) {
  Write-Host "[B2B V169] Removing node_modules for a clean reinstall."
  Remove-Item -Recurse -Force .\node_modules -ErrorAction SilentlyContinue
}
npm.cmd ci --registry=https://registry.npmjs.org/ --include=optional --no-audit --no-fund --progress=false
if ($LASTEXITCODE -ne 0) {
  Write-Host "[WARN] npm ci failed. Retrying once with npm install compatibility mode..." -ForegroundColor Yellow
  npm.cmd install --registry=https://registry.npmjs.org/ --include=optional --no-audit --no-fund --progress=false --legacy-peer-deps
}
$ExitCode = $LASTEXITCODE
if ($ExitCode -eq 0) {
  Write-Host "[B2B V169] npm install repair completed." -ForegroundColor Green
} else {
  Write-Host "[ERROR] npm install repair failed with code $ExitCode." -ForegroundColor Red
}
exit $ExitCode
