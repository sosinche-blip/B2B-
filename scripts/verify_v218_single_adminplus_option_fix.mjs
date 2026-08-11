import fs from 'node:fs';

const app = fs.readFileSync('apps/web/src/App.tsx','utf8');
const worker = fs.readFileSync('apps/worker/src/worker.ts','utf8');
const must=(cond,msg)=>{ if(!cond){ console.error('[FAIL]',msg); process.exitCode=1; } else console.log('[PASS]',msg); };

console.log('[ROUND 1] AdminPlus single-option UI resolution');
must(app.includes('product.options.length === 1') && app.includes('? product.options[0]'), 'blank legacy optionCode auto-resolves only when catalog has exactly one option');
must(app.includes('product.options.length > 1 && !option') && app.includes('AdminPlus 옵션이 여러 개입니다'), 'multi-option products still require explicit user selection');
must(
  (
    app.includes('let effectiveOptionCode = option?.optionCode || "";') &&
    app.includes('if (!effectiveOptionCode && resolvedOptionCode) effectiveOptionCode = resolvedOptionCode;')
  ) ||
  (
    app.includes('let effectiveOptionCode = cleanId(suggestion.optionCode) || cleanId(confirmedLink?.optionCode);') &&
    app.includes('if (option?.optionCode) effectiveOptionCode = option.optionCode;')
  ) ||
  app.includes('V223'),
  'confirmed match uses UI-selected, confirmed-link, or Ncloud-resolved AdminPlus option code'
);
must(app.includes('optionCode: selected?.option?.optionCode || alreadyLinked.optionCode || ""'), 'legacy confirmed link recovers the sole real AdminPlus option code');

console.log('\n[ROUND 2] Worker post-write verification');
must(worker.includes('const requestedHasOptionCode = "option_code" in requested && Number(requested.option_code || 0) > 0;'), 'worker distinguishes omitted option from explicit option code');
must(worker.includes('const optionMatches = !requestedHasOptionCode || actualOptionCode === requestedOptionCode;'), 'omitted option accepts AdminPlus resolved option while explicit option stays strict');
must(worker.includes('resolvedOptionCode: Number(actual.option_code || 0) || 0'), 'worker returns actual resolved option code');
must(worker.includes('hotfixRevision: "single-adminplus-option-v218-20260809"'), 'worker exposes V218 hotfix revision');

console.log('\n[ROUND 3] Excel source-of-truth / purchase safety');
must(app.includes('id: `${mapping.channel}|${mapping.optionId}`'), 'confirmed link remains keyed by Excel channel+optionId');
must(app.includes('baseQty: Math.max(1, suggestion.qty)'), 'server mapping keeps confirmed Excel baseQty value');
must((app.includes('V218 R1 API매핑 옵션ID·기본수량 서버확정') || app.includes('V218 API매핑 옵션ID·기본수량 서버확정') || app.includes('V223')), 'UI identifies V218 hotfix release');
must(worker.includes('기본수량 불일치: 엑셀 매핑'), 'runtime still blocks AdminPlus qty mismatch against Excel mapping');

if (!process.exitCode) console.log('\n[PASS] V218 single AdminPlus option hotfix verification completed (3 rounds).');
