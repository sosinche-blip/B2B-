$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
npm.cmd ci
npm.cmd run verify:all
npm.cmd run typecheck:worker
npm.cmd run build
npx.cmd wrangler deploy --config wrangler.toml
npx.cmd wrangler pages deploy apps/web/dist --project-name=b2b-bpt
Write-Host "[PASS] V249 R10 Worker + Pages deploy completed"
