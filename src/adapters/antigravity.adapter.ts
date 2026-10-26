import { AgentAdapter } from './adapter.interface.js';
import { MiloDecision, MiloRequestInput, ActionType } from '../core/types.js';

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

export class AntigravityAdapter implements AgentAdapter<AntigravityPreToolPayload, AntigravityHookResponse> {
  readonly agentName = 'antigravity';

  parseInput(rawInput: AntigravityPreToolPayload): MiloRequestInput {
    const toolCall = rawInput.toolCall || { name: 'unknown', args: {} };
    const toolName = toolCall.name || 'unknown';
    const args = toolCall.args || {};

    let actionType: ActionType = 'generic';
    let summary = `Tool: ${toolName}`;
    let description = `Execute tool ${toolName}`;

    switch (toolName) {
      case 'run_command': {
        actionType = 'command';
        const cmd = args.CommandLine || args.command || '(empty command)';
        summary = `Execute shell command: ${cmd}`;
        description = `Command: ${cmd}\nTool Summary: ${args.toolSummary || 'N/A'}`;
        break;
      }
      case 'write_file': {
        actionType = 'file_write';
        const path = args.Path || args.path || '(unknown path)';
        const size = typeof args.Content === 'string' ? `${args.Content.length} chars` : 'N/A';
        summary = `Write file: ${path}`;
        description = `Write to file: ${path} (Size: ${size})\nOverwrite: ${args.Overwrite ? 'yes' : 'no'}`;
        break;
      }
      case 'edit_file': {
        actionType = 'file_edit';
        const path = args.Path || args.path || '(unknown path)';
        summary = `Edit file: ${path}`;
        description = `Edit file: ${path}`;
        break;
      }
      default: {
        if (toolName.startsWith('browser_')) {
          actionType = 'browser';
        } else {
          actionType = 'generic';
        }
        summary = `Execute tool: ${toolName}`;
        description = `Tool: ${toolName} with arguments: ${JSON.stringify(args, null, 2)}`;
        break;
      }
    }

    return {
      agent: 'antigravity',
      actionType,
      toolName,
      summary,
      description,
      payload: args,
      context: {
        conversationId: rawInput.conversationId,
        stepIdx: rawInput.stepIdx,
        workspacePaths: rawInput.workspacePaths,
        transcriptPath: rawInput.transcriptPath,
        artifactDirectoryPath: rawInput.artifactDirectoryPath,
        modelName: rawInput.modelName,
        lastUserInput: rawInput.lastUserInput,
      },
    };
  }

  formatResponse(decision: MiloDecision, originalInput?: AntigravityPreToolPayload): AntigravityHookResponse {
    if (decision.decision === 'approved') {
      const response: AntigravityHookResponse = {
        decision: 'allow',
      };

      const toolName = originalInput?.toolCall?.name;
      const cmd = originalInput?.toolCall?.args?.CommandLine;
      if (toolName === 'run_command' && cmd) {
        response.permissionOverrides = [`command(${cmd})`];
      }

      if (decision.modifiedPayload) {
        response.overwrite = decision.modifiedPayload;
      }
      return response;
    }

    return {
      decision: 'deny',
      reason: decision.reason || 'Action rejected by human operator in Milo approval layer.',
    };
  }
}
