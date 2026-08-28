import fs from "node:fs";
const web = fs.readFileSync("apps/web/src/App.tsx", "utf8");
const worker = fs.readFileSync("apps/worker/src/worker.ts", "utf8");
const wrangler = fs.readFileSync("wrangler.toml", "utf8");
const checks = [
  ["web R5.5 marker", web.includes("v259-r5-5-system-stability-20260828")],
  ["startup loads fixed production settings key", web.includes('/api/operation/settings/load?settingsKey=${encodeURIComponent(DEFAULT_SETTINGS_KEY)}')],
  ["browser runtime state uses sessionStorage", web.includes("window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));")],
  ["legacy runtime localStorage is removed after migration", web.includes("window.localStorage.removeItem(STORAGE_KEY);")],
  ["server empty AdminPlus link array is authoritative", web.includes("const hasServerLinks = Array.isArray(result.summary?.links);") && web.includes("if (hasServerLinks) setAdminplusProductLinks(links);")],
  ["price R5.4 retained", worker.includes("v259-r5-4-price-final-change-time-20260828")],
  ["scheduler fixed production settings key", worker.includes('const PRODUCTION_SETTINGS_KEY = "b2b-master-settings";') && worker.includes('.eq("settings_key", settingsKey)')],
  ["scheduler no longer selects newest arbitrary settings row", !worker.slice(worker.indexOf("async function loadLatestSchedulerPayload"), worker.indexOf("async function saveLatestSchedulerPayload")).includes('.order("updated_at", { ascending: false })')],
  ["Cloudflare cron removed", !/\[triggers\][\s\S]*?crons\s*=/.test(wrangler)],
  ["health exposes current stability release", worker.includes('version: "v259-r5-5-system-stability"') && worker.includes('systemStabilityRevision: "v259-r5-5-system-stability-20260828"')],
  ["coupon schedule guide updated", worker.includes("23:50 종료 / 23:52 발행 / 23:57·23:58 복구확인") && web.includes('쿠폰 23:52 발행')],
  ["R5.3.3 retained", worker.includes("v259-r5-3-3-confirmed-link-recovery-20260828")],
];
let failed=0;
for (const [name, ok] of checks) { if(ok) console.log("[PASS]",name); else { console.error("[FAIL]",name); failed++; } }
if(failed) process.exit(1);
console.log("\n[PASS] V259 R5.5 system stability verification completed.");
