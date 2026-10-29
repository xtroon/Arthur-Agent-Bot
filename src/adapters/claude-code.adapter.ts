import { AgentAdapter } from './adapter.interface.js';
import { ArthurDecision, ArthurRequestInput, ActionType } from '../core/types.js';

export interface ClaudeCodeHookPayload {
  tool?: string;
  input?: Record<string, any>;
  session_id?: string;
  cwd?: string;
  [key: string]: any;
}

export interface ClaudeCodeHookResponse {
  decision: 'allow' | 'deny';
  reason?: string;
}

export class ClaudeCodeAdapter implements AgentAdapter<ClaudeCodeHookPayload, ClaudeCodeHookResponse> {
  readonly agentName = 'claude-code';

  parseInput(rawInput: ClaudeCodeHookPayload): ArthurRequestInput {
    const toolName = rawInput.tool || 'command';
    const input = rawInput.input || {};

    let actionType: ActionType = 'generic';
    let summary = `Tool: ${toolName}`;

    if (toolName === 'Bash' || toolName === 'execute' || toolName === 'run_command') {
      actionType = 'command';
      const cmd = input.command || input.CommandLine || '';
      summary = `Command: ${cmd}`;
    } else if (toolName === 'Edit' || toolName === 'Write' || toolName === 'write_file' || toolName === 'edit_file') {
      actionType = toolName === 'Edit' ? 'file_edit' : 'file_write';
      summary = `File: ${input.file_path || input.path || 'unknown'}`;
    }

    return {
      agent: 'claude-code',
      actionType,
      toolName,
      summary,
      description: `Claude Code requested: ${toolName}`,
      payload: input,
      context: {
        conversationId: rawInput.session_id,
        cwd: rawInput.cwd,
      },
    };
  }

  formatResponse(decision: ArthurDecision): ClaudeCodeHookResponse {
    return {
      decision: decision.decision === 'approved' ? 'allow' : 'deny',
      reason: decision.reason,
    };
  }
}

