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
check(app.includes("V196 간소화 UI·쿠팡 인증키 관리 운영본"), "V196 UI version marker");
check(app.includes('label: "오늘운영"') && app.includes('label: "매핑·발주"'), "Five-menu simplified navigation");
check(!app.includes('label: "주문관리"') && !app.includes('label: "양식설정"'), "Duplicate top-level menus removed");
check(app.includes("쿠팡 API 인증키 교체") && app.includes("/api/admin/coupang-credentials/apply"), "Coupang credential rotation UI");
check(app.includes("secureWorkerOnly: true") && app.includes("인증키 관리 요청은 HTTPS Cloudflare Worker에서만 실행"), "Credential UI cannot fall back to a direct HTTP origin");
check(app.includes("새 Secret Key 확인") && app.includes("연결 테스트"), "Credential confirmation and test controls");
check(app.includes("고급·위험 작업") && app.includes("선택 쿠폰 실제 취소"), "Coupon danger actions separated");
check(app.includes("선택 쿠폰 반복대상 추가") && app.includes("자동운영 시작"), "Coupon primary workflow simplified");
check(app.includes("정액(원)") && app.includes("정률(%)") && app.includes("즉시 적용"), "Coupon amount/rate and immediate apply retained");
check(style.includes("credential-management-card") && style.includes("workspace-subtabs"), "Simplified UI styles");
check(worker.includes('"/api/admin/coupang-credentials/"'), "Credential route proxied to Ncloud");
check(worker.includes("buildCredentialSecurityEnvelope") && worker.includes("AES-GCM") && worker.includes("x-b2b-credential-envelope"), "Credential payload is encrypted before the Ncloud HTTP hop");
check(worker.includes('version: "v196-simplified-credential-management"'), "V196 worker marker");
if (failed) process.exit(1);
console.log("[PASS] V196 simplified UI and credential management verification completed");
