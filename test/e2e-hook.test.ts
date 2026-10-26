import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { createApp } from '../src/server/app.js';
import { RequestManager } from '../src/core/request-manager.js';

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
  console.log('--- Starting Milo E2E Hook Flow Tests ---');

  const requestManager = new RequestManager();
  const app = createApp(requestManager);

  const server = app.listen(TEST_PORT, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  console.log(`Test server listening on ${BASE_URL}`);

  try {
    // ---------------------------------------------------------
    // TEST 1: End-to-End Approval Flow
    // ---------------------------------------------------------
    console.log('\n[Scenario 1] Tool execution -> Pending in Milo -> Human Approves -> Agent Allowed');

    const hookPayload1 = {
      toolCall: {
        name: 'run_command',
        args: { CommandLine: 'npm test' },
      },
      stepIdx: 12,
      conversationId: 'conv-scenario-1',
      modelName: 'gemini-3.8-flash',
    };

    // Run hook in background (it will block waiting for approval)
    const hookPromise1 = runHookProcess(hookPayload1, BASE_URL, 5);

    // Wait for the request to appear in the Milo server
    let pendingReq1: any = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const res = await httpRequest('GET', '/api/requests?status=pending');
      if (res.requests && res.requests.length > 0) {
        pendingReq1 = res.requests[0];
        break;
      }
    }

    assert.ok(pendingReq1, 'Pending request should be registered in Milo server');
    assert.equal(pendingReq1.toolName, 'run_command');
    assert.equal(pendingReq1.payload.CommandLine, 'npm test');
    console.log(`  \u2714 Request appeared on Milo dashboard: ${pendingReq1.id}`);

    // Human operator clicks "Approve"
    const approvalRes = await httpRequest('POST', `/api/requests/${pendingReq1.id}/decision`, {
      decision: 'approved',
      reason: 'Tests are safe to run',
    });
    assert.equal(approvalRes.success, true);
    console.log('  \u2714 Human approved request via web API');

    // Await hook process completion
    const result1 = await hookPromise1;
    console.log(`  \u2714 Hook process exited with code ${result1.code}`);
    console.log(`  \u2714 Hook stdout: ${result1.stdout}`);

    const parsedOutput1 = JSON.parse(result1.stdout);
    assert.equal(parsedOutput1.decision, 'allow');
    assert.deepEqual(parsedOutput1.permissionOverrides, ['command(npm test)']);
    console.log('  \u2705 Scenario 1 SUCCESS: Agent received decision: "allow"');

    // ---------------------------------------------------------
    // TEST 2: End-to-End Rejection Flow
    // ---------------------------------------------------------
    console.log('\n[Scenario 2] Dangerous command -> Pending in Milo -> Human Rejects -> Agent Denied');

    const hookPayload2 = {
      toolCall: {
        name: 'run_command',
        args: { CommandLine: 'rm -rf /important_data' },
      },
      stepIdx: 14,
      conversationId: 'conv-scenario-2',
    };

    const hookPromise2 = runHookProcess(hookPayload2, BASE_URL, 5);

    let pendingReq2: any = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const res = await httpRequest('GET', '/api/requests?status=pending');
      if (res.requests && res.requests.length > 0) {
        pendingReq2 = res.requests[0];
        break;
      }
    }

    assert.ok(pendingReq2, 'Pending request 2 should be registered');
    console.log(`  \u2714 Request appeared on Milo dashboard: ${pendingReq2.id}`);

    // Human operator clicks "Reject"
    const rejectionRes = await httpRequest('POST', `/api/requests/${pendingReq2.id}/decision`, {
      decision: 'rejected',
      reason: 'Destructive command prohibited by company policy',
    });
    assert.equal(rejectionRes.success, true);
    console.log('  \u2714 Human rejected request with reason');

    const result2 = await hookPromise2;
    console.log(`  \u2714 Hook process exited with code ${result2.code}`);
    console.log(`  \u2714 Hook stdout: ${result2.stdout}`);

    const parsedOutput2 = JSON.parse(result2.stdout);
    assert.equal(parsedOutput2.decision, 'deny');
    assert.equal(parsedOutput2.reason, 'Destructive command prohibited by company policy');
    console.log('  \u2705 Scenario 2 SUCCESS: Agent received decision: "deny" with custom reason');

    // ---------------------------------------------------------
    // TEST 3: Safe Fallback when Server Offline
    // ---------------------------------------------------------
    console.log('\n[Scenario 3] Milo server unreachable -> Fail-safe Deny');

    const result3 = await runHookProcess(hookPayload1, 'http://127.0.0.1:9999', 1);
    console.log(`  \u2714 Hook stdout on offline server: ${result3.stdout}`);
    const parsedOutput3 = JSON.parse(result3.stdout);
    assert.equal(parsedOutput3.decision, 'deny');
    assert.match(parsedOutput3.reason, /Milo approval error/i);
    console.log('  \u2705 Scenario 3 SUCCESS: Fail-safe deny when approval server is down');

    console.log('\n\u2705 ALL E2E FLOW TESTS PASSED SUCCESSFULLY!');
  } finally {
    server.close();
  }
}

runE2ETests().catch((err) => {
  console.error('\n\u274c E2E TEST FAILED:', err);
  process.exit(1);
});
