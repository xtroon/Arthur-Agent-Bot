export type AgentType = 'antigravity' | 'claude-code' | 'cursor' | 'copilot' | 'generic';
export type ActionType = 'command' | 'file_write' | 'file_edit' | 'browser' | 'generic';
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'timed_out';
export interface MiloRequest {
    id: string;
    agent: AgentType;
    actionType: ActionType;
    toolName: string;
    description: string;
    summary: string;
    payload: Record<string, any>;
    context: {
        conversationId?: string;
        stepIdx?: number;
        workspacePaths?: string[];
        transcriptPath?: string;
        artifactDirectoryPath?: string;
        modelName?: string;
        lastUserInput?: string;
        [key: string]: any;
    };
    status: RequestStatus;
    decisionReason?: string;
    createdAt: string;
    resolvedAt?: string;
}
export interface MiloDecision {
    requestId: string;
    decision: 'approved' | 'rejected';
    reason?: string;
    modifiedPayload?: Record<string, any>;
}
export interface MiloRequestInput {
    agent: AgentType;
    actionType: ActionType;
    toolName: string;
    description: string;
    summary: string;
    payload: Record<string, any>;
    context: Record<string, any>;
}
