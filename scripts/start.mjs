import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
// Wrangler otherwise resolves state and Worker variables beside dist/server/wrangler.json.
const args = [
  resolve(root, 'node_modules/wrangler/bin/wrangler.js'),
  'dev',
  '--config', resolve(root, 'dist/server/wrangler.json'),
  '--persist-to', resolve(root, process.env.QA_STATE_DIR || '.wrangler/state'),
];
for (const name of ['.env', '.env.local']) {
  const path = resolve(root, name);
  if (existsSync(path)) args.push('--env-file', path);
}
args.push(...process.argv.slice(2));
const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit', env: process.env });
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
