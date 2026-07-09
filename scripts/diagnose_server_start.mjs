#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';
const logDir = path.join(root, 'logs');
fs.mkdirSync(logDir, { recursive: true });

function exists(p) { return fs.existsSync(path.join(root, p)); }
function print(label, value) { console.log(`${label.padEnd(28)} ${value}`); }
function run(label, cmd, args) {
  console.log(`\n[DIAG] ${label}`);
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', shell: isWin });
  if (r.stdout) console.log(r.stdout.trim());
  if (r.stderr) console.error(r.stderr.trim());
  console.log(`[DIAG] exit=${r.status ?? 'unknown'}`);
  return r.status === 0;
}
function canListen(port, host='127.0.0.1') {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (e) => resolve({ ok: false, error: e.code || e.message }));
    server.once('listening', () => server.close(() => resolve({ ok: true })));
    server.listen(port, host);
  });
}

console.log('[V172 서버 진단] 실제 비밀키 값은 출력하지 않습니다.');
print('project', root);
print('node', process.version);
print('platform', process.platform);
print('.dev.vars', exists('.dev.vars') ? 'FOUND' : 'MISSING');
print('package.json', exists('package.json') ? 'FOUND' : 'MISSING');
print('worker file', exists('apps/worker/src/worker.ts') ? 'FOUND' : 'MISSING');
print('web file', exists('apps/web/src/App.tsx') ? 'FOUND' : 'MISSING');

for (const [port, name] of [[5173, 'Web 기본포트'], [8787, 'Worker 기본포트'], [8791, '로컬폴더 기본포트']]) {
  const r = await canListen(port);
  print(`${name} ${port}`, r.ok ? 'FREE' : `BUSY(${r.error})`);
}

run('안전모드 Gate 보정', process.execPath, ['scripts/normalize_safe_env.mjs']);
run('환경변수 점검', npmCmd, ['run', 'check:env']);
run('서비스 정적 점검', npmCmd, ['run', 'verify:service']);

console.log('\n[V172 진단 완료] START_HERE_WINDOWS.cmd를 다시 실행해 주세요.');
console.log('서버 시작 로그는 logs 폴더에 남습니다.');
