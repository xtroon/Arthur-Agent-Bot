import { MiloRequest, MiloDecision } from '../core/types.js';

export class SlackBlockBuilder {
  /**
   * Builds an interactive Block Kit message with Approve & Reject buttons.
   */
  static buildApprovalMessage(request: MiloRequest): { text: string; blocks: any[] } {
    let payloadPreview = '';
    if (request.actionType === 'command') {
      payloadPreview = request.payload?.CommandLine || request.payload?.command || JSON.stringify(request.payload, null, 2);
    } else if (request.actionType === 'file_write' || request.actionType === 'file_edit') {
      const path = request.payload?.Path || request.payload?.path || 'file';
      const content = request.payload?.Content || request.payload?.Replacement || '(content preview)';
      payloadPreview = `Path: ${path}\n\n${content.slice(0, 500)}${content.length > 500 ? '\n... (truncated)' : ''}`;
    } else {
      payloadPreview = JSON.stringify(request.payload, null, 2);
    }

    const fallbackText = `🛡️ [Milo] Approval Required: ${request.summary} (ID: ${request.id})`;

    const blocks: any[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🛡️ Milo Approval Required',
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Agent:*\n${request.agent}`,
          },
          {
            type: 'mrkdwn',
            text: `*Action:*\n\`${request.actionType}\``,
          },
          {
            type: 'mrkdwn',
            text: `*Tool:*\n\`${request.toolName}\``,
          },
          {
            type: 'mrkdwn',
            text: `*Request ID:*\n\`${request.id.slice(0, 8)}...\``,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Summary:*\n${request.summary}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Payload:*\n\`\`\`${payloadPreview.replace(/```/g, "'''")}\`\`\``,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `📍 *Step:* ${request.context?.stepIdx ?? 'N/A'} | *Conv:* \`${request.context?.conversationId ? request.context.conversationId.slice(0, 8) + '...' : 'N/A'}\` | *Time:* <!date^${Math.floor(new Date(request.createdAt).getTime() / 1000)}^{date_num} {time_secs}|${request.createdAt}>`,
          },
        ],
      },
      {
        type: 'divider',
      },
      {
        type: 'actions',
        block_id: `milo_actions_${request.id}`,
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Approve ✔️',
              emoji: true,
            },
            style: 'primary',
            action_id: 'milo_approve',
            value: request.id,
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Reject ✖️',
              emoji: true,
            },
            style: 'danger',
            action_id: 'milo_reject',
            value: request.id,
          },
        ],
      },
    ];

    return { text: fallbackText, blocks };
  }

  /**
   * Updates an existing Block Kit message to reflect the final decision status.
   */
  static buildResolvedMessage(
    request: MiloRequest,
    decision: MiloDecision,
    resolverName?: string
  ): { text: string; blocks: any[] } {
    const isApproved = decision.decision === 'approved';
    const statusEmoji = isApproved ? '✅' : decision.decision === 'rejected' && request.status === 'timed_out' ? '⚠️' : '❌';
    const statusText = isApproved
      ? `*APPROVED* by ${resolverName || 'operator'}`
      : request.status === 'timed_out'
      ? `*TIMED OUT* (Safe Deny)`
      : `*REJECTED* by ${resolverName || 'operator'}${decision.reason ? ` - _${decision.reason}_` : ''}`;

    const fallbackText = `${statusEmoji} [Milo] Request ${decision.decision.toUpperCase()}: ${request.summary}`;

    // Get original message structure without actions
    const base = this.buildApprovalMessage(request);
    const updatedBlocks = base.blocks.slice(0, 5); // Keep header, fields, summary, payload, context

    updatedBlocks.push({
      type: 'divider',
    });

    updatedBlocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${statusEmoji} ${statusText}\n_Resolved at ${new Date().toLocaleTimeString()}_`,
      },
    });

    return { text: fallbackText, blocks: updatedBlocks };
  }
}
