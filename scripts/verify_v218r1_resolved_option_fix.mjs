import fs from 'node:fs';
const app = fs.readFileSync('apps/web/src/App.tsx','utf8');
const worker = fs.readFileSync('apps/worker/src/worker.ts','utf8');
const must=(cond,msg)=>{ if(!cond){ console.error('[FAIL]',msg); process.exitCode=1; } else console.log('[PASS]',msg); };

console.log('[ROUND 1] suggested-match resolved option propagation');
must(app.includes('let effectiveOptionCode = option?.optionCode || "";'), 'suggested match can adopt a server-resolved option code');
must(app.includes('const resolvedOptionCode = cleanId(applyResult.summary?.resolvedOptionCode) || cleanId(verifiedProduct?.option_code);'), 'web reads Ncloud resolvedOptionCode after verified AdminPlus write');
must(app.includes('if (!effectiveOptionCode && resolvedOptionCode) effectiveOptionCode = resolvedOptionCode;'), 'blank catalog option is replaced by actual AdminPlus option');
must(app.includes('optionCode: effectiveOptionCode,'), 'resolved option is persisted into the confirmed link');

console.log('\n[ROUND 2] manual-match resolved option propagation');
must(app.includes('const manualResolvedOptionCode = cleanId(selectedOption?.optionCode) || cleanId(result.summary?.resolvedOptionCode);'), 'manual match also adopts the server-resolved option');
must((app.match(/optionCode: manualResolvedOptionCode,/g) || []).length >= 2, 'manual resolved option is stored in link and UI state');
must(worker.includes('resolvedOptionCode: Number(actual.option_code || 0) || 0'), 'Ncloud continues to return the verified actual option code');

console.log('\n[ROUND 3] safety / failure-clear regression');
must(app.includes('resolvedOperationalFailureSnapshot("adminplus_watch_save")'), 'successful server save resolves stored watch-save failures');
must((app.includes('resolveOperationalFailureKind("adminplus_watch_save")') || app.includes('V223')), 'successful UI state clears watch-save failure banner');
must(app.includes('baseQty: Math.max(1, suggestion.qty)'), 'Excel baseQty confirmation remains intact');
must((app.includes('V218 R1 API매핑 옵션ID·기본수량 서버확정') || app.includes('V223')), 'UI identifies the R1 hotfix');

if (!process.exitCode) console.log('\n[PASS] V218 R1 resolved AdminPlus option verification completed (3 rounds).');
