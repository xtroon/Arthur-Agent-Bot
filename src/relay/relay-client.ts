import { ArthurGlobalConfig, loadArthurConfig, saveArthurConfig } from '../core/config.js';

export interface PairingSession {
  sessionId: string;
  pairingCode: string;
  botUsername: string;
  pairingUrl: string;
  isPaired: boolean;
}

export interface RelayDecision {
  decision: 'approved' | 'rejected';
  reason?: string;
  byUser?: string;
}

export class RelayClient {
  private relayUrl: string;

  constructor(relayUrl?: string) {
    const config = loadArthurConfig();
    this.relayUrl = (relayUrl || process.env.ARTHUR_RELAY_URL || config.relayUrl || 'https://relay.arthur-agent.dev').replace(/\/+$/, '');
  }

  async getOrCreatePairingSession(): Promise<PairingSession | null> {
    const config = loadArthurConfig();
    const botUser = process.env.ARTHUR_BOT_NAME || 'ArthurAgentBot';

    // If already paired with a session, check if it is active
    if (config.pairedSessionId) {
      try {
        const res = await fetch(`${this.relayUrl}/session/${config.pairedSessionId}/status`, {
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const data = (await res.json()) as any;
          if (data.isPaired) {
            return {
              sessionId: config.pairedSessionId,
              pairingCode: config.pairingCode || '',
              botUsername: botUser,
              pairingUrl: `https://t.me/${botUser}?start=${config.pairingCode}`,
              isPaired: true,
            };
          }
        }
      } catch {
        // Fall through to generate or reuse pairing code
      }
    }

    // Create a new session or pairing code
    try {
      const res = await fetch(`${this.relayUrl}/session/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientVersion: '0.2.0',
          existingSessionId: config.pairedSessionId,
        }),
        signal: AbortSignal.timeout(3500),
      });

      if (res.ok) {
        const data = (await res.json()) as PairingSession;
        saveArthurConfig({
          pairedSessionId: data.sessionId,
          pairingCode: data.pairingCode,
        });
        return data;
      }
    } catch (err: any) {
      // If public relay is offline, generate a local simulated pairing structure
    }

    // Local deterministic fallback pairing code
    const fallbackCode = config.pairingCode || `ART-${Math.floor(1000 + Math.random() * 9000)}`;
    const fallbackSession = config.pairedSessionId || `sess-${Date.now()}`;
    saveArthurConfig({
      pairedSessionId: fallbackSession,
      pairingCode: fallbackCode,
    });

    return {
      sessionId: fallbackSession,
      pairingCode: fallbackCode,
      botUsername: botUser,
      pairingUrl: `https://t.me/${botUser}?start=${fallbackCode}`,
      isPaired: false,
    };
  }

  async sendApprovalRequest(payload: {
    toolName: string;
    summary: string;
    riskLevel: string;
    agentName: string;
    details?: string;
    timeoutSec?: number;
  }): Promise<RelayDecision | null> {
    const config = loadArthurConfig();
    if (!config.pairedSessionId) return null;

    try {
      const res = await fetch(`${this.relayUrl}/session/${config.pairedSessionId}/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout((payload.timeoutSec || 120) * 1000 + 5000),
      });

      if (res.ok) {
        return (await res.json()) as RelayDecision;
      }
    } catch {
      // Timeout or offline
    }

    return null;
  }
}

export const defaultRelayClient = new RelayClient();
