import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { createApp } from '../src/server/app.js';
import { RequestManager } from '../src/core/request-manager.js';

const PORT = 4000;

async function runLiveTest() {
  console.log('=== REAL AGY CLI + MILO APPROVAL LAYER LIVE TEST ===');

  const requestManager = new RequestManager();
  const app = createApp(requestManager);

  const server = app.listen(PORT, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  console.log(`[1] Milo Server started on http://127.0.0.1:${PORT}`);

  try {
    // -------------------------------------------------------------
    // Test 1: Real agy execution with human APPROVAL
    // -------------------------------------------------------------
    console.log('\n[2] Testing real agy CLI with Human APPROVAL...');
    
    let approvedCommand = false;
    const approvalInterval = setInterval(async () => {
      try {
        const pending = requestManager.getPendingRequests();
        for (const req of pending) {
          console.log(`  [Milo Monitor] Observed pending request: ${req.id} (tool: ${req.toolName}, cmd: ${req.payload?.CommandLine})`);
          if (req.payload?.CommandLine?.includes('MILO_TEST_APPROVED')) {
            console.log(`  \u2714 Milo Server matched request: ${req.id}`);
            console.log('  \u2714 Simulating human operator clicking "Approve" on Milo Dashboard...');
            requestManager.resolveRequest(req.id, 'approved', 'Approved by operator via Milo UI');
            approvedCommand = true;
          }
        }
      } catch (e) {
        // ignore
      }
    }, 200);

    const agyProc = spawn('agy.exe', [
      '--dangerously-skip-permissions',
      '--print',
      'Use the run_command tool to execute: echo MILO_TEST_APPROVED',
    ], {
      shell: false,
    });

    let agyOutput = '';
    agyProc.stdout.on('data', (d) => { agyOutput += d.toString(); });
    agyProc.stderr.on('data', (d) => { agyOutput += d.toString(); });

    const agyExitCode = await new Promise<number>((resolve) => {
      agyProc.on('close', (code) => resolve(code ?? 0));
    });

    clearInterval(approvalInterval);
    console.log(`  \u2714 agy CLI exited with code ${agyExitCode}`);
    console.log(`  \u2714 agy CLI output:\n${agyOutput.trim()}`);

    assert.ok(approvedCommand, 'Milo should have received and approved the request');
    assert.match(agyOutput, /MILO_TEST_APPROVED/i, 'Agent should have executed the command after approval');
    console.log('  \u2705 REAL AGY APPROVAL FLOW VERIFIED!');

    // -------------------------------------------------------------
    // Test 2: Real agy execution with human REJECTION
    // -------------------------------------------------------------
    console.log('\n[3] Testing real agy CLI with Human REJECTION...');

    let rejectedCommand = false;
    const rejectionInterval = setInterval(async () => {
      try {
        const pending = requestManager.getPendingRequests();
        for (const req of pending) {
          console.log(`  [Milo Monitor] Observed pending request: ${req.id} (tool: ${req.toolName}, cmd: ${req.payload?.CommandLine})`);
          if (req.payload?.CommandLine?.includes('MILO_TEST_REJECTED')) {
            console.log(`  \u2714 Milo Server matched request: ${req.id}`);
            console.log('  \u2714 Simulating human operator clicking "Reject" on Milo Dashboard...');
            requestManager.resolveRequest(req.id, 'rejected', 'Prohibited by company safety policy');
            rejectedCommand = true;
          }
        }
      } catch (e) {
        // ignore
      }
    }, 200);

    const agyProc2 = spawn('agy.exe', [
      '--dangerously-skip-permissions',
      '--print',
      'Use the run_command tool to execute: echo MILO_TEST_REJECTED',
    ], {
      shell: false,
    });

    let agyOutput2 = '';
    agyProc2.stdout.on('data', (d) => { agyOutput2 += d.toString(); });
    agyProc2.stderr.on('data', (d) => { agyOutput2 += d.toString(); });

    const agyExitCode2 = await new Promise<number>((resolve) => {
      agyProc2.on('close', (code) => resolve(code ?? 0));
    });

    clearInterval(rejectionInterval);
    console.log(`  \u2714 agy CLI exited with code ${agyExitCode2}`);
    console.log(`  \u2714 agy CLI output:\n${agyOutput2.trim()}`);

    assert.ok(rejectedCommand, 'Milo should have received and rejected the request');
    assert.match(agyOutput2, /Prohibited by company safety policy/i, 'Agent output should reflect human rejection reason');
    console.log('  \u2705 REAL AGY REJECTION FLOW VERIFIED!');

    console.log('\n\u2705 ALL REAL AGY INTEGRATION TESTS PASSED 100%!');
  } finally {
    server.close();
  }
}

runLiveTest().catch((err) => {
  console.error('\n\u274c Live test failed:', err);
  process.exit(1);
});
