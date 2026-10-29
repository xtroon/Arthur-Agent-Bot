# arthur-agent-bot

[![npm version](https://img.shields.io/npm/v/arthur-agent-bot.svg?style=flat-square)](https://www.npmjs.com/package/arthur-agent-bot)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg?style=flat-square)](https://nodejs.org)

Zero-latency, human-in-the-loop gating and remote steering layer for autonomous AI coding agents.

---

## Overview

Autonomous coding agents (Google Antigravity, Claude Code, Cursor) operate in high-privilege execution loops. Existing runtime controls force a tradeoff: either prompt fatigue from confirming trivial inspections, or full unmonitored execution.

Arthur sits directly at the process boundary via native lifecycle hooks. It inspects scheduled tool calls, deterministically auto-approves harmless read operations in sub-millisecond time, and routes risky mutations to your mobile device over Telegram with single-tap authorization and natural language redirection.

### Key Capabilities

* **Deterministic Risk Classification**: Read-only operations (`git status`, `ls`, `grep`) execute with zero latency. File modifications, deletions, environment access, and network operations are held synchronously.
* **Out-of-Band Mobile Verification**: Approvals are delivered directly to Telegram using long-polling or an edge relay. No open ports, tunnels (ngrok), or static IPs required.
* **Bidirectional Steering**: Operators can approve, deny, or reply with natural language instructions in Telegram. Rejection feedback is injected directly into the agent's context for immediate self-correction.
* **Auto-Daemon Process Management**: The background authorization server starts automatically on demand. No persistent terminal process required.
* **Cross-Agent Hook Interception**: Native integration with Antigravity (`hooks.json`) and extensible adapter architecture for Claude Code and subshell wrappers.

---

## Architecture

```
+-------------------------------------------------------------------------+
|                        Autonomous Coding Agent                          |
|             (Google Antigravity CLI, Claude Code, Subshell)             |
|                                                                         |
|  Agent proposes tool call (e.g. run_command, write_file, edit_file)    |
|                                |                                        |
|                                v                                        |
|                     Lifecycle Hook Definition                           |
|                      (.agents/hooks.json)                               |
+--------------------------------+----------------------------------------+
                                 | (Pipes payload via stdin)
                                 v
+-------------------------------------------------------------------------+
|                        Arthur Hook Runner                               |
|                     (dist/cli/hook-runner.js)                           |
|                                                                         |
|  1. Auto-spawns local background daemon if offline                      |
|  2. Sends payload to Arthur Core API (POST /api/agent/:name/pre-tool)   |
+--------------------------------+----------------------------------------+
                                 | HTTP (Localhost:4000)
                                 v
+-------------------------------------------------------------------------+
|                        Arthur Core Engine                               |
|                                                                         |
|  +------------------------+  +---------------------------------------+  |
|  |     Policy Engine      |  |            Request Manager            |  |
|  | Evaluates command risk |  |  Holds process loop with async state  |  |
|  +-----------+------------+  +-------------------+-------------------+  |
|              |                                   |                      |
|      Safe / Read-Only                    Risky Mutation                 |
|              |                                   |                      |
|              v                                   v                      |
|      [Auto-Allow: 0.1ms]             Route to Notification Service      |
+--------------------------------------------------+----------------------+
                                                   |
                         +-------------------------+-------------------------+
                         |                                                   |
                         v (Direct Polling)                                  v (Hosted Edge Relay)
             +-----------------------+                           +-----------------------+
             |    Telegram Client    |                           | Cloudflare Edge Relay |
             |  (Node fetch runtime) |                           |  (Serverless Webhook) |
             +-----------+-----------+                           +-----------+-----------+
                         |                                                   |
                         +-------------------------+-------------------------+
                                                   |
                                                   v
                                        +---------------------+
                                        |    Mobile Device    |
                                        |      (Telegram)     |
                                        |  [Approve] [Reject] |
                                        |  (Or Reply to Steer)|
                                        +---------------------+
```

---

## Project Structure

```
.
|-- .agents/
|   |-- hooks.json               # Workspace lifecycle hook declaration
|   `-- run-arthur.js            # Standalone hook bridge runner
|-- relay/
|   `-- worker.ts                # Cloudflare Worker relay for centralized webhooks
|-- src/
|   |-- adapters/                # Agent-specific input/output translation
|   |   |-- adapter.interface.ts # Base adapter contract
|   |   |-- antigravity.adapter.ts# Google Antigravity hook implementation
|   |   |-- claude-code.adapter.ts# Claude Code adapter
|   |   `-- index.ts             # Adapter registry
|   |-- cli/                     # Command-line interfaces and daemon runners
|   |   |-- arthur-cli.ts        # Setup, pairing, and status CLI
|   |   |-- daemon.ts            # Detached process supervisor
|   |   `-- hook-runner.ts       # Synchronous hook stdin/stdout handler
|   |-- core/                    # State management and domain models
|   |   |-- config.ts            # Machine-wide global configuration (~/.arthur)
|   |   |-- request-manager.ts   # Pending request queue and promise registry
|   |   `-- types.ts             # Core interfaces and payloads
|   |-- policy/                  # Policy enforcement
|   |   `-- policy-engine.ts     # Regex risk analyzer and classification engine
|   |-- relay/                   # Client-side relay communication
|   |   |-- relay-client.ts      # Cloud relay bridge
|   |   `-- worker.ts            # Exported serverless relay logic
|   |-- server/                  # HTTP daemon
|   |   |-- app.ts               # Express router and pre-tool handler
|   |   `-- index.ts             # Server entrypoint and lifecycle events
|   `-- telegram/                # Direct Telegram bot integration
|       |-- telegram-client.ts   # Zero-dependency Telegram HTTP client
|       |-- telegram-service.ts  # Polling, callback handling, and steering
|       `-- types.ts             # Telegram Bot API interfaces
|-- test/
|   |-- e2e-hook.test.ts         # Process-level hook execution test suite
|   |-- live-agy-integration.test.ts # Antigravity CLI binary integration tests
|   |-- policy.test.ts           # Risk classification unit tests
|   `-- unit.test.ts             # Core component tests
|-- package.json
|-- tsconfig.json
`-- wrangler.toml                # Cloudflare Worker deployment configuration
```

---

## Policy Engine Specification

Every tool invocation is evaluated against deterministic heuristics before human escalation:

### 1. Auto-Approved Operations (Zero Latency)

Operations that do not modify state or expose sensitive files bypass human gating:

| Category | Command Patterns |
| :--- | :--- |
| **Git Read** | `git status`, `git diff`, `git log`, `git branch`, `git remote -v`, `git show`, `git tag`, `git rev-parse`, `git ls-files` |
| **Filesystem Read** | `ls`, `dir`, `pwd`, `cd`, `cat`, `head`, `tail`, `more`, `less`, `type`, `Get-Content` |
| **Text Search** | `grep`, `findstr`, `awk`, `wc` |
| **Environment Check** | `node -v`, `npm --version`, `python --version`, `tsc -v`, `which`, `where`, `whoami`, `echo` |

### 2. Gated Operations (Escalated to Telegram / Terminal)

State-mutating operations hold the agent process and require explicit human consent:

| Category | Examples | Risk Level |
| :--- | :--- | :--- |
| **File Deletion** | `rm`, `del`, `rmdir`, `rimraf`, `Remove-Item` | High |
| **Remote Git Changes** | `git push`, `git reset --hard`, `git clean -f`, `git rebase` | High |
| **Secrets & Keys** | Access to `.env`, `id_rsa`, `id_ed25519`, `credentials`, `secrets` | High |
| **Destructive SQL** | `DROP TABLE`, `TRUNCATE`, `DROP DATABASE` | High |
| **Process Control** | `kill`, `pkill`, `taskkill` | High |
| **Code Modification** | `write_file`, `edit_file` tools | Medium |
| **Package Management** | `npm install`, `yarn add`, `pnpm add`, `pip install` | Medium |
| **Build & Test** | `npm run build`, `tsc`, `pytest` | Medium |

---

## Installation and Setup

### Method 1: Project Installation (Recommended)

Run inside any repository (JavaScript, Python, Rust, Go, or general codebase):

```bash
npx arthur-agent-bot install-hooks
```

This writes `.agents/hooks.json` and `.agents/run-arthur.js` into your working directory.

### Method 2: Global Installation

```bash
npm install -g arthur-agent-bot
```

Allows invoking `arthur` directly from any directory:

```bash
arthur install-hooks
arthur pair
arthur status
```

---

## Pairing and Connectivity

Arthur supports two operational modes:

### Mode A: Hosted Relay Pairing (Zero Bot Setup)

Users pair with an official bot instance via deep link without accessing BotFather:

1. On the first risky operation (or by running `arthur pair`), Arthur outputs a pairing link:
   ```text
   [Arthur] Approval Required: write_file src/auth.ts
   Click to pair phone: https://t.me/YourBotName?start=ART-1234
   ```
2. Open the link on mobile and select **Start**.
3. The device session is persisted globally in `~/.arthur/config.json`. Subsequent operations across any repository route to that device.

### Mode B: Direct Telegram Bot (Self-Hosted)

For isolated or enterprise environments requiring direct bot ownership:

1. Create a bot using [@BotFather](https://t.me/BotFather) and retrieve the API token.
2. Retrieve your Telegram numeric chat ID (via `@userinfobot`).
3. Define credentials in `.env`:
   ```env
   PORT=4000
   TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
   TELEGRAM_CHAT_ID=987654321
   ```
4. Start the server:
   ```bash
   npm start
   ```

---

## Agent Integration

### Google Antigravity CLI (`agy`)

Antigravity natively detects `.agents/hooks.json`. No additional configuration is required:

```bash
agy "Refactor database migrations and install dependencies"
```

* If Telegram is connected: Approval card is sent to mobile with inline buttons.
* If Telegram is disconnected: Arthur returns `force_ask`, prompting directly in the terminal:
  ```text
  ? Allow Antigravity to run: write_file migrations/001.sql [y/N]
  ```

### Claude Code

Wrap execution inside Arthur's session monitor:

```bash
npx arthur-agent-bot wrap claude
```

### Generic CLI Agents (Aider, OpenCode)

Execute tools under the subshell interceptor:

```bash
npx arthur-agent-bot wrap opencode
npx arthur-agent-bot wrap aider
```

---

## Verification

Arthur includes comprehensive unit, policy, and process-level integration suites:

```bash
# Execute unit tests and policy classifier tests
npm test

# Run process-level hook pipeline tests (child process stdin/stdout, timeouts, denials)
npx tsx test/e2e-hook.test.ts

# Run integration tests against real agy CLI binary
npx tsx test/live-agy-integration.test.ts
```

---

## Configuration Reference

### Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | Local approval server port | `4000` |
| `HOST` | Local server bind address | `127.0.0.1` |
| `TELEGRAM_BOT_TOKEN` | Custom Telegram Bot API token | None |
| `TELEGRAM_CHAT_ID` | Authorized Telegram recipient chat ID | None |
| `ARTHUR_RELAY_URL` | Upstream edge relay endpoint | `https://arthur-relay.arthur-relay.workers.dev` |
| `ARTHUR_TIMEOUT_SEC` | Hook timeout in seconds before auto-deny | `180` |
| `ARTHUR_FALLBACK` | Action on server timeout/failure (`allow` or `deny`) | `deny` |

### Global State (`~/.arthur/config.json`)

```json
{
  "relayUrl": "https://arthur-relay.arthur-relay.workers.dev",
  "autoApproveSafe": true,
  "pairedSessionId": "sess_abcdef1234",
  "pairingCode": "ART-1234"
}
```

---

## License

MIT (c) [xtroon](https://github.com/xtroon)
