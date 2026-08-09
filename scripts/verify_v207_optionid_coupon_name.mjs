import fs from "node:fs";
const app = fs.readFileSync("apps/web/src/App.tsx", "utf8");
const worker = fs.readFileSync("apps/worker/src/worker.ts", "utf8");
const checks = [
  [app.includes('V208 어드민플러스 다계정·자동발주·송장자동화') || app.includes('V223'), 'V208 app version'],
  [app.includes('다음 발행 쿠폰명'), 'editable coupon-name column'],
  [app.includes('baseCouponName: event.target.value'), 'coupon/base name updated together'],
  [!app.includes('같은 이름의 활성·대기 쿠폰이 이미 있습니다'), 'local coupon-name duplicate block removed'],
  [worker.includes('옵션ID ${optionId}가 APPLIED 쿠폰'), 'option-ID duplicate detection'],
  [worker.includes('같은 쿠폰명 ${sameNameCount}건이 있으나 옵션ID가 중복되지 않아 정상으로 허용합니다.'), 'same-name allowed when options differ'],
  [!worker.includes('동일 날짜 쿠폰명 중복:'), 'old name-based failure removed'],
  [worker.includes('version: "v208-adminplus-multi-account-automation"'), 'worker version'],
];
for (const [ok, label] of checks) { if (!ok) throw new Error(`FAIL: ${label}`); }
console.log('V207 옵션ID 중복판정·쿠폰명 편집 검증 통과');
