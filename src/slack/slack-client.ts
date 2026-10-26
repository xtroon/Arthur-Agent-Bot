export interface SlackApiResponse {
  ok: boolean;
  ts?: string;
  channel?: string;
  error?: string;
  [key: string]: any;
}

export class SlackClient {
  private botToken?: string;

  constructor(botToken?: string) {
    this.botToken = botToken;
  }

  setToken(token: string) {
    this.botToken = token;
  }

  /**
   * Posts a message to a Slack channel using the official chat.postMessage API.
   */
  async postMessage(channel: string, text: string, blocks?: any[]): Promise<SlackApiResponse> {
    if (!this.botToken) {
      throw new Error('SlackClient: botToken is not configured');
    }

    const payload = {
      channel,
      text,
      blocks,
    };

    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${this.botToken}`,
      },
      body: JSON.stringify(payload),
    });

    const data = (await res.json()) as SlackApiResponse;
    if (!data.ok) {
      throw new Error(`Slack API error (chat.postMessage): ${data.error || 'Unknown error'}`);
    }

    return data;
  }

  /**
   * Updates an existing Slack message using the official chat.update API.
   */
  async updateMessage(channel: string, ts: string, text: string, blocks?: any[]): Promise<SlackApiResponse> {
    if (!this.botToken) {
      throw new Error('SlackClient: botToken is not configured');
    }

    const payload = {
      channel,
      ts,
      text,
      blocks,
    };

    const res = await fetch('https://slack.com/api/chat.update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${this.botToken}`,
      },
      body: JSON.stringify(payload),
    });

    const data = (await res.json()) as SlackApiResponse;
    if (!data.ok) {
      throw new Error(`Slack API error (chat.update): ${data.error || 'Unknown error'}`);
    }

    return data;
  }

  /**
   * Directly updates a message via response_url provided in interactive payloads.
   */
  async respondToUrl(responseUrl: string, payload: { text?: string; blocks?: any[]; replace_original?: boolean }): Promise<void> {
    const res = await fetch(responseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        replace_original: true,
        ...payload,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Slack response_url error (${res.status}): ${errText}`);
    }
  }
}
