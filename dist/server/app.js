import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { defaultRequestManager } from '../core/request-manager.js';
import { adapterRegistry } from '../adapters/index.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
function getParam(param) {
    if (Array.isArray(param))
        return param[0];
    return param || '';
}
export function createApp(requestManager = defaultRequestManager) {
    const app = express();
    app.use(express.json({ limit: '10mb' }));
    // Serve static UI files from web/public
    const publicDir = path.resolve(__dirname, '../../src/web/public');
    app.use(express.static(publicDir));
    // Health check
    app.get('/health', (_req, res) => {
        res.json({ status: 'ok', service: 'milo-approval-server' });
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
    // POST /api/requests - create a new approval request
    app.post('/api/requests', (req, res) => {
        const input = req.body;
        if (!input || !input.toolName) {
            res.status(400).json({ success: false, error: 'Invalid request input' });
            return;
        }
        const request = requestManager.createRequest(input);
        res.status(201).json({ success: true, request });
    });
    // POST /api/requests/:id/decision - approve or reject
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
    // GET /api/requests/:id/wait - wait for approval decision
    app.get('/api/requests/:id/wait', async (req, res) => {
        const id = getParam(req.params.id);
        const timeoutMs = parseInt(req.query.timeout, 10) || 60000;
        try {
            const decision = await requestManager.waitForDecision(id, timeoutMs);
            res.json({ success: true, decision });
        }
        catch (err) {
            res.status(404).json({ success: false, error: err.message });
        }
    });
    // POST /api/agent/:agentName/pre-tool - Agent direct pre-tool endpoint
    app.post('/api/agent/:agentName/pre-tool', async (req, res) => {
        const agentName = getParam(req.params.agentName) || 'antigravity';
        const adapter = adapterRegistry.get(agentName);
        if (!adapter) {
            res.status(400).json({ error: `Unknown agent adapter: ${agentName}` });
            return;
        }
        try {
            const timeoutSec = parseInt(req.query.timeout, 10) || 60;
            const parsedInput = adapter.parseInput(req.body);
            const request = requestManager.createRequest(parsedInput);
            const decision = await requestManager.waitForDecision(request.id, timeoutSec * 1000);
            const responsePayload = adapter.formatResponse(decision, req.body);
            res.json(responsePayload);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // GET /api/events - Server-Sent Events stream for real-time dashboard updates
    app.get('/api/events', (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();
        const onRequestCreated = (request) => {
            res.write(`event: request_created\ndata: ${JSON.stringify(request)}\n\n`);
        };
        const onRequestResolved = (data) => {
            res.write(`event: request_resolved\ndata: ${JSON.stringify(data)}\n\n`);
        };
        requestManager.on('request_created', onRequestCreated);
        requestManager.on('request_resolved', onRequestResolved);
        // Keepalive heartbeat
        const heartbeat = setInterval(() => {
            res.write(': keepalive\n\n');
        }, 15000);
        req.on('close', () => {
            clearInterval(heartbeat);
            requestManager.off('request_created', onRequestCreated);
            requestManager.off('request_resolved', onRequestResolved);
        });
    });
    return app;
}
