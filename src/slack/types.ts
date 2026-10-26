export interface SlackConfig {
  botToken?: string;
  appToken?: string;
  signingSecret?: string;
  channelId?: string;
  enabled: boolean;
  socketMode?: boolean;
}

export interface SlackBlockActionPayload {
  type: string;
  user: {
    id: string;
    username: string;
    name?: string;
  };
  channel?: {
    id: string;
    name?: string;
  };
  actions: Array<{
    action_id: string;
    block_id?: string;
    value: string;
    type: string;
    action_ts?: string;
  }>;
  response_url?: string;
  message?: {
    ts: string;
    text?: string;
    blocks?: any[];
  };
  trigger_id?: string;
}

export interface SlackMessageRecord {
  channelId: string;
  messageTs: string;
  requestId: string;
}
