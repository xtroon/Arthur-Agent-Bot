import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { createApp } from '../src/server/app.js';
import { RequestManager } from '../src/core/request-manager.js';
import { PolicyEngine } from '../src/policy/policy-engine.js';

const TEST_PORT = 4005;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

function httpRequest(method: string, path: string, body?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path,
        method,
        headers: postData
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData),
            }
          : undefined,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        });
      }
    );
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function runHookProcess(inputPayload: any, serverUrl: string, timeoutSec: number = 5): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [
      'dist/cli/hook-runner.js',
      '--server', serverUrl,
      '--agent', 'antigravity',
      '--timeout', timeoutSec.toString(),
    ]);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      resolve({ stdout: stdout.trim(), code: code ?? 0 });
    });

    proc.on('error', reject);

    proc.stdin.write(JSON.stringify(inputPayload));
    proc.stdin.end();
  });
}

async function runE2ETests() {
  console.log('--- Starting Arthur E2E Hook Flow Tests ---');

  const requestManager = new RequestManager();
  const policyEngine = new PolicyEngine();
  const mockTelegramService: any = {
    isConfigured: () => true,
    notifyRequest: async () => {},
  };
  const app = createApp(requestManager, mockTelegramService, policyEngine);

  const server = app.listen(TEST_PORT, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  console.log(`Test server listening on ${BASE_URL}`);

  try {
    // ---------------------------------------------------------
    // TEST 1: Smart Policy Auto-Approve (e.g. git status)
    // ---------------------------------------------------------
    console.log('\n[Scenario 1] Safe command -> Auto-allowed by policy without disturbing human');
    const safePayload = {
      toolCall: {
        name: 'run_command',
        args: { CommandLine: 'git status' },
      },
      stepIdx: 1,
      conversationId: 'conv-safe',
    };

    const safeResult = await runHookProcess(safePayload, BASE_URL, 5);
    console.log(`  ✔ Safe hook process exited with code ${safeResult.code}`);
    console.log(`  ✔ Safe hook stdout: ${safeResult.stdout}`);
    const parsedSafe = JSON.parse(safeResult.stdout);
    assert.equal(parsedSafe.decision, 'allow');
    console.log('  ✅ Scenario 1 SUCCESS: Safe command auto-allowed in milliseconds!');

    // ---------------------------------------------------------
    // TEST 2: Risky command -> Pending -> Human Approves
    // ---------------------------------------------------------
    console.log('\n[Scenario 2] Risky command -> Pending in Arthur -> Operator Approves -> Allowed');

    const riskyPayload = {
      toolCall: {
        name: 'run_command',
        args: { CommandLine: 'npm install express' },
      },
      stepIdx: 2,
      conversationId: 'conv-risky',
    };

    const hookPromise2 = runHookProcess(riskyPayload, BASE_URL, 5);

    let pendingReq: any = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const res = await httpRequest('GET', '/api/requests?status=pending');
      if (res.requests && res.requests.length > 0) {
        pendingReq = res.requests[0];
        break;
      }
    }

    assert.ok(pendingReq, 'Pending request should be registered in Arthur');
    assert.equal(pendingReq.toolName, 'run_command');
    console.log(`  ✔ Request arrived in Arthur: ${pendingReq.id}`);

    const approvalRes = await httpRequest('POST', `/api/requests/${pendingReq.id}/decision`, {
      decision: 'approved',
      reason: 'Approved via test',
    });
    assert.equal(approvalRes.success, true);

    const result2 = await hookPromise2;
    const parsed2 = JSON.parse(result2.stdout);
    assert.equal(parsed2.decision, 'allow');
    console.log('  ✅ Scenario 2 SUCCESS: Risky command approved and unblocked');

    // ---------------------------------------------------------
    // TEST 3: Dangerous command -> Operator Rejects
    // ---------------------------------------------------------
    console.log('\n[Scenario 3] Dangerous command -> Operator Rejects -> Denied');

    const dangerousPayload = {
      toolCall: {
        name: 'run_command',
        args: { CommandLine: 'rm -rf /production-db' },
      },
      stepIdx: 3,
      conversationId: 'conv-dangerous',
    };

    const hookPromise3 = runHookProcess(dangerousPayload, BASE_URL, 5);

    let pendingReq3: any = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const res = await httpRequest('GET', '/api/requests?status=pending');
      if (res.requests && res.requests.length > 0) {
        pendingReq3 = res.requests[0];
        break;
      }
    }

    assert.ok(pendingReq3, 'Dangerous request registered');
    const rejectionRes = await httpRequest('POST', `/api/requests/${pendingReq3.id}/decision`, {
      decision: 'rejected',
      reason: 'Destructive deletion prohibited',
    });
    assert.equal(rejectionRes.success, true);

    const result3 = await hookPromise3;
    const parsed3 = JSON.parse(result3.stdout);
    assert.equal(parsed3.decision, 'deny');
    assert.equal(parsed3.reason, 'Destructive deletion prohibited');
    console.log('  ✅ Scenario 3 SUCCESS: Dangerous command rejected with reason');

    console.log('\n✅ ALL E2E FLOW TESTS PASSED SUCCESSFULLY!');
  } finally {
    server.close();
  }
}

runE2ETests().catch((err) => {
  console.error('\n❌ E2E TEST FAILED:', err);
  process.exit(1);
});
