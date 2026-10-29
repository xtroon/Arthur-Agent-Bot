import { RequestManager } from '../core/request-manager.js';
import { ArthurRequest } from '../core/types.js';
import { TelegramClient } from './telegram-client.js';
import { TelegramUpdate } from './types.js';

export class TelegramService {
  private client: TelegramClient | null = null;
  private botToken: string;
  private chatId: string;
  private isPolling = false;
  private stopPollingSignal = false;
  private lastUpdateId = 0;

  // Track mapping: messageId -> requestId, and requestId -> messageId
  private messageToRequest = new Map<number, string>();
  private requestToMessage = new Map<string, number>();

  constructor(
    private requestManager: RequestManager,
    botToken?: string,
    chatId?: string
  ) {
    this.botToken = botToken || process.env.TELEGRAM_BOT_TOKEN || '';
    this.chatId = chatId || process.env.TELEGRAM_CHAT_ID || '';

    if (this.botToken) {
      this.client = new TelegramClient(this.botToken);
    }

    this.bindEvents();
  }

  isConfigured(): boolean {
    return Boolean(this.botToken && this.chatId && this.client);
  }

  getBotToken(): string {
    return this.botToken;
  }

  getChatId(): string {
    return this.chatId;
  }

  private bindEvents(): void {
    this.requestManager.on('request_created', (req: ArthurRequest) => {
      this.notifyRequest(req).catch((err) => {
        console.error(`[Arthur Telegram] Failed to send notification: ${err.message}`);
      });
    });

    this.requestManager.on('request_resolved', ({ request, decision }) => {
      this.updateResolvedMessage(request.id, decision.decision, decision.reason).catch(() => {});
    });
  }

