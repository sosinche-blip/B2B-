import fs from "node:fs";
const web=fs.readFileSync("apps/web/src/App.tsx","utf8");
const worker=fs.readFileSync("apps/worker/src/worker.ts","utf8");
const wrangler=fs.readFileSync("wrangler.toml","utf8");
const checks=[
["ROUND1 fixed settings",web.includes("/api/operation/settings/load?settingsKey=${encodeURIComponent(DEFAULT_SETTINGS_KEY)}")],
["ROUND1 scheduler fixed key",worker.includes('const PRODUCTION_SETTINGS_KEY = "b2b-master-settings";')],
["ROUND1 no arbitrary latest scheduler",!worker.slice(worker.indexOf("async function loadLatestSchedulerPayload"),worker.indexOf("async function saveLatestSchedulerPayload")).includes('.order("updated_at", { ascending: false })')],
["ROUND1 empty links authoritative",web.includes("const hasServerLinks = Array.isArray(result.summary?.links);")&&web.includes("if (hasServerLinks) setAdminplusProductLinks(links);")],
["ROUND2 no Cloudflare cron",!/[[]triggers[]][\s\S]*?crons\s*=/.test(wrangler)],
["ROUND2 current scheduler guide",worker.includes("Ncloud 단일 스케줄러가 AdminPlus 발주·가격확인·송장, 쿠폰, 저장소 정리를 실행")],
["ROUND2 current coupon guide",worker.includes("23:50 종료 / 23:52 발행 / 23:57·23:58 복구확인")],
["ROUND3 runtime sessionStorage",web.includes("window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));")],
["ROUND3 old runtime localStorage cleanup",web.includes("window.localStorage.removeItem(STORAGE_KEY);")],
["ROUND4 R5.3.3 retained",worker.includes("v259-r5-3-3-confirmed-link-recovery-20260828")],
["ROUND4 R5.4 retained",worker.includes("v259-r5-4-price-final-change-time-20260828")&&web.includes("최종변경시각")],
["ROUND4 diagnostic UI retained",web.includes("<th>매칭경로</th>")&&web.includes("<th>API확정 후보</th>")],
["ROUND4 R5.5 health marker",worker.includes('systemStabilityRevision: "v259-r5-5-system-stability-20260828"')]
];
let failed=0;for(const [name,ok] of checks){console.log(ok?"[PASS]":"[FAIL]",name);if(!ok)failed++;}if(failed)process.exit(1);console.log("\n[PASS] V259 R5.5 four-pass audit completed.");
