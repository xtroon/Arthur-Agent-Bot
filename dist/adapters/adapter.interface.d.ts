import { MiloDecision, MiloRequestInput } from '../core/types.js';
export interface AgentAdapter<TRawInput = any, TRawOutput = any> {
    readonly agentName: string;
    parseInput(rawInput: TRawInput): MiloRequestInput;
    formatResponse(decision: MiloDecision, originalInput?: TRawInput): TRawOutput;
}
