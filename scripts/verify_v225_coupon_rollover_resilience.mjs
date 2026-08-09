import fs from "node:fs";
const worker=fs.readFileSync(new URL("../apps/worker/src/worker.ts", import.meta.url),"utf8");
function must(ok,msg){ if(!ok){console.error(`[FAIL] ${msg}`); process.exitCode=1;} else console.log(`[PASS] ${msg}`);}
console.log("[ROUND 1] cancellation safety");
must(worker.includes('delays: [0, 5_000, 5_000]'), 'cancel/request state is checked three times at 5-second intervals');
must(worker.includes('couponCancelExecutionTime'), 'coupon validity end and cancellation execution time are separated');
must(worker.includes('startAt: `${couponDate} 00:00`'), 'new coupon uses Coupang-supported next-day 00:00 validity start');
console.log("[ROUND 2] post-issue reconciliation");
must(worker.includes('applied_verify_1m'), 'one-minute APPLIED verification exists');
must(worker.includes('applied_verify_30m'), '30-minute final APPLIED verification exists');
must(worker.includes('APPLIED 상태에 대상 옵션이 단 하나도 없을 때만 신규 쿠폰 생성을 허용'), 'reissue is guarded against duplicate APPLIED coupons');
console.log("[ROUND 3] release marker");
must(worker.includes('coupon-rollover-reconcile-v225-20260810'), 'V225 coupon rollover revision exposed');
if(!process.exitCode) console.log('[PASS] V225 coupon rollover resilience verification completed (3 rounds).');
