# Milo: Human Approval Layer for AI Agents

> **Minimal MVP** starting with Google Antigravity CLI (`agy`).

Milo is a lightweight, human-in-the-loop approval layer for AI coding agents. When an AI agent attempts to run sensitive actions (shell commands, file modifications, etc.), Milo intercepts the action before execution, holds the agent loop, presents the proposed operation on a local web dashboard, and lets a human operator **Approve** or **Reject** it in real time.

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
            "timeout": 90
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
  1. The hook script (`hook-runner.js`) acts as a synchronous bridge, keeping the process open and holding the agent loop while waiting for human decision on the local server.
  2. Each hook has a configured `timeout` (e.g., 60–90 seconds).
  3. If the operator does not decide within the window or if the Milo server is offline, the hook **fails safe** by returning `{ "decision": "deny", "reason": "..." }`, guaranteeing that unapproved actions never execute silently.

---

## 2. Architecture & Adapter Isolation

Milo is built with strict isolation between the core approval domain and agent-specific integrations.

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
│   2. Calls Milo Server: POST /api/agent/antigravity/pre-tool│
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
│   │   ├── adapter.interface.ts                              │
│   │   ├── antigravity.adapter.ts                            │
│   │   └── index.ts        (Adapter Registry)                │
│   ├── src/server/         (Express REST API + SSE)          │
│   └── src/web/public/     (Clean Human Approval Dashboard)  │
└────────────────────────────▲────────────────────────────────┘
                             │
                             │ Real-Time (SSE / Web UI)
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                      Human Operator                         │
│             http://localhost:4000 (Web Dashboard)           │
│             [ ✔ Approve ]        [ ✖ Reject ]               │
└─────────────────────────────────────────────────────────────┘
```

### Supporting Other AI Agents
The `AgentAdapter` interface (`src/adapters/adapter.interface.ts`) decouples agent-specific payload formats:

```typescript
export interface AgentAdapter<TRawInput = any, TRawOutput = any> {
  readonly agentName: string;
  parseInput(rawInput: TRawInput): MiloRequestInput;
  formatResponse(decision: MiloDecision, originalInput?: TRawInput): TRawOutput;
}
```
To add support for another agent (e.g., Claude Code, Cursor, Copilot Workspace), simply implement `AgentAdapter` and register it with `adapterRegistry.register(new CustomAdapter())`.

---

## 3. Web Dashboard Features

Served at `http://localhost:4000`:
- **Real-Time Synchronized**: Uses Server-Sent Events (SSE) with fallback polling for instant notification without page refresh.
- **Action Details**: Displays agent badge, action type (`command`, `file_write`, `file_edit`), raw command or file path preview, and session context (conversation ID, step index).
- **Decision Controls**:
  - **Approve**: Resumes the agent loop with `allow`.
  - **Reject**: Aborts the tool call with `deny` and feeds back the operator's rejection explanation.
  - **Optional Reason Field**: Lets the operator provide context (e.g., *"Destructive command denied by policy"*).
- **History View**: Shows a log of recently resolved requests (approved, rejected, or timed out).

---

## 4. Setup & Quick Start

### Prerequisites
- Node.js (v18+ recommended; tested on Node.js v26)
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
- **Health Check**: `http://localhost:4000/health`
- **API**: `http://localhost:4000/api/requests`

### 3. Agent Hook Configuration
The project is already pre-configured with `.agents/hooks.json`:
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
            "timeout": 90
          }
        ]
      }
    ]
  }
}
```

### 4. Running Antigravity CLI
With the Milo server running, run any Antigravity session in this directory:
```bash
agy
```
Or run in print/headless mode:
```bash
agy --dangerously-skip-permissions --print "Run a command to check git status"
```
Whenever the agent attempts to run a matched tool:
1. Execution halts.
2. The request pops up on `http://localhost:4000`.
3. Click **Approve** or **Reject** to resume or stop the action!

---

## 5. Verification & Testing

Milo includes a comprehensive test suite covering unit tests, mocked E2E child process flows, and real integration against the live `agy.exe` binary.

### Unit Tests
Tests the `AntigravityAdapter` parsing/formatting and `RequestManager` lifecycle/timeouts:
```bash
npx tsx test/unit.test.ts
```

### End-to-End Hook Flow Tests
Tests child-process stdin/stdout communication, HTTP synchronization, approvals, rejections, and offline fail-safe handling:
```bash
npx tsx test/e2e-hook.test.ts
```

### Real `agy.exe` Live Integration Test
Tests the live `agy` CLI binary executing real actions intercepted by Milo's pre-tool hook:
```bash
npx tsx test/live-agy-integration.test.ts
```

Output:
```text
=== REAL AGY CLI + MILO APPROVAL LAYER LIVE TEST ===
[1] Milo Server started on http://127.0.0.1:4000
[2] Testing real agy CLI with Human APPROVAL...
  ✔ Milo Server matched request: 4430b414-1586-4288-876c-218367461c8c
  ✔ Simulating human operator clicking "Approve" on Milo Dashboard...
  ✔ agy CLI exited with code 0 (output: MILO_TEST_APPROVED)
  ✅ REAL AGY APPROVAL FLOW VERIFIED!

[3] Testing real agy CLI with Human REJECTION...
  ✔ Milo Server matched request: f41104ce-2a90-4db8-a2ab-44a9883f3d1f
  ✔ Simulating human operator clicking "Reject" on Milo Dashboard...
  ✔ agy CLI exited with code 0 (denied by pre-tool hook)
  ✅ REAL AGY REJECTION FLOW VERIFIED!

✅ ALL REAL AGY INTEGRATION TESTS PASSED 100%!
```
