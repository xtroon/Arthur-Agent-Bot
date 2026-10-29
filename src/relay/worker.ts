/**
 * Arthur Official Bot Relay (Cloudflare Worker / Express compatible)
 *
 * This server acts as the single central webhook for @ArthurAgentBot.
 * It manages pairing codes (e.g. ART-1234) and delivers push notifications
 * to user phones without requiring any user to talk to @BotFather.
 */

export interface SessionData {
  sessionId: string;
  pairingCode: string;
  chatId?: string;
  username?: string;
  createdAt: number;
  lastActive: number;
}

export interface PendingApproval {
  requestId: string;
  toolName: string;
  summary: string;
  riskLevel: string;
  agentName: string;
  details?: string;
  resolve?: (decision: { decision: 'approved' | 'rejected'; reason?: string; byUser?: string }) => void;
  telegramMessageId?: number;
}

export class ArthurRelayService {
  private sessions = new Map<string, SessionData>(); // sessionId -> SessionData
  private codeToSession = new Map<string, string>(); // pairingCode -> sessionId
  private chatToSession = new Map<string, string>(); // chatId -> sessionId
  private pendingRequests = new Map<string, PendingApproval>(); // requestId -> PendingApproval

  constructor(private botToken: string = process.env.TELEGRAM_BOT_TOKEN || '') {}

  createSession(): { sessionId: string; pairingCode: string; pairingUrl: string; botUsername: string } {
    const sessionId = `sess_${Math.random().toString(36).substring(2, 12)}`;
    const pairingCode = `ART-${Math.floor(1000 + Math.random() * 9000)}`;
    const botUser = process.env.ARTHUR_BOT_NAME || 'ArthurAgentBot';

    const session: SessionData = {
      sessionId,
      pairingCode,
      createdAt: Date.now(),
      lastActive: Date.now(),
    };

    this.sessions.set(sessionId, session);
    this.codeToSession.set(pairingCode, sessionId);

    return {
      sessionId,
      pairingCode,
      botUsername: botUser,
      pairingUrl: `https://t.me/${botUser}?start=${pairingCode}`,
    };
  }

  getSession(sessionId: string): SessionData | undefined {
    return this.sessions.get(sessionId);
  }

  async handleTelegramWebhook(update: any): Promise<boolean> {
    // 1. User clicked Start with pairing code: /start ART-1234
    if (update.message?.text?.startsWith('/start')) {
      const parts = update.message.text.trim().split(/\s+/);
      const code = parts[1];
      const chatId = String(update.message.chat.id);
      const username = update.message.from?.username || update.message.from?.first_name || 'Operator';

      if (code && this.codeToSession.has(code)) {
        const sessionId = this.codeToSession.get(code)!;
        const session = this.sessions.get(sessionId);
        if (session) {
          session.chatId = chatId;
          session.username = username;
          session.lastActive = Date.now();
          this.chatToSession.set(chatId, sessionId);

          await this.sendTelegram(chatId, `🎉 <b>Phone Paired Successfully!</b>\n\n🛡️ Welcome, ${username}! Your machine is connected.\nEvery important action from your AI agents will arrive here for 1-tap approval.`);
          return true;
        }
      } else {
        await this.sendTelegram(chatId, `🛡️ <b>Arthur Approval Bot</b>\n\nTo pair your machine, run your AI agent or use the magic link provided on your computer.`);
        return true;
      }
    }

    // 2. User tapped Approve or Reject button
    if (update.callback_query?.data) {
      const { id: callbackId, data, from, message } = update.callback_query;
      const userTag = from.username ? `@${from.username}` : from.first_name || 'Operator';

      const [action, reqId] = data.split(':');
      const pending = this.pendingRequests.get(reqId);

      if (pending && pending.resolve) {
        const isApproved = action === 'approve';
        pending.resolve({
          decision: isApproved ? 'approved' : 'rejected',
          reason: isApproved ? `Approved by ${userTag}` : `Rejected by ${userTag}`,
          byUser: userTag,
        });

        this.pendingRequests.delete(reqId);
        await this.answerCallback(callbackId, isApproved ? 'Approved! ✅' : 'Rejected! ❌');

        // Edit Telegram message
        if (message?.chat?.id && message?.message_id) {
          const statusText = isApproved
            ? `✅ <b>APPROVED</b> by ${userTag}`
            : `❌ <b>REJECTED</b> by ${userTag}`;
          await this.editTelegram(message.chat.id, message.message_id, `🛡️ <b>Arthur Approval</b>\n\n📋 <b>Action:</b> ${pending.summary}\n\n${statusText}`);
        }
        return true;
      } else {
        await this.answerCallback(callbackId, 'Request already completed.');
      }
    }

    // 3. User replied to message with text steering
    if (update.message?.reply_to_message?.message_id && update.message.text) {
      const repliedMsgId = update.message.reply_to_message.message_id;
      const chatId = String(update.message.chat.id);
      const feedback = update.message.text.trim();

      // Find matching pending request
      for (const [reqId, req] of this.pendingRequests.entries()) {
        if (req.telegramMessageId === repliedMsgId && req.resolve) {
          req.resolve({
            decision: 'rejected',
            reason: `Operator guidance: "${feedback}"`,
            byUser: update.message.from?.username || 'Operator',
          });
          this.pendingRequests.delete(reqId);
          await this.sendTelegram(chatId, `🔄 <b>Guidance delivered to agent:</b>\n<i>"${feedback}"</i>`);
          return true;
        }
      }
    }

    return false;
  }

  async sendApproval(sessionId: string, req: PendingApproval): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.chatId) return false;

    const riskBadge =
      req.riskLevel === 'high'
        ? '🔴 <b>HIGH RISK</b>'
        : req.riskLevel === 'medium'
        ? '🟡 <b>MEDIUM RISK</b>'
        : '🟢 <b>LOW RISK</b>';

    const messageText = [
      `🛡️ <b>Arthur Agent Approval</b>`,
      ``,
      `🤖 <b>Agent:</b> <code>${req.agentName}</code>`,
      `⚡ <b>Tool:</b> <code>${req.toolName}</code>`,
      `📋 <b>Action:</b> ${req.summary}`,
      req.details ? `\n<code>${req.details}</code>\n` : '',
      `⚠️ <b>Risk:</b> ${riskBadge}`,
      ``,
      `<i>👉 Tap a button to decide, or reply with text to steer the agent.</i>`,
    ].filter(Boolean).join('\n');

    const sent = await this.sendTelegram(session.chatId, messageText, {
      inline_keyboard: [
        [
          { text: 'Approve ✅', callback_data: `approve:${req.requestId}` },
          { text: 'Reject ❌', callback_data: `reject:${req.requestId}` },
        ],
      ],
    });

    if (sent?.result?.message_id) {
      req.telegramMessageId = sent.result.message_id;
      this.pendingRequests.set(req.requestId, req);
      return true;
    }

    return false;
  }

  private async sendTelegram(chatId: string | number, text: string, replyMarkup?: any): Promise<any> {
    if (!this.botToken) return null;
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      }),
    });
    return res.json();
  }

  private async editTelegram(chatId: string | number, messageId: number, text: string): Promise<any> {
    if (!this.botToken) return null;
    const url = `https://api.telegram.org/bot${this.botToken}/editMessageText`;
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'HTML',
      }),
    });
  }

  private async answerCallback(callbackId: string, text: string): Promise<any> {
    if (!this.botToken) return null;
    const url = `https://api.telegram.org/bot${this.botToken}/answerCallbackQuery`;
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackId, text }),
    });
  }
}
