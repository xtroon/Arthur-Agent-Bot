import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const candidates = [
  path.resolve(__dirname, '../dist/cli/hook-runner.js'),
  path.resolve(__dirname, 'dist/cli/hook-runner.js'),
  path.resolve(process.cwd(), 'dist/cli/hook-runner.js'),
  path.resolve(process.cwd(), '../dist/cli/hook-runner.js'),
];

const runnerPath = candidates.find((p) => fs.existsSync(p));

if (!runnerPath) {
  console.log(JSON.stringify({ decision: 'deny', reason: 'Arthur hook-runner.js not found. Please run npm run build first.' }));
  process.exit(0);
}

const child = spawn(process.execPath, [runnerPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});

