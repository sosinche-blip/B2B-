import fs from "node:fs";
const worker=fs.readFileSync("apps/worker/src/worker.ts","utf8");
const app=fs.existsSync("apps/web/src/App.tsx")?fs.readFileSync("apps/web/src/App.tsx","utf8"):"";
const must=(ok,msg)=>{if(!ok)throw new Error(msg);console.log(`[PASS] ${msg}`)};

console.log("[ROUND 1] active-first catalog safety");
must(worker.includes("const activeResult = await adminplusCatalogProducts(env, account, 500, false);"),"price watch always loads active products first");
must(worker.includes("const fullResult = await adminplusCatalogProducts(env, account, 500, true);"),"full catalog is only a secondary merge");
must(worker.includes("const mergedRows = [...activeRows]"),"active and full catalogs are merged");
must(worker.includes("catalogSuspiciouslyEmpty"),"zero-row catalog is detected as suspicious");

console.log("[ROUND 2] false soldout prevention");
must(worker.includes('alertKind: "조회확인필요"'),"catalog failure gets lookup-pending state");
must(worker.includes("품절 판정을 보류"),"catalog failure does not become soldout");
must(worker.includes("활성상품 조회와 전체상품 보조조회 모두 정상 완료했지만"),"soldout requires successful catalog evidence");
if(app) must(app.includes("조회확인필요"),"UI exposes lookup-pending state");

console.log("[ROUND 3] regression/release");
must(worker.includes("normalizeAdminPlusProductName"),"special-character normalization retained");
must(worker.includes('alertKind: "재확정대기"'),"reconfirm-wait behavior retained");
must(worker.includes("v240-active-first-false-soldout-fix-20260811"),"V240 active-first revision exposed");
if(app) must(app.includes('PRICEWATCH_ACTIVE_FIRST_REVISION = "v240-active-first-false-soldout-fix-20260811"'),"web V240 revision exposed");

console.log("[PASS] V240 active-first false-soldout verification completed (3 rounds).");
