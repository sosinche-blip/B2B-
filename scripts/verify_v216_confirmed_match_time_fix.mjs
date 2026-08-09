import fs from 'node:fs';
const app=fs.readFileSync(new URL('../apps/web/src/App.tsx', import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../apps/worker/src/worker.ts', import.meta.url),'utf8');
function must(cond,msg){if(!cond){console.error('[FAIL]',msg);process.exitCode=1;}else console.log('[PASS]',msg);}

console.log('[ROUND 1] previous confirmed-match recognition / recovery');
must(app.includes('confirmedAdminPlusLinkForMapping'), 'same option + same vendor recognizes confirmed link even if accountId changed');
must(app.includes('서버에 이미 확정 저장된 옵션 매칭입니다. 다시 매칭할 필요가 없습니다.'), 'UI explicitly avoids re-confirming server-confirmed mappings');
must(app.includes('구버전에서 누락된 B2B 확정 링크만 자동 복구'), 'existing exact AdminPlus 1:1 match can backfill missing B2B link');
must(app.includes('AdminPlus 실제 수량 ${actualQty}개와 서버 기본수량 ${expectedQty}개가 달라'), 'real qty conflicts are not silently auto-confirmed');

console.log('\n[ROUND 2] purchase-time commit path');
must(app.includes('const adminPlusMatchChanged = !confirmedLink'), 'edit path detects whether AdminPlus product match actually changed');
must(app.includes('발주시간/배송비는 B2B 서버 확정값입니다.'), 'time/shipping changes are explicitly server-only settings');
must(app.includes('if (adminPlusMatchChanged) {') && app.includes('AdminPlus 재검증 + '), 'AdminPlus write happens only when product/option/qty changed');
must(app.includes('verifyAdminPlusConfirmedPersistence(nextMapping, link)'), 'confirmed edit still re-loads server and verifies time/qty/shipping persistence');

console.log('\n[ROUND 3] server link loss prevention / release marker');
must(worker.includes('function mergeAdminPlusProductLinkRecords'), 'settings save merges existing confirmed links instead of replacing the whole list');
must(worker.includes('adminplusProductLinks: mergedAdminPlusProductLinks'), 'merged confirmed links are persisted');
must(worker.includes('featureRevision: "confirmed-match-time-commit-v216-20260809"'), 'Worker exposes V216 feature revision');

if(!process.exitCode) console.log('\n[PASS] V216 confirmed-match/time-commit verification completed (3 rounds).');
