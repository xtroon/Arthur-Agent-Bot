import { EventEmitter } from 'events';
import { ArthurDecision, ArthurRequest, ArthurRequestInput } from './types.js';
export declare class RequestManager extends EventEmitter {
    private requests;
    private pendingWaits;
    createRequest(input: ArthurRequestInput): ArthurRequest;
    getRequest(id: string): ArthurRequest | undefined;
    getPendingRequests(): ArthurRequest[];
    getAllRequests(): ArthurRequest[];
    resolveRequest(id: string, decision: 'approved' | 'rejected', reason?: string): boolean;
    waitForDecision(requestId: string, timeoutMs?: number): Promise<ArthurDecision>;
    clear(): void;
}
export declare const defaultRequestManager: RequestManager;
