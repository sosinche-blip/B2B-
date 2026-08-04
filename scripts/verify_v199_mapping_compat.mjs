import fs from "node:fs";

const app = fs.readFileSync("apps/web/src/App.tsx", "utf8");
const worker = fs.readFileSync("apps/worker/src/worker.ts", "utf8");
const style = fs.readFileSync("apps/web/src/style.css", "utf8");
function check(value, message) { if (!value) throw new Error(`[FAIL] ${message}`); console.log(`[OK] ${message}`); }
check(app.includes('APP_VERSION = "V199 매핑동기화 404 호환·엑셀운영본"'), "V199 version marker");
check(app.includes('/api/operation/mappings/load?settingsKey=') && app.includes('/api/operation/settings/load?settingsKey='), "404-compatible mapping load fallback");
check(app.includes('/api/operation/mappings/upsert') && app.includes('/api/operation/settings/save'), "404-compatible mapping save fallback");
check(app.includes('isHttp404') && app.includes('기존 설정 API 호환모드'), "compatibility status handling");
check(app.includes('매핑 엑셀 업로드·병합') && app.includes('미매핑 엑셀'), "Excel-only mapping workflow");
check(!app.includes('registerMappingDirectly') && !app.includes('mapping-direct-entry') && !app.includes('앱에서 신규 매핑 등록'), "direct mapping entry removed");
check(!app.includes('mappingDrafts'), "automatic draft mapping creation removed");
check(style.includes('V199: shared mapping auto-sync compatibility') && !style.includes('.mapping-direct-grid'), "direct-entry styles removed");
check(worker.includes('path: "/api/operation/mappings/load"') && worker.includes('path: "/api/operation/mappings/upsert"'), "new Worker routes retained");
check(worker.includes('v199-mapping-sync-excel-compat'), "V199 Worker marker");
console.log("[PASS] V199 mapping compatibility and Excel-only workflow verification completed");
