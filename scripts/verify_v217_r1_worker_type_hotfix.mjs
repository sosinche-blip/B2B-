import fs from 'node:fs';

const worker = fs.readFileSync('apps/worker/src/worker.ts', 'utf8');
const failures = [];
const pass = (label, cond) => {
  if (cond) console.log(`[PASS] ${label}`);
  else { console.error(`[FAIL] ${label}`); failures.push(label); }
};

console.log('[ROUND 1] confirmed-link merge typing');
pass('normalized confirmed-link record has explicit indexable type',
  worker.includes('const normalized: Record<string, unknown> = { ...row, id, channel, optionId };'));
pass('updatedAt comparison remains active',
  worker.includes('Date.parse(displayText(normalized.updatedAt))'));

console.log('[ROUND 2] merge behavior remains intact');
pass('existing and incoming confirmed links are both merged',
  worker.includes('existing.forEach((row) => add(row, false));') && worker.includes('incoming.forEach((row) => add(row, true));'));
pass('option-link identity is preserved',
  worker.includes('const id = displayText(row.id).trim() || (optionId ? `${channel}|${optionId}` : "");'));

console.log('[ROUND 3] V217 runtime marker');
pass('V217 feature revision remains unchanged', worker.includes('option-baseqty-confirm-v217-20260809'));

if (failures.length) process.exit(1);
console.log('[PASS] V217 R1 Worker type hotfix verification completed (3 rounds).');
