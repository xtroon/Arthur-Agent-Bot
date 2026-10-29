import { AgentAdapter } from './adapter.interface.js';
import { ArthurDecision, ArthurRequestInput } from '../core/types.js';
export interface AntigravityPreToolPayload {
    toolCall?: {
        name: string;
        args?: Record<string, any>;
    };
    stepIdx?: number;
    conversationId?: string;
    workspacePaths?: string[];
    transcriptPath?: string;
    artifactDirectoryPath?: string;
    modelName?: string;
    lastUserInput?: string;
    [key: string]: any;
}
export interface AntigravityHookResponse {
    decision: 'allow' | 'deny' | 'ask' | 'force_ask';
    reason?: string;
    permissionOverrides?: string[];
    overwrite?: Record<string, any>;
}
export declare class AntigravityAdapter implements AgentAdapter<AntigravityPreToolPayload, AntigravityHookResponse> {
    readonly agentName = "antigravity";
    parseInput(rawInput: AntigravityPreToolPayload): ArthurRequestInput;
    formatResponse(decision: ArthurDecision, originalInput?: AntigravityPreToolPayload): AntigravityHookResponse;
}
