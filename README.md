# Milo: Human Approval Layer for AI Agents

> **Minimal MVP** starting with Google Antigravity CLI (`agy`) + Slack Bot Integration.

Milo is a lightweight, human-in-the-loop approval layer for AI coding agents. When an AI agent attempts to run sensitive actions (shell commands, file modifications, etc.), Milo intercepts the action before execution, holds the agent loop, presents the proposed operation on a **local web dashboard** and **Slack channel**, and lets a human operator **Approve** or **Reject** it in real time from either platform.

---

## 1. Antigravity CLI Hook Capabilities & Findings

Based on an inspection of the official Antigravity customization specification (`agy-customizations/docs/hooks.md`):

### Supported Hook Events
Antigravity supports 6 lifecycle events:
1. **`PreToolUse`**: Fires immediately before a tool call executes. This is the **primary gating point** for approvals. Handlers receive the tool call and arguments via `stdin` and return an authorization decision (`allow`, `deny`, `ask`, `force_ask`) via `stdout`.
2. **`PostToolUse`**: Fires after a tool completes; receives execution status and errors.
3. **`SessionStart`**: Fires once when a new conversation session initializes.
4. **`PreInvocation`**: Runs before the model is invoked; allows injecting transient system or ephemeral context.
5. **`PostInvocation`**: Runs after model output; can trigger loop continuation or forced termination.
6. **`Stop`**: Fires when execution terminates; can override termination.

### Configuration Format
Hooks are declared in a `hooks.json` file inside a customization root directory (e.g., `.agents/hooks.json` in your workspace):

```json
{
  "milo-approver": {
    "enabled": true,
    "PreToolUse": [
      {
        "matcher": "run_command|write_file|edit_file",
        "hooks": [
          {
            "type": "command",
            "command": "node run-milo.js",
            "timeout": 180
          }
        ]
      }
    ]
  }
}
```

### Can Hooks Block or Pause Execution?
- **Synchronous Blocking is Fully Supported**: Antigravity hooks are executed as external shell commands (`type: "command"`). The CLI pipes JSON into the hook command's `stdin` and **synchronously waits** for the hook process to exit with its JSON verdict on `stdout`. This natural blocking mechanism allows Milo to pause the agent while awaiting human operator input.
- **Limitation — No Native Asynchronous Webhook Pause/Resume**: Antigravity CLI currently does not support async background resumption (e.g. suspending a session to disk and resuming hours later via an external REST webhook).
- **Milo's Safe Architecture**:
  1. The hook script (`hook-runner.js`) acts as a synchronous bridge, keeping the process open and holding the agent loop while waiting for human decision on the local server or Slack.
  2. Each hook has a configured `timeout` (e.g., 60–180 seconds).
  3. If the operator does not decide within the window or if the Milo server is offline, the hook **fails safe** by returning `{ "decision": "deny", "reason": "..." }`, guaranteeing that unapproved actions never execute silently.

---

## 2. Architecture: Web + Slack Hybrid Approval

Milo is built with strict isolation between the core approval domain, agent-specific adapters, and notification surfaces:

```
┌─────────────────────────────────────────────────────────────┐
│                    Antigravity CLI (agy)                    │
│                                                             │
│   Agent plans tool call (e.g., run_command, edit_file)      │
│                            │                                │
│                            ▼                                │
│              PreToolUse hook (.agents/hooks.json)           │
└────────────────────────────┬────────────────────────────────┘
                             │ (Pipes tool payload to stdin)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│             Milo Hook Bridge (run-milo.js / hook-runner.js) │
│                                                             │
│   1. Reads toolCall & context from stdin                    │
│   2. POST /api/agent/antigravity/pre-tool                   │
│   3. Synchronously waits for operator resolution            │
│   4. Emits {"decision":"allow"} or {"decision":"deny"}      │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTP (Port 4000)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                 Milo Node.js + TypeScript Server            │
│                                                             │
│   ├── src/core/           (Generic Request & Wait Engine)   │
│   ├── src/adapters/       (AgentAdapter Interface)          │
│   ├── src/slack/          (Slack Bot, Block Kit & Webhooks) │
│   │   ├── types.ts                                          │
│   │   ├── signature.ts    (HMAC SHA-256 Request Verifier)   │
│   │   ├── block-builder.ts (Block Kit Message Generator)    │
│   │   ├── slack-client.ts (Official Web API Client)         │
│   │   └── slack-service.ts(Interactive Action Handler)      │
│   ├── src/server/app.ts   (REST API + Web Dashboard + Slack)│
│   └── src/web/public/     (Web UI: Real-Time SSE Dashboard) │
└────────────────────────────▲────────────────────────────────┘
                             │
            ┌────────────────┴────────────────┐
            │                                 │
     Real-Time (SSE / Web UI)        Slack Web API & Webhook
            ▼                                 ▼
┌───────────────────────┐         ┌─────────────────────────┐
│     Human Operator    │         │       Human Operator    │
│ http://localhost:4000 │         │   Slack Channel/Mobile  │
│ [Approve]   [Reject]  │         │  [Approve ✔️] [Reject ✖️]│
└───────────────────────┘         └─────────────────────────┘
```

