import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
export class RequestManager extends EventEmitter {
    requests = new Map();
    pendingWaits = new Map();
    createRequest(input) {
        const id = randomUUID();
        const now = new Date().toISOString();
        const request = {
            id,
            agent: input.agent,
            actionType: input.actionType,
            toolName: input.toolName,
            summary: input.summary,
            description: input.description,
            payload: input.payload,
            context: input.context,
            status: 'pending',
            createdAt: now,
        };
        this.requests.set(id, request);
        this.emit('request_created', request);
        return request;
    }
    getRequest(id) {
        return this.requests.get(id);
    }
    getPendingRequests() {
        return Array.from(this.requests.values()).filter((r) => r.status === 'pending');
    }
    getAllRequests() {
        return Array.from(this.requests.values()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    resolveRequest(id, decision, reason) {
        const request = this.requests.get(id);
        if (!request || request.status !== 'pending') {
            return false;
        }
        request.status = decision;
        request.decisionReason = reason;
        request.resolvedAt = new Date().toISOString();
        const miloDecision = {
            requestId: id,
            decision,
            reason,
        };
        const pending = this.pendingWaits.get(id);
        if (pending) {
            clearTimeout(pending.timer);
            this.pendingWaits.delete(id);
            pending.resolve(miloDecision);
        }
        this.emit('request_resolved', { request, decision: miloDecision });
        return true;
    }
    waitForDecision(requestId, timeoutMs = 60000) {
        const request = this.requests.get(requestId);
        if (!request) {
            return Promise.reject(new Error(`Request ${requestId} not found`));
        }
        if (request.status !== 'pending') {
            return Promise.resolve({
                requestId,
                decision: request.status === 'approved' ? 'approved' : 'rejected',
                reason: request.decisionReason,
            });
        }
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                this.pendingWaits.delete(requestId);
                if (request.status === 'pending') {
                    request.status = 'timed_out';
                    request.decisionReason = `Approval timed out after ${Math.round(timeoutMs / 1000)} seconds.`;
                    request.resolvedAt = new Date().toISOString();
                    this.emit('request_resolved', {
                        request,
                        decision: {
                            requestId,
                            decision: 'rejected',
                            reason: request.decisionReason,
                        },
                    });
                }
                resolve({
                    requestId,
                    decision: 'rejected',
                    reason: `Approval timed out after ${Math.round(timeoutMs / 1000)} seconds.`,
                });
            }, timeoutMs);
            this.pendingWaits.set(requestId, { resolve, timer });
        });
    }
    clear() {
        for (const [id, wait] of this.pendingWaits.entries()) {
            clearTimeout(wait.timer);
            wait.resolve({
                requestId: id,
                decision: 'rejected',
                reason: 'Server stopped or reset',
            });
        }
        this.pendingWaits.clear();
        this.requests.clear();
    }
}
export const defaultRequestManager = new RequestManager();
