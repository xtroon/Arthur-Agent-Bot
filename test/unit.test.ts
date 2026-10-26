import assert from 'node:assert/strict';
import { AntigravityAdapter } from '../src/adapters/antigravity.adapter.js';
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

  console.log('  \u2714 AntigravityAdapter tests passed!');
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
    payload: { CommandLine: 'sleep 10' },
    context: {},
  });

  const timeoutDecision = await manager.waitForDecision(req2.id, 100);
  assert.equal(timeoutDecision.decision, 'rejected');
  assert.match(timeoutDecision.reason || '', /timed out/i);
  assert.equal(req2.status, 'timed_out');

  console.log('  \u2714 RequestManager tests passed!');
}

async function runAll() {
  try {
    await testAntigravityAdapter();
    await testRequestManager();
    console.log('\n\u2705 ALL UNIT TESTS PASSED!');
  } catch (err) {
    console.error('\n\u274c TEST FAILED:', err);
    process.exit(1);
  }
}

runAll();
