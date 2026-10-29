import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { defaultRequestManager } from '../core/request-manager.js';
import { adapterRegistry } from '../adapters/index.js';
import { TelegramService } from '../telegram/telegram-service.js';
import { defaultPolicyEngine } from '../policy/policy-engine.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
function getParam(param) {
    if (Array.isArray(param))
        return param[0];
    return param || '';
}
export function createApp(requestManager = defaultRequestManager, telegramService = new TelegramService(requestManager), policyEngine = defaultPolicyEngine) {
    const app = express();
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    app.use(express.json({ limit: '10mb' }));
    // Optional static UI files
    const publicDir = path.resolve(__dirname, '../../src/web/public');
    app.use(express.static(publicDir));
    // Health check
    app.get('/health', (_req, res) => {
        res.json({
            status: 'ok',
            service: 'arthur-approval-layer',
            telegramConnected: telegramService?.isConfigured ? telegramService.isConfigured() : false,
        });
    });
    // GET /api/requests - list requests
    app.get('/api/requests', (req, res) => {
        const status = req.query.status;
        const requests = status === 'pending'
            ? requestManager.getPendingRequests()
            : requestManager.getAllRequests();
        res.json({ success: true, requests });
    });
    // GET /api/requests/:id - get single request
    app.get('/api/requests/:id', (req, res) => {
        const id = getParam(req.params.id);
        const request = requestManager.getRequest(id);
        if (!request) {
            res.status(404).json({ success: false, error: 'Request not found' });
            return;
        }
        res.json({ success: true, request });
    });
    // POST /api/requests/:id/decision - manual approve or reject
    app.post('/api/requests/:id/decision', (req, res) => {
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
    // POST /api/telegram/test - send test message to Telegram
    app.post('/api/telegram/test', async (_req, res) => {
        if (!telegramService.isConfigured()) {
            res.status(400).json({ success: false, error: 'Telegram is not configured in .env' });
            return;
        }
        const sent = await telegramService.sendTestMessage();
        res.json({ success: sent });
    });
    // POST /api/agent/:agentName/pre-tool - Agent direct pre-tool hook endpoint
    app.post('/api/agent/:agentName/pre-tool', async (req, res) => {
        const agentName = getParam(req.params.agentName) || 'antigravity';
        const adapter = adapterRegistry.get(agentName);
        if (!adapter) {
            res.status(400).json({ error: `Unknown agent adapter: ${agentName}` });
            return;
        }
        try {
            const parsedInput = adapter.parseInput(req.body);
            // Evaluate Smart Policy before bothering the human operator
            const policy = policyEngine.evaluate(parsedInput.toolName, parsedInput.actionType, parsedInput.payload);
            // If policy says AUTO-ALLOW -> return immediately without bothering user!
            if (policy.action === 'auto_allow') {
                const autoAllowedResponse = adapter.formatResponse({
                    requestId: 'auto-policy',
                    decision: 'approved',
                    reason: policy.reason,
                }, req.body);
                res.json(autoAllowedResponse);
                return;
            }
            // Risky or important action -> Escalate to human operator on Telegram
            parsedInput.riskLevel = policy.riskLevel;
            parsedInput.summary = policy.humanSummary;
            if (!telegramService.isConfigured()) {
                console.warn(`[Arthur] ⚠️ Telegram is not configured yet. Run 'npx arthur init' to connect your phone.`);
                const unconfiguredResponse = adapter.formatResponse({
                    requestId: 'unconfigured-policy',
                    decision: 'approved',
                    reason: 'Telegram unconfigured: auto-allowed temporarily.',
                }, req.body);
                res.json(unconfiguredResponse);
                return;
            }
            const timeoutSec = parseInt(req.query.timeout, 10) || 120;
            const request = requestManager.createRequest(parsedInput);
            const decision = await requestManager.waitForDecision(request.id, timeoutSec * 1000);
            const responsePayload = adapter.formatResponse(decision, req.body);
            res.json(responsePayload);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    return app;
}
