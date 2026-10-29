import assert from 'node:assert/strict';
import { AntigravityAdapter } from '../src/adapters/antigravity.adapter.js';
import { ClaudeCodeAdapter } from '../src/adapters/claude-code.adapter.js';
import { RequestManager } from '../src/core/request-manager.js';

async function testAntigravityAdapter() {
  console.log('Testing AntigravityAdapter...');
  const adapter = new AntigravityAdapter();

  // Test parse run_command
  const parsedCmd = adapter.parseInput({
    toolCall: {
      name: 'run_command',
      args: { CommandLine: 'rm -rf /tmp/test', toolSummary: 'Delete test files' },
    },
    stepIdx: 5,
    conversationId: 'conv-1234',
  });

  assert.equal(parsedCmd.agent, 'antigravity');
  assert.equal(parsedCmd.actionType, 'command');
  assert.equal(parsedCmd.toolName, 'run_command');
  assert.equal(parsedCmd.payload.CommandLine, 'rm -rf /tmp/test');
  assert.equal(parsedCmd.context.stepIdx, 5);
  assert.equal(parsedCmd.context.conversationId, 'conv-1234');

  // Test formatResponse - approved without command
  const approvedResp = adapter.formatResponse({
    requestId: 'req-1',
    decision: 'approved',
  });
  assert.deepEqual(approvedResp, { decision: 'allow' });

  // Test formatResponse - approved with command
  const approvedWithCmd = adapter.formatResponse(
    { requestId: 'req-1', decision: 'approved' },
    { toolCall: { name: 'run_command', args: { CommandLine: 'npm test' } } }
  );
  assert.equal(approvedWithCmd.decision, 'allow');
  assert.deepEqual(approvedWithCmd.permissionOverrides, ['command(npm test)']);

  // Test formatResponse - rejected
  const rejectedResp = adapter.formatResponse({
    requestId: 'req-2',
    decision: 'rejected',
    reason: 'Risk of data loss',
  });
  assert.deepEqual(rejectedResp, {
    decision: 'deny',
    reason: 'Risk of data loss',
  });

  console.log('  ✔ AntigravityAdapter tests passed!');
}

async function testClaudeCodeAdapter() {
  console.log('Testing ClaudeCodeAdapter...');
  const adapter = new ClaudeCodeAdapter();

  const parsed = adapter.parseInput({
    tool: 'Bash',
    input: { command: 'git push origin main' },
    session_id: 'claude-session-1',
  });

  assert.equal(parsed.agent, 'claude-code');
  assert.equal(parsed.actionType, 'command');
  assert.equal(parsed.summary, 'Command: git push origin main');

  const approved = adapter.formatResponse({ requestId: 'r1', decision: 'approved' });
  assert.equal(approved.decision, 'allow');

  const rejected = adapter.formatResponse({ requestId: 'r2', decision: 'rejected', reason: 'Blocked' });
  assert.equal(rejected.decision, 'deny');
  assert.equal(rejected.reason, 'Blocked');

  console.log('  ✔ ClaudeCodeAdapter tests passed!');
}

async function testRequestManager() {
  console.log('Testing RequestManager...');
  const manager = new RequestManager();

  const req = manager.createRequest({
    agent: 'antigravity',
    actionType: 'command',
    toolName: 'run_command',
    summary: 'Execute: git status',
    description: 'Check git status',
    riskLevel: 'low',
    payload: { CommandLine: 'git status' },
    context: { conversationId: 'conv-test' },
  });

  assert.equal(req.status, 'pending');
  assert.equal(manager.getPendingRequests().length, 1);

  // Test approval
  setTimeout(() => {
    manager.resolveRequest(req.id, 'approved');
  }, 50);

  const decision = await manager.waitForDecision(req.id, 1000);
  assert.equal(decision.decision, 'approved');
  assert.equal(manager.getPendingRequests().length, 0);

  // Test timeout
  const req2 = manager.createRequest({
    agent: 'antigravity',
    actionType: 'command',
    toolName: 'run_command',
    summary: 'Execute: sleep 10',
    description: 'Sleep test',
    riskLevel: 'low',
    payload: { CommandLine: 'sleep 10' },
    context: {},
  });

  const timeoutDecision = await manager.waitForDecision(req2.id, 100);
  assert.equal(timeoutDecision.decision, 'rejected');
  assert.match(timeoutDecision.reason || '', /timed out/i);
  assert.equal(req2.status, 'timed_out');

  console.log('  ✔ RequestManager tests passed!');
}

async function runAll() {
  try {
    await testAntigravityAdapter();
    await testClaudeCodeAdapter();
    await testRequestManager();
    console.log('\n✅ ALL UNIT TESTS PASSED!');
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err);
    process.exit(1);
  }
}

runAll();
