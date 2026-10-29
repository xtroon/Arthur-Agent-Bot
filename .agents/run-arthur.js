import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const candidates = [
  path.resolve(__dirname, '../dist/cli/hook-runner.js'),
  path.resolve(__dirname, 'dist/cli/hook-runner.js'),
  path.resolve(process.cwd(), 'dist/cli/hook-runner.js'),
  path.resolve(process.cwd(), 'node_modules/arthur-agent-bot/dist/cli/hook-runner.js'),
  path.resolve(__dirname, '../node_modules/arthur-agent-bot/dist/cli/hook-runner.js'),
];

let runnerPath = candidates.find((p) => fs.existsSync(p));

if (runnerPath) {
  const child = spawn(process.execPath, [runnerPath, ...process.argv.slice(2)], {
    stdio: 'inherit',
  });
  child.on('exit', (code) => process.exit(code ?? 0));
} else {
  // Fallback to npx runner if not installed locally
  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const child = spawn(npxCmd, ['--yes', 'arthur-agent-bot', 'hook-runner', ...process.argv.slice(2)], {
    stdio: 'inherit',
    shell: true,
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}
