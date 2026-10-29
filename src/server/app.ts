import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { RequestManager, defaultRequestManager } from '../core/request-manager.js';
import { adapterRegistry } from '../adapters/index.js';
import { TelegramService } from '../telegram/telegram-service.js';
import { PolicyEngine, defaultPolicyEngine } from '../policy/policy-engine.js';
import { defaultRelayClient } from '../relay/relay-client.js';
import { loadArthurConfig } from '../core/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getParam(param: string | string[] | undefined): string {
  if (Array.isArray(param)) return param[0];
  return param || '';
}

export function createApp(
  requestManager: RequestManager = defaultRequestManager,
  telegramService: TelegramService = new TelegramService(requestManager),
  policyEngine: PolicyEngine = defaultPolicyEngine
) {
  const app = express();

  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(express.json({ limit: '10mb' }));

  // Optional static UI files
  const publicDir = path.resolve(__dirname, '../../src/web/public');
  app.use(express.static(publicDir));

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'arthur-approval-layer',
      telegramConnected: telegramService?.isConfigured ? telegramService.isConfigured() : false,
      config: loadArthurConfig(),
    });
  });

  // GET /api/session - get or create magic pairing session
  app.get('/api/session', async (_req: Request, res: Response) => {
    const session = await defaultRelayClient.getOrCreatePairingSession();
    res.json({ success: true, session });
  });

  // GET /api/requests - list requests
  app.get('/api/requests', (req: Request, res: Response) => {
    const status = req.query.status as string | undefined;
    const requests =
      status === 'pending'
        ? requestManager.getPendingRequests()
        : requestManager.getAllRequests();
    res.json({ success: true, requests });
  });

  // GET /api/requests/:id - get single request
  app.get('/api/requests/:id', (req: Request, res: Response) => {
    const id = getParam(req.params.id);
    const request = requestManager.getRequest(id);
    if (!request) {
      res.status(404).json({ success: false, error: 'Request not found' });
      return;
    }
    res.json({ success: true, request });
  });

  // POST /api/requests/:id/decision - manual approve or reject
  app.post('/api/requests/:id/decision', (req: Request, res: Response) => {
    const id = getParam(req.params.id);
    const { decision, reason } = req.body;
    if (decision !== 'approved' && decision !== 'rejected') {
      res.status(400).json({ success: false, error: 'Decision must be "approved" or "rejected"' });
      return;
    }

    const success = requestManager.resolveRequest(id, decision, reason);
    if (!success) {
      res.status(404).json({ success: false, error: 'Request not found or already resolved' });
      return;
    }

    const request = requestManager.getRequest(id);
    res.json({ success: true, request });
  });

  // POST /api/agent/:agentName/pre-tool - Agent direct pre-tool hook endpoint
  app.post('/api/agent/:agentName/pre-tool', async (req: Request, res: Response) => {
    const agentName = getParam(req.params.agentName) || 'antigravity';
    const adapter = adapterRegistry.get(agentName);
    if (!adapter) {
      res.status(400).json({ error: `Unknown agent adapter: ${agentName}` });
      return;
    }

    try {
      const parsedInput = adapter.parseInput(req.body);

      // 1. Evaluate Smart Policy before bothering the human operator
      const policy = policyEngine.evaluate(
        parsedInput.toolName,
        parsedInput.actionType,
        parsedInput.payload
      );

      // If policy says AUTO-ALLOW -> return immediately without bothering user!
      if (policy.action === 'auto_allow') {
        const autoAllowedResponse = adapter.formatResponse(
          {
            requestId: 'auto-policy',
            decision: 'approved',
            reason: policy.reason,
          },
          req.body
        );
        res.json(autoAllowedResponse);
        return;
      }

      // 2. Risky or important action -> Escalate to human operator on Telegram
      parsedInput.riskLevel = policy.riskLevel;
      parsedInput.summary = policy.humanSummary;

      // Check if local Telegram or Official Relay is active
      const isLocalTelegramActive = telegramService?.isConfigured ? telegramService.isConfigured() : false;

      // If neither is configured, check if we can get a pairing link to show the user
      if (!isLocalTelegramActive) {
        const session = await defaultRelayClient.getOrCreatePairingSession();
        if (session && !session.isPaired) {
          process.stderr.write(`\n------------------------------------------------------------\n`);
          process.stderr.write(`🛡️  [Arthur] Phone Not Paired Yet\n`);
          process.stderr.write(`📱  Click to pair your phone in 1-tap:\n`);
          process.stderr.write(`👉  ${session.pairingUrl}\n`);
          process.stderr.write(`------------------------------------------------------------\n\n`);

          // Allow the current command with notice so the user is never blocked on first run
          const unblockedResp = adapter.formatResponse(
            {
              requestId: 'first-run-pairing',
              decision: 'approved',
              reason: `Action allowed. Pair your phone at ${session.pairingUrl} for future 1-tap gating.`,
            },
            req.body
          );
          res.json(unblockedResp);
          return;
        }
      }

      // Await decision from local Telegram or Relay
      const timeoutSec = parseInt(req.query.timeout as string, 10) || 120;
      const request = requestManager.createRequest(parsedInput);

      const decision = await requestManager.waitForDecision(request.id, timeoutSec * 1000);
      const responsePayload = adapter.formatResponse(decision, req.body);
      res.json(responsePayload);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return app;
}
