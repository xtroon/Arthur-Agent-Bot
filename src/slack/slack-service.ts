import { RequestManager } from '../core/request-manager.js';
import { MiloRequest, MiloDecision } from '../core/types.js';
import { SlackConfig, SlackBlockActionPayload, SlackMessageRecord } from './types.js';
import { SlackBlockBuilder } from './block-builder.js';
import { SlackClient } from './slack-client.js';

export class SlackService {
  private config: SlackConfig;
  private client: SlackClient;
  private requestManager: RequestManager;
  private messageRecords = new Map<string, SlackMessageRecord>();

  constructor(requestManager: RequestManager, config?: Partial<SlackConfig>) {
    this.requestManager = requestManager;

    const envBotToken = process.env.SLACK_BOT_TOKEN;
    const envSigningSecret = process.env.SLACK_SIGNING_SECRET;
    const envChannelId = process.env.SLACK_CHANNEL_ID;
    const envEnabled = process.env.SLACK_ENABLED !== 'false';

    this.config = {
      botToken: config?.botToken || envBotToken,
      signingSecret: config?.signingSecret || envSigningSecret,
      channelId: config?.channelId || envChannelId,
      enabled: config?.enabled ?? (Boolean(envBotToken && envChannelId) && envEnabled),
    };

    this.client = new SlackClient(this.config.botToken);
    this.registerEventListeners();
  }

  isConfigured(): boolean {
    return Boolean(this.config.enabled && this.config.botToken && this.config.channelId);
  }

  getSigningSecret(): string | undefined {
    return this.config.signingSecret;
  }

  setMockClient(mockClient: SlackClient) {
    this.client = mockClient;
  }

  private registerEventListeners() {
    this.requestManager.on('request_created', (request: MiloRequest) => {
      this.handleRequestCreated(request).catch((err) => {
        console.error(`[Milo Slack] Failed to post request notification: ${err.message}`);
      });
    });

    this.requestManager.on('request_resolved', ({ request, decision }: { request: MiloRequest; decision: MiloDecision }) => {
      this.handleRequestResolved(request, decision).catch((err) => {
        console.error(`[Milo Slack] Failed to update request status: ${err.message}`);
      });
    });
  }

  async handleRequestCreated(request: MiloRequest): Promise<void> {
    if (!this.isConfigured() || !this.config.channelId) {
      return;
    }

    const { text, blocks } = SlackBlockBuilder.buildApprovalMessage(request);
    const res = await this.client.postMessage(this.config.channelId, text, blocks);

    if (res.ts) {
      this.messageRecords.set(request.id, {
        channelId: this.config.channelId,
        messageTs: res.ts,
        requestId: request.id,
      });
    }
  }

  async handleRequestResolved(request: MiloRequest, decision: MiloDecision, resolverName?: string): Promise<void> {
    const record = this.messageRecords.get(request.id);
    if (!record || !this.isConfigured()) {
      return;
    }

    const { text, blocks } = SlackBlockBuilder.buildResolvedMessage(request, decision, resolverName);
    await this.client.updateMessage(record.channelId, record.messageTs, text, blocks);
  }

  /**
   * Handles incoming interactive actions (button clicks) from Slack.
   * Prevents duplicate decisions and handles expired requests safely.
   */
  async handleInteraction(payload: SlackBlockActionPayload): Promise<{
    handled: boolean;
    decision?: 'approved' | 'rejected';
    requestId?: string;
    message: string;
    updatedBlocks?: any[];
  }> {
    if (payload.type !== 'block_actions' || !payload.actions || payload.actions.length === 0) {
      return { handled: false, message: 'Ignored non-block action payload' };
    }

    const action = payload.actions[0];
    const requestId = action.value;
    const isApprove = action.action_id === 'milo_approve';
    const isReject = action.action_id === 'milo_reject';

    if (!isApprove && !isReject) {
      return { handled: false, message: `Unknown action_id: ${action.action_id}` };
    }

    const targetDecision = isApprove ? 'approved' : 'rejected';
    const userName = payload.user?.name || payload.user?.username || 'Slack Operator';

    const existingRequest = this.requestManager.getRequest(requestId);
    if (!existingRequest) {
      return {
        handled: true,
        requestId,
        message: '⚠️ Request not found or expired from memory.',
      };
    }

    if (existingRequest.status !== 'pending') {
      const statusText = existingRequest.status.toUpperCase();
      return {
        handled: true,
        requestId,
        message: `⚠️ This request was already resolved as ${statusText}.`,
      };
    }

    // Submit decision to existing Milo approval workflow
    const reason = `Resolved via Slack by @${userName}`;
    const success = this.requestManager.resolveRequest(requestId, targetDecision, reason);

    if (!success) {
      return {
        handled: true,
        requestId,
        message: '⚠️ Could not resolve request (conflict or already resolved).',
      };
    }

    const updated = this.requestManager.getRequest(requestId)!;
    const resolvedBlocks = SlackBlockBuilder.buildResolvedMessage(
      updated,
      { requestId, decision: targetDecision, reason },
      `@${userName}`
    );

    // If response_url is present, update the message immediately via response_url
    if (payload.response_url) {
      this.client.respondToUrl(payload.response_url, {
        text: resolvedBlocks.text,
        blocks: resolvedBlocks.blocks,
      }).catch((err) => {
        console.warn(`[Milo Slack] response_url update notice: ${err.message}`);
      });
    }

    return {
      handled: true,
      decision: targetDecision,
      requestId,
      message: `✅ Successfully ${targetDecision} request ${requestId.slice(0, 8)}!`,
      updatedBlocks: resolvedBlocks.blocks,
    };
  }
}
