import fs from 'fs';
import path from 'path';

// 1. Read .env file
const envPath = path.resolve(process.cwd(), '.env');
const env: Record<string, string> = {};

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
    }
  }
}

const botToken = env.SLACK_BOT_TOKEN || process.env.SLACK_BOT_TOKEN || '';
const appToken = env.SLACK_APP_TOKEN || process.env.SLACK_APP_TOKEN || '';
const channelId = env.SLACK_CHANNEL_ID || process.env.SLACK_CHANNEL_ID || '';
const signingSecret = env.SLACK_SIGNING_SECRET || process.env.SLACK_SIGNING_SECRET || '';

function maskToken(token: string, prefixLen: number = 6): string {
  if (!token) return '(EMPTY / NOT CONFIGURED)';
  if (token.length <= prefixLen + 4) return '***';
  return `${token.slice(0, prefixLen)}...${token.slice(-4)} (Length: ${token.length})`;
}

console.log('====================================================');
console.log('       MILO SLACK SOCKET MODE DIAGNOSTIC TOOL       ');
console.log('====================================================\n');

console.log('[Step 1] Verifying Environment Variables (Secrets Masked):');
console.log(`  - SLACK_BOT_TOKEN:     ${maskToken(botToken, 9)}`);
console.log(`  - SLACK_APP_TOKEN:     ${maskToken(appToken, 10)}`);
console.log(`  - SLACK_CHANNEL_ID:    ${channelId || '(EMPTY)'}`);
console.log(`  - SLACK_SIGNING_SECRET:${maskToken(signingSecret, 4)}`);

let hasConfigError = false;
if (!botToken.startsWith('xoxb-')) {
  console.error('  ❌ ERROR: SLACK_BOT_TOKEN does not start with "xoxb-".');
  hasConfigError = true;
}
if (!appToken.startsWith('xapp-')) {
  console.error('  ❌ ERROR: SLACK_APP_TOKEN does not start with "xapp-".');
  hasConfigError = true;
}
if (!channelId.startsWith('C')) {
  console.error('  ❌ ERROR: SLACK_CHANNEL_ID does not start with "C".');
  hasConfigError = true;
}
if (!hasConfigError) {
  console.log('  ✔ All token formats and channel ID prefix look valid!\n');
}

async function runFullDiagnostics() {
  // -------------------------------------------------------------
  // Test 1: auth.test (Bot Identity & Workspace)
  // -------------------------------------------------------------
  console.log('[Step 2] Testing Bot Identity & Workspace (auth.test)...');
  let botUserId = '';
  try {
    const res = await fetch('https://slack.com/api/auth.test', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${botToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
    });
    const data: any = await res.json();
    if (data.ok) {
      botUserId = data.user_id;
      console.log(`  ✔ Bot Authenticated: ${data.user} (User ID: ${data.user_id})`);
      console.log(`  ✔ Workspace: ${data.team} (Team ID: ${data.team_id})`);
    } else {
      console.error(`  ❌ auth.test failed: ${data.error}`);
      return;
    }
  } catch (err: any) {
    console.error(`  ❌ auth.test network error: ${err.message}`);
    return;
  }

  // -------------------------------------------------------------
  // Test 2: conversations.info (Channel Verification & Membership)
  // -------------------------------------------------------------
  console.log(`\n[Step 3] Checking Channel ${channelId} and Bot Membership...`);
  try {
    const res = await fetch(`https://slack.com/api/conversations.info?channel=${channelId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${botToken}`,
      },
    });
    const data: any = await res.json();
    if (data.ok) {
      const channel = data.channel;
      console.log(`  ✔ Found Channel: #${channel.name}`);
      console.log(`  ✔ Private Channel: ${channel.is_private ? 'YES (Private)' : 'NO (Public)'}`);
      console.log(`  ✔ Bot is Member: ${channel.is_member ? 'YES (Joined)' : 'NO ❌ (Bot has not been invited!)'}`);

      if (!channel.is_member) {
        console.error(`\n  ⚠️ ACTION REQUIRED: Bot @agent talks is NOT in #${channel.name}!`);
        console.error(`  In Slack, open #${channel.name} and type: /invite @agent talks`);
      }
    } else {
      console.error(`  ❌ conversations.info failed: ${data.error}`);
      if (data.error === 'channel_not_found') {
        console.error('     Explanation: The channel ID is either wrong, or the bot is not invited to this private channel.');
      }
    }
  } catch (err: any) {
    console.error(`  ❌ conversations.info error: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Test 3: apps.connections.open (Socket Mode Gateway)
  // -------------------------------------------------------------
  console.log('\n[Step 4] Testing Socket Mode Connection Gateway (apps.connections.open)...');
  try {
    const res = await fetch('https://slack.com/api/apps.connections.open', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${appToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    const data: any = await res.json();
    if (data.ok && data.url) {
      console.log('  ✔ Socket Mode Gateway Available!');
      console.log(`  ✔ WSS URL: ${data.url.slice(0, 35)}...`);
    } else {
      console.error(`  ❌ apps.connections.open failed: ${data.error}`);
      if (data.error === 'invalid_auth') {
        console.error('     Explanation: SLACK_APP_TOKEN is invalid or missing scope "connections:write".');
      }
    }
  } catch (err: any) {
    console.error(`  ❌ apps.connections.open network error: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Test 4: chat.postMessage (Send Live Interactive Test Message)
  // -------------------------------------------------------------
  console.log(`\n[Step 5] Sending Interactive Test Approval Message to #${channelId}...`);
  try {
    const testBlocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🛡️ Milo Live Integration Test',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Agent:* \`antigravity\`\n*Target:* \`git status\`\n*Status:* Testing live connectivity to Slack!`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Approve ✔️',
              emoji: true,
            },
            style: 'primary',
            action_id: 'milo_approve',
            value: 'test_diagnostic_request',
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Reject ✖️',
              emoji: true,
            },
            style: 'danger',
            action_id: 'milo_reject',
            value: 'test_diagnostic_request',
          },
        ],
      },
    ];

    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${botToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        channel: channelId,
        text: '🛡️ [Milo] Live Integration Test: git status',
        blocks: testBlocks,
      }),
    });

    const data: any = await res.json();
    if (data.ok) {
      console.log(`  ✅ SUCCESS! Message posted to Slack!`);
      console.log(`  ✔ Message Timestamp: ${data.ts}`);
      console.log(`  ✔ Channel: ${data.channel}`);
      console.log('\n👉 PLEASE CHECK SLACK: The interactive test message should now be visible in your channel!');
    } else {
      console.error(`  ❌ chat.postMessage failed: ${data.error}`);
      if (data.error === 'not_in_channel') {
        console.error('     Explanation: The bot is NOT a member of this channel.');
        console.error('     Fix: In Slack, open the channel and type: /invite @agent talks');
      } else if (data.error === 'missing_scope') {
        console.error('     Explanation: Bot token lacks required OAuth scopes.');
        console.error(`     Needed: ${data.needed || 'chat:write'}`);
      }
    }
  } catch (err: any) {
    console.error(`  ❌ chat.postMessage network error: ${err.message}`);
  }

  console.log('\n====================================================');
  console.log('              DIAGNOSTIC RUN COMPLETE               ');
  console.log('====================================================');
}

runFullDiagnostics();
