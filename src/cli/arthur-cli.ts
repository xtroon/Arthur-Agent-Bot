#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { defaultRelayClient } from '../relay/relay-client.js';
import { loadArthurConfig, saveArthurConfig } from '../core/config.js';
import { TelegramClient } from '../telegram/telegram-client.js';

function ask(questionText: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(questionText, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function installAntigravityHooks(targetDir: string = process.cwd()) {
  const agentsDir = path.resolve(targetDir, '.agents');
  if (!fs.existsSync(agentsDir)) {
    fs.mkdirSync(agentsDir, { recursive: true });
  }

  const hooksJsonPath = path.resolve(agentsDir, 'hooks.json');
  const runArthurJsPath = path.resolve(agentsDir, 'run-arthur.js');

  const hooksConfig = {
    'arthur-approver': {
      enabled: true,
      PreToolUse: [
        {
          matcher: 'run_command|write_file|edit_file',
          hooks: [
            {
              type: 'command',
              command: 'node run-arthur.js',
              timeout: 180,
            },
          ],
        },
      ],
    },
  };

  fs.writeFileSync(hooksJsonPath, JSON.stringify(hooksConfig, null, 2), 'utf8');

  const runArthurBridge = `import path from 'node:path';
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
`;

  fs.writeFileSync(runArthurJsPath, runArthurBridge, 'utf8');
}

async function handlePair() {
  console.log('\n======================================================');
  console.log('🛡️  Arthur 1-Click Phone Pairing');
  console.log('======================================================\n');

  const session = await defaultRelayClient.getOrCreatePairingSession();
  if (!session) {
    console.error('❌ Could not generate pairing session. Check your internet connection.');
    return;
  }

  console.log('📱 Tap this link on your phone to connect instantly:\n');
  console.log(`👉 \x1b[36m\x1b[1m${session.pairingUrl}\x1b[0m\n`);
  console.log('No bot creation needed! Telegram will open and pair your device automatically.');

  installAntigravityHooks();
  console.log('✅ Workspace hooks verified in .agents/hooks.json');
}

async function handleStatus() {
  const config = loadArthurConfig();
  console.log('\n🛡️  Arthur Status:');
  console.log(`• Session ID:    ${config.pairedSessionId || 'Not paired'}`);
  console.log(`• Pairing Code:  ${config.pairingCode || 'None'}`);
  console.log(`• Relay URL:     ${config.relayUrl || 'Default'}`);
  console.log(`• Policy:        Auto-approve safe read commands (ON)`);
}

async function main() {
  const command = process.argv[2] || 'pair';

  if (command === 'hook-runner') {
    await import('./hook-runner.js');
  } else if (command === 'pair' || command === 'link' || command === 'init') {
    await handlePair();
  } else if (command === 'status') {
    await handleStatus();
  } else if (command === 'install-hooks') {
    installAntigravityHooks();
    console.log('✅ Arthur hooks installed in .agents/hooks.json');
  } else {
    console.log('Usage: arthur [pair | status | install-hooks]');
  }
}

main();
