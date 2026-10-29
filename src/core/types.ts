export type AgentType = 'antigravity' | 'claude-code' | 'cursor' | 'copilot' | 'generic';

export type ActionType = 'command' | 'file_write' | 'file_edit' | 'browser' | 'generic';

export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'timed_out';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface ArthurRequest {
  id: string;
  agent: AgentType;
  actionType: ActionType;
  toolName: string;
  description: string;
  summary: string;
  riskLevel?: RiskLevel;
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

export interface ArthurDecision {
  requestId: string;
  decision: 'approved' | 'rejected';
  reason?: string;
  modifiedPayload?: Record<string, any>;
}

export interface ArthurRequestInput {
  agent: AgentType;
  actionType: ActionType;
  toolName: string;
  description: string;
  summary: string;
  riskLevel?: RiskLevel;
  payload: Record<string, any>;
  context: Record<string, any>;
}

// Backward-compatible aliases
export type MiloRequest = ArthurRequest;
export type MiloDecision = ArthurDecision;
export type MiloRequestInput = ArthurRequestInput;
