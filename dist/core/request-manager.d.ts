import { EventEmitter } from 'events';
import { MiloDecision, MiloRequest, MiloRequestInput } from './types.js';
export declare class RequestManager extends EventEmitter {
    private requests;
    private pendingWaits;
    createRequest(input: MiloRequestInput): MiloRequest;
    getRequest(id: string): MiloRequest | undefined;
    getPendingRequests(): MiloRequest[];
    getAllRequests(): MiloRequest[];
    resolveRequest(id: string, decision: 'approved' | 'rejected', reason?: string): boolean;
    waitForDecision(requestId: string, timeoutMs?: number): Promise<MiloDecision>;
    clear(): void;
}
export declare const defaultRequestManager: RequestManager;
