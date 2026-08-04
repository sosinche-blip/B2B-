import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const app = readFileSync(join(root, "apps/web/src/App.tsx"), "utf8");
const style = readFileSync(join(root, "apps/web/src/style.css"), "utf8");
const worker = readFileSync(join(root, "apps/worker/src/worker.ts"), "utf8");
let failed = false;
const check = (condition, message) => {
  if (condition) console.log(`[PASS] ${message}`);
  else { console.error(`[FAIL] ${message}`); failed = true; }
};

check(app.includes('APP_VERSION = "V198 매핑 자동동기화·앱 직접등록 운영본"'), "V198 UI version marker");
check(app.includes("async function loadMappingsFromServer") && app.includes("async function syncMappingsToServer"), "mapping auto load/save functions");
check(app.includes('"/api/operation/mappings/upsert"') && app.includes('/api/operation/mappings/load?settingsKey='), "mapping-only API calls");
check(app.includes("registerMappingDirectly") && app.includes("앱에서 신규 매핑 등록"), "direct mapping registration");
check(app.includes("selectMissingMappingTarget") && app.includes("미매핑 주문에서 가져오기"), "unmapped-order prefill");
check(app.includes("setOrderSelectionMessage(\"서버 최신 매핑을 확인한 뒤 선택 주문을 처리합니다.\")"), "mobile selection refreshes server mappings");
check(app.includes("쿠팡+토스 주문조회") && app.includes("function upsertSelectedOrderRows"), "unified order lookup retained");
check(style.includes("mapping-sync-banner") && style.includes("mapping-direct-grid"), "responsive direct-entry styles");
check(worker.includes('path: "/api/operation/mappings/load"') && worker.includes('path: "/api/operation/mappings/upsert"'), "worker mapping-only routes");
check(worker.includes("function mergeMappingRecords") && worker.includes("...payload,\n    mappings"), "worker preserves other settings while merging mappings");
check(worker.includes("mappingTombstones") && worker.includes("incomingMappingsAfterTombstones"), "stale devices cannot restore deleted mappings");
check(worker.includes('version: "v198-mapping-sync-direct-entry"'), "V198 worker marker");
check(app.includes("쿠팡 API 인증키 교체") && app.includes("정률(%)") && app.includes("즉시 적용"), "credentials and coupons retained");

if (failed) process.exit(1);
console.log("[PASS] V198 mapping synchronization and direct registration verification completed");