  async startPolling(): Promise<void> {
    if (!this.isConfigured() || this.isPolling) {
      return;
    }

    this.isPolling = true;
    this.stopPollingSignal = false;
    console.log(`[Arthur Telegram] Bot polling started for chat ID: ${this.chatId}`);

    while (!this.stopPollingSignal) {
      try {
        const updates = await this.client!.getUpdates(this.lastUpdateId + 1, 25);
        for (const update of updates) {
          this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id);
          await this.handleUpdate(update);
        }
      } catch (err: any) {
        if (!this.stopPollingSignal) {
          console.warn(`[Arthur Telegram] Polling error: ${err.message}. Retrying in 3s...`);
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    }

    this.isPolling = false;
    console.log('[Arthur Telegram] Polling stopped.');
  }

  stopPolling(): void {
    this.stopPollingSignal = true;
  }

  private escapeHtml(str: string): string {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private async notifyRequest(req: ArthurRequest): Promise<void> {
    if (!this.client || !this.chatId) return;

    const riskBadge =
      req.riskLevel === 'high'
        ? '🔴 <b>HIGH RISK</b>'
        : req.riskLevel === 'medium'
        ? '🟡 <b>MEDIUM RISK</b>'
        : '🟢 <b>LOW RISK</b>';

    const cleanSummary = this.escapeHtml(req.summary);
    const cleanAgent = this.escapeHtml(req.agent);
    const cleanTool = this.escapeHtml(req.toolName);

    let detailsText = '';
    if (req.payload?.CommandLine) {
      detailsText = `\n<code>${this.escapeHtml(req.payload.CommandLine)}</code>\n`;
    } else if (req.payload?.Path) {
      detailsText = `\n📄 <b>Path:</b> <code>${this.escapeHtml(req.payload.Path)}</code>\n`;
    }

    const messageText = [
      `🛡️ <b>Arthur Agent Approval</b>`,
      ``,
      `🤖 <b>Agent:</b> <code>${cleanAgent}</code>`,
      `⚡ <b>Tool:</b> <code>${cleanTool}</code>`,
      `📋 <b>Action:</b> ${cleanSummary}`,
      detailsText,
      `⚠️ <b>Risk:</b> ${riskBadge}`,
      ``,
      `<i>👉 Tap a button to decide, or reply with text to guide the agent.</i>`,
    ]
      .filter((line) => line !== undefined)
      .join('\n');

    const sent = await this.client.sendMessage(this.chatId, messageText, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Approve ✅', callback_data: `approve:${req.id}` },
            { text: 'Reject ❌', callback_data: `reject:${req.id}` },
          ],
        ],
      },
    });

    this.messageToRequest.set(sent.message_id, req.id);
    this.requestToMessage.set(req.id, sent.message_id);
  }

  private async updateResolvedMessage(
    requestId: string,
    decision: 'approved' | 'rejected',
    reason?: string
  ): Promise<void> {
    const messageId = this.requestToMessage.get(requestId);
    if (!messageId || !this.client || !this.chatId) return;

    const req = this.requestManager.getRequest(requestId);
    const cleanSummary = this.escapeHtml(req?.summary || 'Action');
    const timeStr = new Date().toLocaleTimeString();

    let statusLine = '';
    if (decision === 'approved') {
      statusLine = `✅ <b>APPROVED</b> at ${timeStr}`;
    } else {
      statusLine = `❌ <b>REJECTED</b> at ${timeStr}`;
      if (reason) {
        statusLine += `\n💬 <i>Reason: ${this.escapeHtml(reason)}</i>`;
      }
    }

    const updatedText = [
      `🛡️ <b>Arthur Agent Approval</b>`,
      ``,
      `📋 <b>Action:</b> ${cleanSummary}`,
      ``,
      statusLine,
    ].join('\n');

    try {
      await this.client.editMessageText(this.chatId, messageId, updatedText, {
        parse_mode: 'HTML',
      });
    } catch {
      // Ignore if edit fails (e.g. message too old or identical)
    }
  }

  private async handleUpdate(update: TelegramUpdate): Promise<void> {
    // 1. Button click (Callback Query)
    if (update.callback_query && update.callback_query.data) {
      const { id: callbackId, data, from } = update.callback_query;
      const userTag = from.username ? `@${from.username}` : from.first_name || 'Operator';

      if (data.startsWith('approve:')) {
        const reqId = data.replace('approve:', '');
        const success = this.requestManager.resolveRequest(reqId, 'approved', `Approved by ${userTag}`);
        await this.client?.answerCallbackQuery(callbackId, success ? 'Approved! ✅' : 'Already decided.');
      } else if (data.startsWith('reject:')) {
        const reqId = data.replace('reject:', '');
        const success = this.requestManager.resolveRequest(
          reqId,
          'rejected',
          `Rejected by ${userTag} via Telegram`
        );
        await this.client?.answerCallbackQuery(callbackId, success ? 'Rejected! ❌' : 'Already decided.');
      }
      return;
    }

    // 2. Text message reply (Two-Way Steering)
    if (update.message && update.message.reply_to_message && update.message.text) {
      const repliedMsgId = update.message.reply_to_message.message_id;
      const reqId = this.messageToRequest.get(repliedMsgId);
      const feedback = update.message.text.trim();

      if (reqId) {
        const success = this.requestManager.resolveRequest(
          reqId,
          'rejected',
          `Operator guidance: "${feedback}"`
        );

        if (success) {
          await this.client?.sendMessage(
            this.chatId,
            `🔄 <b>Guidance delivered to agent:</b>\n<i>"${this.escapeHtml(feedback)}"</i>`,
            { parse_mode: 'HTML' }
          );
        }
      }
    }
  }

  async sendTestMessage(): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      await this.client!.sendMessage(
        this.chatId,
        `🎉 <b>Arthur is successfully connected!</b>\n\nEvery important action from your AI agents will be sent here for 1-tap approval.`,
        { parse_mode: 'HTML' }
      );
      return true;
    } catch (err: any) {
      console.error(`[Arthur Telegram] Test message failed: ${err.message}`);
      return false;
    }
  }
}

