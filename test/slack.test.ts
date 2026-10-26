import assert from 'node:assert/strict';
import http from 'node:http';
import { RequestManager } from '../src/core/request-manager.js';
import { SlackService } from '../src/slack/slack-service.js';
import { SlackClient, SlackApiResponse } from '../src/slack/slack-client.js';
import { SlackBlockBuilder } from '../src/slack/block-builder.js';
import { verifySlackSignature, generateTestSlackSignature } from '../src/slack/signature.js';
import { createApp } from '../src/server/app.js';
import { MiloRequest } from '../src/core/types.js';

const TEST_PORT = 4008;
const TEST_SIGNING_SECRET = 'test_slack_signing_secret_12345';
const TEST_CHANNEL = 'C0123456789';

class MockSlackClient extends SlackClient {
  public postedMessages: Array<{ channel: string; text: string; blocks?: any[] }> = [];
  public updatedMessages: Array<{ channel: string; ts: string; text: string; blocks?: any[] }> = [];

  async postMessage(channel: string, text: string, blocks?: any[]): Promise<SlackApiResponse> {
    this.postedMessages.push({ channel, text, blocks });
    return {
      ok: true,
      ts: `1700000000.${this.postedMessages.length}`,
      channel,
    };
  }

  async updateMessage(channel: string, ts: string, text: string, blocks?: any[]): Promise<SlackApiResponse> {
    this.updatedMessages.push({ channel, ts, text, blocks });
    return {
      ok: true,
      ts,
      channel,
    };
  }
}

