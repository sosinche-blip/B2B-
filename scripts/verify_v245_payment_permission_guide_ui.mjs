import fs from "node:fs";
const app=fs.readFileSync("apps/web/src/App.tsx","utf8");
const css=fs.readFileSync("apps/web/src/style.css","utf8");
const must=(ok,msg)=>{if(!ok)throw new Error(msg);console.log(`[PASS] ${msg}`)};

console.log("[ROUND 1] permission vs policy separation");
must(app.includes("adminPlusPaymentPermissionState"),"permission-state helper exists");
must(app.includes('status: "API 결제권한 필요"'),"payment API permission is distinct from payment policy");
must(app.includes('return "한도 설정 필요"'),"limit configuration has separate status");
must(app.includes('return "자동결제 OFF"'),"auto-payment OFF has separate status");

console.log("[ROUND 2] operator guidance");
must(app.includes("결제권한 안내"),"permission guide button exists");
must(app.includes("이 화면에서 설정할 수 있는 것은 자동결제 ON/OFF와 1회·일일 한도"),"guide explains local settings scope");
must(app.includes("결제조회/결제실행 API 권한은 AdminPlus 계정 쪽 권한"),"guide explains external API permission");
must(app.includes("예치금 잔액 조회는 정상이나 결제조회/결제실행 API가 권한없음"),"guide includes support request wording");
must(app.includes("계정목록·권한 확인"),"guide includes post-approval verification step");

console.log("[ROUND 3] safety/release");
must(app.includes('disabled={account.balanceReadScopeOk === false || account.paymentReadScopeOk === false}'),"auto-payment remains blocked without scopes");
must(app.includes('PAYMENT_PERMISSION_GUIDE_UI_REVISION = "v245-payment-permission-guide-ui-20260811"'),"V245 UI revision exposed");
must(css.includes(".adminplus-payment-permission-guide"),"guide styling exists");

console.log("[PASS] V245 payment-permission guide UI verification completed (3 rounds).");
