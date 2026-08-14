import fs from "node:fs";

const app = fs.readFileSync("apps/web/src/App.tsx", "utf8");
const css = fs.readFileSync("apps/web/src/style.css", "utf8");
const worker = fs.readFileSync("apps/worker/src/worker.ts", "utf8");

function check(ok, message) {
  if (!ok) {
    console.error(`[FAIL] ${message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[PASS] ${message}`);
}

console.log("[ROUND 1] simplified B2B header");
check(
  app.includes("<h1>B2B 자동화 시스템</h1>"),
  "main header is B2B 자동화 시스템"
);
check(
  app.includes('className="header-version">{APP_VERSION}</p>'),
  "technical version remains available below simplified header"
);
check(
  !app.includes('<p className="eyebrow">B2B 운영</p>'),
  "old B2B 운영 eyebrow removed"
);

console.log("[ROUND 2] AdminPlus all-account catalog");
check(
  app.includes('<option value="__all__">전체계정 선택</option>'),
  "all-account option exists"
);
check(
  app.includes('adminplusCatalogAccountId === "__all__"'),
  "all-account catalog branch exists"
);
check(
  app.includes("adminplusAccounts.filter((row) => row.enabled)"),
  "all-account lookup uses enabled AdminPlus accounts"
);
check(
  app.includes('callApi("/api/integrations/adminplus/catalog/products"'),
  "existing AdminPlus catalog endpoint retained"
);
check(
  app.includes('adminplusCatalogAccountId === "__all__"} onClick={() => void loadAdminPlusExcelMatchSuggestions()'),
  "Excel auto recommendation is blocked in all-account mode"
);
check(
  app.includes("전체계정 조회 상태에서는 매칭 저장"),
  "direct match save is guarded in all-account mode"
);

console.log("[ROUND 3] one-line catalog action / regression");
check(
  app.includes('className="btn-api adminplus-catalog-load-button"'),
  "catalog load button has dedicated class"
);
check(
  css.includes(".adminplus-catalog-load-button"),
  "catalog load button CSS exists"
);
check(
  css.includes("white-space: nowrap"),
  "상품목록 불러오기 remains on one line"
);
check(
  css.includes("word-break: keep-all"),
  "Korean button text does not split unnaturally"
);

check(
  worker.includes("v248-r9r2-adminplus-multiaccount-flow-fix-20260813"),
  "R9.2 AdminPlus multi-account runtime retained"
);
check(
  worker.includes("v248-r8r3-adaptive-actual-end-reissue-20260813"),
  "R8.3 coupon adaptive actual-end policy retained"
);
check(
  worker.includes("v248-r7r1"),
  "R7.1 shipment relink line retained"
);

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("[PASS] V248 R9.3 UI cleanup verification completed (3 rounds).");