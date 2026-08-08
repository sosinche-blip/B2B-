import { readFileSync } from 'node:fs';
const worker = readFileSync('apps/worker/src/worker.ts','utf8');
function must(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`[PASS] ${message}`);
}
must(
  worker.includes('resolveActualAppliedCouponForOptions(env: Env, preferredCouponId: string, expectedVendorItems: Array<string | number>)'),
  'actual-applied coupon resolver accepts numeric vendorItemIds produced by couponVendorItemIds()'
);
must(worker.includes('const ids: number[] = [];'), 'Coupang vendorItems payload remains numeric');
must(worker.includes('expectedVendorItems.map(cleanDigitsOnly)'), 'comparison still normalizes vendorItemIds before matching');
console.log('[PASS] V208.1 Worker TypeScript hotfix regression completed.');
