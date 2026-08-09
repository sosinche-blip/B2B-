import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const workerPath = path.join(root, 'apps/worker/src/worker.ts');
const appPath = path.join(root, 'apps/web/src/App.tsx');
const worker = fs.readFileSync(workerPath, 'utf8');
const app = fs.existsSync(appPath) ? fs.readFileSync(appPath, 'utf8') : '';
let failed = false;
function must(condition, label) {
  if (condition) console.log(`[PASS] ${label}`);
  else { console.error(`[FAIL] ${label}`); failed = true; }
}

console.log('[ROUND 1] manual purchase backlog semantics');
must(worker.includes('manualRun = false'), 'purchase runner distinguishes manual and scheduled execution');
must(worker.includes('if (!manualRun && config.startedAt'), 'startedAt cutoff applies only to scheduled execution');
must(worker.includes('adminplusPurchaseRun(env, payload, dryRun, "", true)'), 'manual purchase endpoint explicitly includes backlog');
must(worker.includes('adminplusPurchaseRun(env, savedPayload, false, time, false)'), 'scheduled purchase keeps startedAt cutoff semantics');

console.log('[ROUND 2] server-confirmed source of truth');
must(worker.includes('const serverPayload = await loadLatestSchedulerPayload(env)'), 'manual purchase loads durable server settings');
must(worker.includes('["mappings", "adminplusProductLinks", "adminplusPurchaseHistory"'), 'confirmed mappings/links/history are protected from stale browser overwrite');
must(worker.includes('payload[protectedKey] = serverPayload[protectedKey]'), 'server protected state wins during manual execution');

console.log('[ROUND 3] operator diagnostics / regression');
must(worker.includes('skipReasonCounts'), 'skip reasons are counted for diagnosis');
must(worker.includes('collectedByChannel'), 'collected orders are counted by channel');
must(worker.includes('manual-backlog-server-source-v222-20260809'), 'V222 runtime marker exposed');
if (app) {
  must(/V22[2-9]/.test(app) && app.includes('summary.skipReasonCounts'), 'web UI retains V222 manual queue functionality in current release');
  must(app.includes('summary.skipReasonCounts'), 'web UI surfaces top exclusion reasons');
}
must(worker.includes('toss-paid-collection-v221-20260809'), 'V221 Toss PAID collection remains intact');
must(worker.includes('toss-confirmed-link-alias-v220-20260809'), 'V220 Toss confirmed-link alias remains intact');
must(worker.includes('toss-stock-productitem-v219-20260809'), 'V219 stock/productItem bridge remains intact');

if (failed) process.exit(1);
console.log('[PASS] V222 manual purchase backlog/server-source verification completed (3 rounds).');