function sendHttpRequest(
  method: string,
  path: string,
  headers: Record<string, string>,
  body: string
): Promise<{ status: number; data: any; raw: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path,
        method,
        headers: {
          ...headers,
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c.toString()));
        res.on('end', () => {
          let data: any = raw;
          try {
            data = JSON.parse(raw);
          } catch {}
          resolve({ status: res.statusCode ?? 500, data, raw });
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function runSlackTests() {
  console.log('=== Starting Milo Slack Integration Tests ===\n');

  // -------------------------------------------------------------
  // TEST 1: Slack Signature Verification
  // -------------------------------------------------------------
  console.log('[Test 1] Testing Slack HMAC SHA-256 Signature Verification...');
  const testBody = 'payload=%7B%22type%22%3A%22block_actions%22%7D';
  const now = Math.floor(Date.now() / 1000);
  const validSig = generateTestSlackSignature(TEST_SIGNING_SECRET, now, testBody);

  // Valid signature
  const check1 = verifySlackSignature({
    signingSecret: TEST_SIGNING_SECRET,
    requestSignature: validSig,
    timestamp: now.toString(),
    rawBody: testBody,
  });
  assert.equal(check1.valid, true, 'Valid signature must pass');

  // Tampered body
  const check2 = verifySlackSignature({
    signingSecret: TEST_SIGNING_SECRET,
    requestSignature: validSig,
    timestamp: now.toString(),
    rawBody: testBody + '_tampered',
  });
  assert.equal(check2.valid, false, 'Tampered body must fail verification');

  // Expired timestamp (> 300 seconds)
  const expiredTime = now - 400;
  const expiredSig = generateTestSlackSignature(TEST_SIGNING_SECRET, expiredTime, testBody);
  const check3 = verifySlackSignature({
    signingSecret: TEST_SIGNING_SECRET,
    requestSignature: expiredSig,
    timestamp: expiredTime.toString(),
    rawBody: testBody,
  });
  assert.equal(check3.valid, false, 'Expired timestamp must fail replay attack check');
  assert.match(check3.error || '', /expired/i);

  console.log('  ✔ Signature verification and replay prevention verified successfully!');

  // -------------------------------------------------------------
  // TEST 2: Block Kit Builder Structure
  // -------------------------------------------------------------
  console.log('\n[Test 2] Testing Slack Block Kit Builder...');
  const sampleRequest: MiloRequest = {
    id: 'req-slack-test-1234',
    agent: 'antigravity',
    actionType: 'command',
    toolName: 'run_command',
    summary: 'Execute: npm test',
    description: 'Run unit test suite',
    payload: { CommandLine: 'npm test' },
    context: { conversationId: 'conv-abc', stepIdx: 7 },
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  const approvalMsg = SlackBlockBuilder.buildApprovalMessage(sampleRequest);
  assert.ok(approvalMsg.blocks.length >= 6, 'Block Kit message must contain header, sections, and actions');
  
  const actionsBlock = approvalMsg.blocks.find((b) => b.type === 'actions');
  assert.ok(actionsBlock, 'Must contain an actions block');
  assert.equal(actionsBlock.elements.length, 2, 'Must have 2 action buttons (Approve & Reject)');
  assert.equal(actionsBlock.elements[0].action_id, 'milo_approve');
  assert.equal(actionsBlock.elements[0].value, sampleRequest.id);
  assert.equal(actionsBlock.elements[1].action_id, 'milo_reject');
  assert.equal(actionsBlock.elements[1].value, sampleRequest.id);

  const resolvedMsg = SlackBlockBuilder.buildResolvedMessage(
    sampleRequest,
    { requestId: sampleRequest.id, decision: 'approved' },
    '@alice'
  );
  assert.equal(resolvedMsg.blocks.some((b) => b.type === 'actions'), false, 'Actions buttons must be removed upon resolution');
  const resolvedSection = resolvedMsg.blocks[resolvedMsg.blocks.length - 1];
  assert.match(resolvedSection.text.text, /APPROVED/i);

  console.log('  ✔ Block Kit formatting for pending and resolved states verified!');

  // -------------------------------------------------------------
  // TEST 3: End-to-End Slack Button Click Changes Real Request
  // -------------------------------------------------------------
  console.log('\n[Test 3] Testing Real End-to-End Slack Button Click Execution...');
  const requestManager = new RequestManager();
  const slackService = new SlackService(requestManager, {
    botToken: 'xoxb-mock-token',
    signingSecret: TEST_SIGNING_SECRET,
    channelId: TEST_CHANNEL,
    enabled: true,
  });

  const mockClient = new MockSlackClient('xoxb-mock-token');
  slackService.setMockClient(mockClient);

  const app = createApp(requestManager, slackService);
  const server = app.listen(TEST_PORT, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));

  try {
    // 3A: Create a real approval request
    const request = requestManager.createRequest({
      agent: 'antigravity',
      actionType: 'command',
      toolName: 'run_command',
      summary: 'Execute: git push origin main',
      description: 'Push changes to remote repository',
      payload: { CommandLine: 'git push origin main' },
      context: { conversationId: 'conv-real-test' },
    });

    assert.equal(request.status, 'pending');
    assert.equal(mockClient.postedMessages.length, 1, 'Slack notification should have been posted');
    console.log(`  ✔ Real request created: ${request.id}`);
    console.log(`  ✔ Slack notification posted to channel: ${mockClient.postedMessages[0].channel}`);

    // 3B: Simulate human operator clicking "Approve" button in Slack
    const slackPayloadApprove = {
      type: 'block_actions',
      user: { id: 'U12345', name: 'david', username: 'david.dev' },
      actions: [
        {
          action_id: 'milo_approve',
          value: request.id,
          type: 'button',
        },
      ],
      response_url: 'https://hooks.slack.com/actions/mock/response',
    };

    const urlEncodedBody = `payload=${encodeURIComponent(JSON.stringify(slackPayloadApprove))}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = generateTestSlackSignature(TEST_SIGNING_SECRET, timestamp, urlEncodedBody);

    console.log('  ✔ Sending signed Slack interaction POST request to /api/slack/interactions...');
    const httpRes = await sendHttpRequest(
      'POST',
      '/api/slack/interactions',
      {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-slack-request-timestamp': timestamp.toString(),
        'x-slack-signature': signature,
      },
      urlEncodedBody
    );

    assert.equal(httpRes.status, 200, 'Slack interaction endpoint must return HTTP 200');
    console.log(`  ✔ Endpoint returned HTTP 200: ${JSON.stringify(httpRes.data)}`);

    // Verify the real request status in RequestManager was updated to approved!
    const resolvedRequest = requestManager.getRequest(request.id);
    assert.ok(resolvedRequest, 'Request must exist');
    assert.equal(resolvedRequest.status, 'approved', 'Request status MUST change to approved');
    assert.match(resolvedRequest.decisionReason || '', /david/, 'Decision reason must reference the Slack user');
    console.log(`  ✅ REAL APPROVAL REQUEST WAS SUCCESSFULLY APPROVED VIA SLACK BUTTON CLICK!`);

    // 3C: Prevent duplicate decisions
    console.log('\n[Test 4] Testing Duplicate Decision Prevention...');
    const duplicateRes = await sendHttpRequest(
      'POST',
      '/api/slack/interactions',
      {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-slack-request-timestamp': timestamp.toString(),
        'x-slack-signature': signature,
      },
      urlEncodedBody
    );

    assert.equal(duplicateRes.status, 200);
    assert.match(duplicateRes.raw, /already resolved/i, 'Duplicate interaction must be safely handled');
    console.log('  ✔ Duplicate click safely prevented without breaking state!');

    // 3D: Test Rejection via Slack
    console.log('\n[Test 5] Testing Slack REJECTION Button Click...');
    const request2 = requestManager.createRequest({
      agent: 'antigravity',
      actionType: 'command',
      toolName: 'run_command',
      summary: 'Execute: rm -rf /',
      description: 'Dangerous deletion',
      payload: { CommandLine: 'rm -rf /' },
      context: {},
    });

    const slackPayloadReject = {
      type: 'block_actions',
      user: { id: 'U99999', name: 'security_lead' },
      actions: [{ action_id: 'milo_reject', value: request2.id, type: 'button' }],
    };

    const rejectBody = `payload=${encodeURIComponent(JSON.stringify(slackPayloadReject))}`;
    const rejectSig = generateTestSlackSignature(TEST_SIGNING_SECRET, timestamp, rejectBody);

    const rejectHttpRes = await sendHttpRequest(
      'POST',
      '/api/slack/interactions',
      {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-slack-request-timestamp': timestamp.toString(),
        'x-slack-signature': rejectSig,
      },
      rejectBody
    );

    assert.equal(rejectHttpRes.status, 200);
    const resolvedReq2 = requestManager.getRequest(request2.id);
    assert.equal(resolvedReq2?.status, 'rejected');
    console.log('  ✅ REAL REQUEST WAS SUCCESSFULLY REJECTED VIA SLACK BUTTON CLICK!');

    // 3E: Test Web -> Slack synchronization
    console.log('\n[Test 6] Testing Web to Slack Synchronization...');
    const request3 = requestManager.createRequest({
      agent: 'antigravity',
      actionType: 'command',
      toolName: 'run_command',
      summary: 'Execute: git status',
      description: 'Check status',
      payload: { CommandLine: 'git status' },
      context: {},
    });

    // Resolve via Web API
    requestManager.resolveRequest(request3.id, 'approved', 'Approved on web dashboard');
    // Verify that mockClient.updateMessage was called to update Slack message
    assert.ok(mockClient.updatedMessages.length >= 1, 'Slack message must be updated when resolved on web');
    console.log('  ✔ Web approval synchronized with Slack message update!');

    // 3F: Test Socket Mode envelope handling
    console.log('\n[Test 7] Testing Slack Socket Mode Interactive Envelope Dispatch...');
    const request4 = requestManager.createRequest({
      agent: 'antigravity',
      actionType: 'command',
      toolName: 'run_command',
      summary: 'Execute: npm run build',
      description: 'Build project',
      payload: { CommandLine: 'npm run build' },
      context: {},
    });

    const socketEnvelopePayload = {
      type: 'block_actions',
      user: { id: 'U55555', name: 'socket_operator' },
      actions: [{ action_id: 'milo_approve', value: request4.id, type: 'button' }],
    };

    const socketResult = await slackService.handleInteraction(socketEnvelopePayload as any);
    assert.equal(socketResult.handled, true);
    assert.equal(socketResult.decision, 'approved');

    const resolvedReq4 = requestManager.getRequest(request4.id);
    assert.equal(resolvedReq4?.status, 'approved');
    assert.match(resolvedReq4?.decisionReason || '', /socket_operator/);
    console.log('  ✅ SOCKET MODE INTERACTION PROCESSED AND RESOLVED REQUEST!');

    console.log('\n✅ ALL SLACK INTEGRATION TESTS PASSED 100%!');
  } finally {
    server.close();
  }
}

runSlackTests().catch((err) => {
  console.error('\n❌ Slack tests failed:', err);
  process.exit(1);
});
