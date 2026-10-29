#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import readline from 'readline';
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

function writeEnv(entries: Record<string, string>, targetDir: string = process.cwd()) {
  const envPath = path.resolve(targetDir, '.env');
  let currentContent = '';
  if (fs.existsSync(envPath)) {
    currentContent = fs.readFileSync(envPath, 'utf8');
  }

  const lines = currentContent.split('\n');
  const existingKeys = new Set<string>();

  const updatedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      existingKeys.add(key);
      if (entries[key] !== undefined) {
        return `${key}=${entries[key]}`;
      }
    }
    return line;
  });

  for (const [key, val] of Object.entries(entries)) {
    if (!existingKeys.has(key)) {
      updatedLines.push(`${key}=${val}`);
    }
  }

  fs.writeFileSync(envPath, updatedLines.filter((l) => l !== undefined).join('\n').trim() + '\n', 'utf8');
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
`;

  fs.writeFileSync(runArthurJsPath, runArthurBridge, 'utf8');
}

async function handleInit() {
  console.log('\n======================================================');
  console.log('🛡️  Welcome to Arthur — AI Agent Human Approval Layer');
  console.log('======================================================\n');
  console.log('Let’s connect your phone via Telegram in under 60 seconds!\n');

  let botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.log('1. Open Telegram on your phone and search for @BotFather');
    console.log('2. Send /newbot and give your bot a name');
    console.log('3. Copy the HTTP API token it gives you\n');
    botToken = await ask('🔑 Paste your Telegram Bot Token: ');
  }

  if (!botToken) {
    console.error('❌ Bot token is required. Setup cancelled.');
    process.exit(1);
  }

  const client = new TelegramClient(botToken);
  let botUser: any;
  try {
    botUser = await client.getMe();
    console.log(`\n✅ Verified! Connected to bot: @${botUser.username} (${botUser.first_name})`);
  } catch (err: any) {
    console.error(`\n❌ Failed to verify bot token: ${err.message}`);
    process.exit(1);
  }

  let chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) {
    console.log('\n📱 Auto-detecting your Chat ID:');
    console.log(`👉 Open Telegram on your phone, find @${botUser.username}, and click Start (or send /start)\n`);
    console.log('⏳ Listening for your message...');

    let detectedId: string | null = null;
    let detectedName = '';
    const startTime = Date.now();

    while (Date.now() - startTime < 45000 && !detectedId) {
      try {
        const updates = await client.getUpdates(0, 5);
        for (const update of updates) {
          if (update.message?.chat?.id) {
            detectedId = String(update.message.chat.id);
            detectedName = update.message.from?.first_name || 'Operator';
            break;
          }
        }
      } catch {
        // Retry
      }
      if (!detectedId) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    if (detectedId) {
      chatId = detectedId;
      console.log(`✅ Success! Detected user: ${detectedName} (Chat ID: ${chatId})`);
    } else {
      console.log('\n⚠️  Could not auto-detect message in 45s.');
      chatId = await ask('👉 Enter your Chat ID manually (from @userinfobot): ');
    }
  }

  if (!chatId) {
    console.error('❌ Chat ID is required. Setup cancelled.');
    process.exit(1);
  }

  // Save config to .env
  writeEnv({
    PORT: '4000',
    TELEGRAM_BOT_TOKEN: botToken,
    TELEGRAM_CHAT_ID: chatId,
  });

  // Install hooks
  installAntigravityHooks();

  // Send celebration message to phone
  try {
    await client.sendMessage(
      chatId,
      `🎉 <b>Arthur is ready on your phone!</b>\n\n🛡️ Safe inspection commands (like <code>git status</code>, <code>ls</code>) will be auto-allowed.\n⚠️ Risky actions (code edits, deletions, git pushes) will arrive here for 1-tap approval!`,
      { parse_mode: 'HTML' }
    );
  } catch (err: any) {
    console.warn(`Could not send welcome message: ${err.message}`);
  }

  console.log('\n======================================================');
  console.log('✅ ARTHUR IS FULLY CONFIGURED & ACTIVE!');
  console.log('======================================================');
  console.log('• Telegram Bot:  Active');
  console.log('• Workspace Hooks: Installed in .agents/hooks.json');
  console.log('• Smart Policy:  Safe commands auto-approved, risky commands alert phone');
  console.log('• Background:    Auto-spawns on demand (no terminal needed)');
  console.log('\nYou are all set! Run your AI agent normally.');
}

async function handleTest() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error('❌ Telegram is not configured in .env. Run "npx arthur init" first.');
    process.exit(1);
  }

  const client = new TelegramClient(token);
  console.log('Sending test approval card to Telegram...');
  try {
    await client.sendMessage(
      chatId,
      `🛡️ <b>Arthur Test Notification</b>\n\n⚡ <b>Tool:</b> <code>run_command</code>\n📋 <b>Action:</b> Test command execution\n⚠️ <b>Risk:</b> 🟡 <b>MEDIUM RISK</b>\n\n<i>👉 Click an option below to test buttons:</i>`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Approve ✅', callback_data: 'test:approved' },
              { text: 'Reject ❌', callback_data: 'test:rejected' },
            ],
          ],
        },
      }
    );
    console.log('✅ Test notification sent! Check your Telegram app.');
  } catch (err: any) {
    console.error(`❌ Failed: ${err.message}`);
  }
}

async function main() {
  const command = process.argv[2] || 'init';

  if (command === 'init' || command === 'setup') {
    await handleInit();
  } else if (command === 'test') {
    await handleTest();
  } else if (command === 'install-hooks') {
    installAntigravityHooks();
    console.log('✅ Arthur hooks installed in .agents/hooks.json');
  } else {
    console.log('Usage: arthur [init | test | install-hooks]');
  }
}

main();

