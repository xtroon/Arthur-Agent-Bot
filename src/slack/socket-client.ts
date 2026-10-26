import { SlackBlockActionPayload } from './types.js';

export type InteractionHandler = (payload: SlackBlockActionPayload) => Promise<{
  handled: boolean;
  message: string;
  updatedBlocks?: any[];
}>;

export class SlackSocketClient {
  private appToken: string;
  private ws: any = null;
  private isRunning: boolean = false;
  private reconnectTimeout: any = null;
  private onInteraction?: InteractionHandler;

  constructor(appToken: string, onInteraction?: InteractionHandler) {
    this.appToken = appToken;
    this.onInteraction = onInteraction;
  }

  setInteractionHandler(handler: InteractionHandler) {
    this.onInteraction = handler;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    await this.connect();
  }

  stop(): void {
    this.isRunning = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
  }

  private async fetchWebSocketUrl(): Promise<string> {
    const res = await fetch('https://slack.com/api/apps.connections.open', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${this.appToken}`,
      },
    });

    const data = (await res.json()) as any;
    if (!data.ok || !data.url) {
      throw new Error(`Failed to open Slack Socket Mode connection: ${data.error || 'Unknown error'}`);
    }

    return data.url;
  }

  private async connect(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const wssUrl = await this.fetchWebSocketUrl();
      console.log('[Milo Slack Socket Mode] Connecting to Slack WebSocket gateway...');

      // Use built-in Node.js global WebSocket
      const WebSocketClass = (globalThis as any).WebSocket;
      if (!WebSocketClass) {
        throw new Error('Node.js native WebSocket is not available. Please ensure Node.js v18+ is used.');
      }

      const ws = new WebSocketClass(wssUrl);
      this.ws = ws;

      ws.onopen = () => {
        console.log('⚡ [Milo Slack Socket Mode] Connected & listening for approvals in real-time!');
      };

      ws.onmessage = async (event: any) => {
        try {
          const raw = typeof event.data === 'string' ? event.data : event.data.toString();
          const data = JSON.parse(raw);

          // Acknowledge envelope to Slack immediately
          if (data.envelope_id) {
            this.sendAck(ws, data.envelope_id);
          }

          // Handle interactive events (button clicks)
          if ((data.type === 'interactive' || data.payload?.type === 'block_actions') && this.onInteraction) {
            const payload: SlackBlockActionPayload = data.payload;
            const result = await this.onInteraction(payload);

            // If response accepts payload, send updated blocks back over socket
            if (data.accepts_response_payload && result.updatedBlocks) {
              this.sendAck(ws, data.envelope_id, {
                replace_original: true,
                blocks: result.updatedBlocks,
                text: result.message,
              });
            }
          }
        } catch (err: any) {
          console.error(`[Milo Slack Socket Mode] Error handling message: ${err.message}`);
        }
      };

      ws.onerror = (err: any) => {
        console.error(`[Milo Slack Socket Mode] WebSocket error: ${err.message || 'Connection error'}`);
      };

      ws.onclose = (event: any) => {
        if (!this.isRunning) return;
        console.warn(`[Milo Slack Socket Mode] Connection closed (code: ${event.code}). Reconnecting in 3s...`);
        this.scheduleReconnect(3000);
      };
    } catch (err: any) {
      console.error(`[Milo Slack Socket Mode] Connection setup failed: ${err.message}`);
      if (this.isRunning) {
        this.scheduleReconnect(5000);
      }
    }
  }

  private sendAck(ws: any, envelopeId: string, payload?: any) {
    try {
      const ackMsg: any = { envelope_id: envelopeId };
      if (payload) {
        ackMsg.payload = payload;
      }
      ws.send(JSON.stringify(ackMsg));
    } catch (e: any) {
      console.error(`[Milo Slack Socket Mode] Failed to send ACK: ${e.message}`);
    }
  }

  private scheduleReconnect(delayMs: number) {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delayMs);
  }
}
