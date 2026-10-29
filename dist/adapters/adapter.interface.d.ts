import { ArthurDecision, ArthurRequestInput } from '../core/types.js';
export interface AgentAdapter<TRawInput = any, TRawOutput = any> {
    readonly agentName: string;
    parseInput(rawInput: TRawInput): ArthurRequestInput;
    formatResponse(decision: ArthurDecision, originalInput?: TRawInput): TRawOutput;
}
