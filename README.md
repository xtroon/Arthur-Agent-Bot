# Arthur 🛡️

[![npm version](https://img.shields.io/npm/v/arthur-agent-bot.svg?style=flat-square&color=blue)](https://www.npmjs.com/package/arthur-agent-bot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Telegram](https://img.shields.io/badge/Telegram-OurArthurBot-blue.svg?style=flat-square&logo=telegram)](https://t.me/OurArthurBot)

> **Universal Human-in-the-Loop Approval Layer for AI Coding Agents**  
> *Zero-effort mobile approvals via Telegram • Smart Policy Firewall • Auto-Daemon*

Arthur is an agent-agnostic gateway that gives you full oversight and control over your autonomous coding agents (Google Antigravity, Claude Code, Cursor, etc.) directly from your phone—with **zero bot setup, zero public URLs, and zero manual server management**.

---

## 🌟 Why Arthur?

| Feature | Official Tools (Claude / AGY Remotes) | Arthur |
| :--- | :--- | :--- |
| **Agent Support** | Vendor-locked to a single CLI | **Universal** (Antigravity, Claude Code, Cursor) |
| **Bot Setup** | Complicated developer portals | **1-Click Magic Link** via [@OurArthurBot](https://t.me/OurArthurBot) |
| **Approval Surface** | Raw terminal prompts | **100% Phone Push Notifications** |
| **Noise Fatigue** | Prompts for *everything* | **Smart Policy Engine** (Auto-allows safe read commands) |
| **Agent Steering** | Binary Yes / No only | **Two-Way Steering** (Reply in Telegram to guide agent) |
| **Network Setup** | Requires tunnels, ports, or webhooks | **Zero Config** (Telegram Long-Polling & Cloudflare Relay) |
| **Server Running** | Must manually run `npm start` | **Auto-Daemon** (Silently spawns on demand) |

---

## 🚀 Quick Start (Under 30 Seconds)

### 1. Install Arthur into your project:
```bash
npx arthur-agent-bot install-hooks
```
*(This sets up `.agents/hooks.json` in your repository).*

### 2. Work Normally with Your AI Agent
Ask Antigravity, Claude Code, or your preferred agent to work:
> *"Refactor the database models and install dependencies"*

* **Harmless inspections** (`git status`, `ls`, `cat`, etc.) are **auto-approved in milliseconds** without buzzing your phone.
* **On the first risky action** (file writes, package installs, git pushes), Arthur prints a 1-click magic link:
  ```
  ------------------------------------------------------------
  🛡️  [Arthur] Phone Not Paired Yet
  📱  Click to pair your phone in 1-tap:
  👉  https://t.me/OurArthurBot?start=ART-9182
  ------------------------------------------------------------
  ```
1. Tap the link on your phone.
2. Tap **Start** in [@OurArthurBot](https://t.me/OurArthurBot).
3. **Paired forever!** Stored globally in `~/.arthur/config.json` across all projects on your machine.

---

## ⚡ Smart Policy Firewall

Arthur eliminates notification fatigue by differentiating between harmless inspections and dangerous mutations:

### 🟢 Auto-Approved Instantly (Zero Phone Buzz)
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

## 📱 Mobile Approvals & Two-Way Steering

When an agent plans an important action, your phone vibrates with an interactive card:

```
🛡️ Arthur Agent Approval

🤖 Agent: Antigravity
⚡ Tool: run_command
📋 Action: 📦 Installing packages: npm install express
⚠️ Risk: 🟡 MEDIUM RISK

[ Approve ✅ ]    [ Reject ❌ ]
```

### 1. One-Tap Decision
* Tap **Approve ✅**: The tool execution unblocks instantly on your computer.
* Tap **Reject ❌**: The tool execution is cancelled with a policy rejection notice.

### 2. Two-Way Steering (Natural Language Guidance)
Instead of clicking Reject, **simply reply to the Telegram notification with text**:
> *"No, don't use express, use fastify instead"*

Arthur captures your reply, cancels the command, and returns your exact feedback into the AI agent's prompt. The agent reads your reasoning and self-corrects without you ever touching your keyboard!

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
│   └── Relay Client        (Connects to Official Relay)      │
└────────────────────────────▲────────────────────────────────┘
                             │ Outbound Connection
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              Arthur Official Relay (Cloudflare)             │
│         https://arthur-relay.arthur-relay.workers.dev       │
│                                                             │
│   • Manages session pairing PINs (ART-XXXX)                 │
│   • Single central webhook for @OurArthurBot                │
└────────────────────────────▲────────────────────────────────┘
                             │ Telegram Webhook
                             ▼
                 ┌───────────────────────┐
                 │    @OurArthurBot      │
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
```

---

## 📄 License
MIT © [xtroon](https://github.com/xtroon)
