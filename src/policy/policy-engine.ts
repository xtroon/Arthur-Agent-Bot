import { ActionType, RiskLevel } from '../core/types.js';

export interface PolicyEvaluation {
  action: 'auto_allow' | 'require_approval';
  riskLevel: RiskLevel;
  reason: string;
  humanSummary: string;
}

// Regex list of commands that are critical/dangerous (High Risk)
const HIGH_RISK_PATTERNS = [
  /\b(rm\s+-rf|rmdir\s+\/s|del\s+\/f|rimraf|Remove-Item\s+-Recurse)\b/i,
  /\b(rm|del|rmdir|unlink)\b/i,
  /\bgit\s+(push|reset\s+--hard|clean\s+-f|rebase|restore)\b/i,
  /\b(drop\s+database|drop\s+table|truncate\s+table)\b/i,
  /\b(chmod|chown|kill|pkill|taskkill)\b/i,
  /\.env(\.|$|\s)/i,
  /\b(id_rsa|id_ed25519|secrets?|credentials?|password)\b/i,
  /\b(curl|wget|Invoke-WebRequest|nc|ncat)\b/i,
];

// Regex list of commands that are 100% safe to auto-approve without disturbing the user
const SAFE_READ_ONLY_PATTERNS = [
  // Git read-only
  /^git\s+(status|diff|log|branch|show|remote\s+-v|tag|rev-parse|ls-files|describe)/i,
  // File inspection
  /^(ls|dir|pwd|cd)\b/i,
  /^(cat|head|tail|more|less|type|Get-Content)\b/i,
  /^(grep|findstr|awk|wc)\b/i,
  /^(which|where|whoami|echo)\b/i,
  // Version checks
  /^(node|npm|npx|pnpm|yarn|python|python3|pip|tsc|git|cargo|rustc|go|docker)\s+(--version|-v|-V)\b/i,
  /^git\s+--version/i,
];

export class PolicyEngine {
  evaluate(
    toolName: string,
    actionType: ActionType,
    payload: Record<string, any>
  ): PolicyEvaluation {
    // 1. File Writes & Edits are always important modifications
    if (toolName === 'write_file' || toolName === 'edit_file' || actionType === 'file_write' || actionType === 'file_edit') {
      const filePath = payload.Path || payload.path || 'unknown file';
      const isSensitive = /\.env|secret|credentials|key/i.test(filePath);

      return {
        action: 'require_approval',
        riskLevel: isSensitive ? 'high' : 'medium',
        reason: isSensitive
          ? `Attempting to modify sensitive file: ${filePath}`
          : `Code modification on: ${filePath}`,
        humanSummary: `Editing file: ${filePath}`,
      };
    }

    // 2. Shell Commands
    if (toolName === 'run_command' || actionType === 'command') {
      const rawCommand = (payload.CommandLine || payload.command || '').trim();

      // Check if command is completely empty
      if (!rawCommand) {
        return {
          action: 'auto_allow',
          riskLevel: 'low',
          reason: 'Empty command',
          humanSummary: 'Empty command',
        };
      }

      // 1st PRIORITY: Check High Risk / Sensitive patterns first!
      for (const pattern of HIGH_RISK_PATTERNS) {
        if (pattern.test(rawCommand)) {
          return {
            action: 'require_approval',
            riskLevel: 'high',
            reason: `High-risk destructive/security command: ${rawCommand}`,
            humanSummary: `⚠️ Dangerous command: ${rawCommand}`,
          };
        }
      }

      // 2nd PRIORITY: Safe Read-Only commands -> AUTO-ALLOW!
      for (const pattern of SAFE_READ_ONLY_PATTERNS) {
        if (pattern.test(rawCommand)) {
          return {
            action: 'auto_allow',
            riskLevel: 'low',
            reason: `Auto-approved safe inspection command: ${rawCommand}`,
            humanSummary: `Safe read: ${rawCommand}`,
          };
        }
      }

      // Medium Risk: Package managers, builds, tests, general scripts
      let humanSummary = `Run command: ${rawCommand}`;
      if (/npm\s+(install|i|add)|yarn\s+add|pnpm\s+add|pip\s+install/i.test(rawCommand)) {
        humanSummary = `📦 Installing packages: ${rawCommand}`;
      } else if (/npm\s+run\s+build|tsc/i.test(rawCommand)) {
        humanSummary = `🔨 Building project: ${rawCommand}`;
      } else if (/git\s+commit/i.test(rawCommand)) {
        humanSummary = `📝 Committing git changes: ${rawCommand}`;
      }

      return {
        action: 'require_approval',
        riskLevel: 'medium',
        reason: `Command execution requires approval: ${rawCommand}`,
        humanSummary,
      };
    }

    // Default for any other tools
    return {
      action: 'require_approval',
      riskLevel: 'medium',
      reason: `Tool execution requires approval: ${toolName}`,
      humanSummary: `Tool call: ${toolName}`,
    };
  }
}

export const defaultPolicyEngine = new PolicyEngine();