### Bi-Directional Synchronization
- When a request is triggered, it appears **simultaneously** on the Web Dashboard and in your Slack channel.
- If you click **Approve** on Slack:
  - The agent loop unblocks immediately and executes the tool.
  - The Slack message updates to: `✅ APPROVED by @username`.
  - The Web Dashboard updates to `APPROVED` via real-time SSE.
- If you click **Approve** on the Web Dashboard:
  - The agent loop unblocks immediately.
  - The Slack message updates to: `✅ APPROVED by operator`.
  - The Web Dashboard updates to `APPROVED`.
- Duplicate clicks and expired requests are safely rejected.

---

## 3. Slack Integration Setup

The Slack integration supports both **Socket Mode** (recommended: zero tunnels or public URLs needed) and traditional HTTP webhooks. If Slack is not configured, the web approval dashboard continues working normally.

### Option A: Socket Mode (Recommended — No ngrok or public URLs!)
1. Go to your app in [https://api.slack.com/apps](https://api.slack.com/apps).
2. Under **Socket Mode** (left sidebar):
   - Toggle **Enable Socket Mode** to `ON`.
3. Under **Basic Information**:
   - Scroll to **App-Level Tokens** and click **Generate Token and Scopes**.
   - Add scope: `connections:write` and copy the token (`xapp-...`).
4. Under **OAuth & Permissions**:
   - Add Bot Token Scope: `chat:write`.
   - Click **Install to Workspace** and copy the **Bot User OAuth Token** (`xoxb-...`).
5. Invite your bot to your Slack channel:
   `/invite @YourBotName` and copy the Channel ID.
6. Configure `.env`:
   ```env
   PORT=4000
   SLACK_ENABLED=true
   SLACK_BOT_TOKEN=xoxb-your-bot-token
   SLACK_APP_TOKEN=xapp-your-app-level-token
   SLACK_CHANNEL_ID=C0123456789
   ```
   *Notice: In Socket Mode, you do not need to configure any Request URL in Slack. All interactions are delivered over an outbound WebSocket (`wss://wss-primary.slack.com`).*

---

### Option B: HTTP Webhooks (Using ngrok or public domain)
1. Under **Interactivity & Shortcuts**:
   - Toggle **Interactivity** to `ON`.
   - Set **Request URL** to `https://<your-public-url>/api/slack/interactions`.
2. Configure `.env`:
   ```env
   PORT=4000
   SLACK_ENABLED=true
   SLACK_BOT_TOKEN=xoxb-your-bot-token
   SLACK_SIGNING_SECRET=your-signing-secret
   SLACK_CHANNEL_ID=C0123456789
   ```

---

## 4. Setup & Quick Start

### Prerequisites
- Node.js (v18+; tested on Node.js v26)
- Google Antigravity CLI (`agy`) installed and available on PATH

### 1. Install & Build
```bash
# Clone / navigate to project directory
cd "agent talk"

# Install dependencies
npm install

# Compile TypeScript
npm run build
```

### 2. Start the Milo Approval Server
```bash
# Production start (compiled)
npm start

# Or development mode with hot reload
npm run dev
```
The server will start listening at:
- **Web Dashboard**: `http://localhost:4000/`
- **Slack Interactions Endpoint**: `POST http://localhost:4000/api/slack/interactions`
- **Health Check**: `http://localhost:4000/health`
- **API**: `http://localhost:4000/api/requests`

---

## 5. Verification & Testing

Milo includes a comprehensive automated test suite covering unit tests, mocked child process flows, Slack integration, and real integration against the live `agy.exe` binary.

### Run All Tests
```bash
npm run test:all
```

### Individual Test Suites
- **Unit Tests** (Adapters & Request Manager):
  ```bash
  npx tsx test/unit.test.ts
  ```
- **End-to-End Hook Flow Tests** (Child process stdin/stdout, approval, rejection, offline fail-safe):
  ```bash
  npx tsx test/e2e-hook.test.ts
  ```
- **Slack Integration Tests** (HMAC SHA-256 signature verification, Block Kit builder, live button click execution, duplicate prevention, and web synchronization):
  ```bash
  npx tsx test/slack.test.ts
  ```
- **Real `agy.exe` Live Integration Test** (Live CLI binary intercepted by Milo):
  ```bash
  npx tsx test/live-agy-integration.test.ts
  ```
