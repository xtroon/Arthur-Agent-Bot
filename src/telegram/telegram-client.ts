import {
  TelegramMessage,
  TelegramSendOptions,
  TelegramUpdate,
  TelegramUser,
} from './types.js';

export class TelegramClient {
  private baseUrl: string;

  constructor(private token: string) {
    this.baseUrl = `https://api.telegram.org/bot${this.token}`;
  }

  private async request<T>(endpoint: string, body?: Record<string, any>): Promise<T> {
    const url = `${this.baseUrl}/${endpoint}`;
    const options: RequestInit = {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    };

    const res = await fetch(url, options);
    const data = (await res.json()) as { ok: boolean; result?: T; description?: string };

    if (!data.ok) {
      throw new Error(`Telegram API Error (${endpoint}): ${data.description || 'Unknown error'}`);
    }

    return data.result as T;
  }

  async getMe(): Promise<TelegramUser> {
    return this.request<TelegramUser>('getMe');
  }

  async sendMessage(
    chatId: string | number,
    text: string,
    options?: TelegramSendOptions
  ): Promise<TelegramMessage> {
    return this.request<TelegramMessage>('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: options?.parse_mode || 'HTML',
      reply_markup: options?.reply_markup,
    });
  }

  async editMessageText(
    chatId: string | number,
    messageId: number,
    text: string,
    options?: TelegramSendOptions
  ): Promise<TelegramMessage | boolean> {
    return this.request<TelegramMessage | boolean>('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: options?.parse_mode || 'HTML',
      reply_markup: options?.reply_markup,
    });
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<boolean> {
    return this.request<boolean>('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
      show_alert: false,
    });
  }

  async getUpdates(offset?: number, timeout: number = 30): Promise<TelegramUpdate[]> {
    return this.request<TelegramUpdate[]>('getUpdates', {
      offset,
      timeout,
      allowed_updates: ['message', 'callback_query'],
    });
  }
}

