# Arthur 🛡️

> **Universal Human-in-the-Loop Approval Layer for AI Coding Agents**  
> *Zero-effort mobile approvals via Telegram • Smart Policy Firewall • Auto-Daemon*

Arthur is a lightweight, agent-agnostic gateway that gives you full oversight of your autonomous coding agents (Google Antigravity, Claude Code, Cursor, etc.) directly from your phone—with **zero friction, zero public URLs, and zero manual server management**.

---

## 🌟 Why Arthur?

| Feature | Official Tools (Claude / AGY Remotes) | Arthur |
| :--- | :--- | :--- |
| **Agent Support** | Vendor-locked to a single CLI | **Universal** (Antigravity, Claude Code, Cursor) |
| **Approval Surface** | Terminal prompts or web dashboards | **100% Phone Push via Telegram** |
| **Network Setup** | Requires tunnels, ports, or webhooks | **Zero Config** (Telegram Long Polling works on 4G/Wi-Fi) |
| **Noise Fatigue** | Prompts for *everything* | **Smart Policy Engine** (Auto-allows safe read commands) |
| **Agent Steering** | Binary Yes / No only | **Two-Way Steering** (Reply in Telegram to guide agent) |
| **Server Running** | Must manually run `npm start` | **Auto-Daemon** (Silently spawns on demand) |

---

## 🚀 60-Second Quick Start

### 1. Create a Telegram Bot
1. Open Telegram on your phone and search for **[@BotFather](https://t.me/BotFather)**.
2. Send `/newbot`, choose a name and username.
3. Copy the HTTP API token provided by BotFather.

### 2. Run Arthur Setup
From your project directory:
```bash
npx arthur init
```
1. Paste your bot token when prompted.
2. Open your new bot in Telegram and tap **Start** (or send `/start`).
3. Arthur will auto-detect your chat ID, save your `.env`, and install the workspace hooks automatically!

---

## ⚡ Smart Policy Firewall

Arthur eliminates prompt fatigue by differentiating between harmless inspections and dangerous mutations:

### 🟢 Auto-Approved Instantly (No Phone Buzz)
* **Git Inspections**: `git status`, `git diff`, `git log`, `git branch`, `git remote -v`, `git show`
* **Filesystem Reads**: `ls`, `dir`, `pwd`, `cd`, `cat`, `head`, `tail`, `grep`, `findstr`
* **Environment Checks**: `node -v`, `npm --version`, `python --version`, `which`, `where`, `whoami`

### 🔴 Escalated to Telegram for 1-Tap Approval
* **File Modifications**: Any `edit_file` or `write_file` operation
* **Destructive Deletions**: `rm`, `del`, `rmdir`, `rimraf`
* **Remote Git Operations**: `git push`, `git reset --hard`, `git clean -f`
* **Package Installs & Builds**: `npm install`, `yarn add`, `pip install`
* **Secrets & Credentials**: Access or modification to `.env`, `.pem`, `id_rsa`, passwords

---

## 📱 Interactive Telegram Approval Flow

When an agent plans an important action, Arthur sends an alert to your Telegram:

```
🛡️ Arthur Agent Approval

🤖 Agent: Antigravity
⚡ Tool: run_command
📋 Action: 📦 Installing packages: npm install express
⚠️ Risk: 🟡 MEDIUM RISK

[ Approve ✅ ]    [ Reject ❌ ]
```

### 1. One-Tap Decision
* Tap **Approve ✅**: The agent unblocks instantly on your computer. The message updates to `✅ APPROVED`.
* Tap **Reject ❌**: The tool execution is cancelled with a policy rejection notice.

### 2. Two-Way Steering (Natural Language Guidance)
Instead of clicking Reject, **simply reply to the Telegram message with text**:
> *"No, don't use express, use fastify instead"*

Arthur captures your reply, terminates the command, and returns your feedback directly into the AI agent's prompt. The agent reads your reasoning and self-corrects without you ever touching your keyboard!

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 AI Agent (Antigravity / Claude)             │
│                                                             │
│   Agent plans tool call (e.g., run_command, edit_file)      │
│                            │                                │
│                            ▼                                │
│               PreToolUse Hook (.agents/hooks.json)          │
└────────────────────────────┬────────────────────────────────┘
                             │ (Pipes payload to stdin)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                 Arthur Hook Runner (run-arthur.js)          │
│                                                             │
│   1. Auto-spawns background daemon if not already running   │
│   2. Evaluates Smart Policy Firewall                        │
│      ├── Safe read command? ──► [Auto-Allow (0.1ms)]        │
│      └── Risky action?      ──► Escalate to Arthur Engine   │
└────────────────────────────┬────────────────────────────────┘
                             │ Local HTTP (Port 4000)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                     Arthur Core Engine                      │
│                                                             │
│   ├── Policy Engine       (Risk evaluation & classification)│
│   ├── Request Manager     (Promise holding & resolution)    │
│   ├── Agent Adapters      (Antigravity, Claude Code, Cursor)│
│   └── Telegram Service    (Native Long-Polling Bot API)     │
└────────────────────────────▲────────────────────────────────┘
                             │ Outbound Long-Polling (No Tunnels)
                             ▼
                 ┌───────────────────────┐
                 │    Telegram Cloud     │
                 └───────────▲───────────┘
                             │ Push Notification
                             ▼
                 ┌───────────────────────┐
                 │   Your Phone / Watch  │
                 │ [Approve ✅] [Reject ❌]│
                 │   (Or Reply to Guide) │
                 └───────────────────────┘
```

---

## 🧪 Testing

Arthur comes with an automated test suite:

```bash
# Run unit & policy tests
npm test

# Run end-to-end hook process tests
npx tsx test/e2e-hook.test.ts

# Send a test approval card to your Telegram app
npx tsx src/cli/arthur-cli.ts test
```

---

## 📄 License
MIT
