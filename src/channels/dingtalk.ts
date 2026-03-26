/**
 * DingTalk Channel Implementation for OmiClaw
 * Handles DingTalk bot communication using Stream Mode (WebSocket)
 * Self-registers via registerChannel() — no core file modifications required.
 *
 * Auto-registration: When a message arrives from an unregistered DingTalk chat,
 * the channel automatically registers the group, creates the folder & CLAUDE.md,
 * and delivers the message — no manual SQL or setup needed.
 */

import fs from 'fs';
import path from 'path';

import { STORE_DIR, ASSISTANT_NAME, GROUPS_DIR } from '../config.js';
import { storeChatMetadata, setRegisteredGroup } from '../db.js';
import { logger } from '../logger.js';
import {
  Channel,
  OnInboundMessage,
  OnChatMetadata,
  RegisteredGroup,
} from '../types.js';
import { buildDefaultGroupPrompt } from '../default-group-prompt.js';
import { registerChannel, ChannelOpts } from './registry.js';

// --- Types ---

interface DingTalkCredentials {
  clientId: string;
  clientSecret: string;
}

interface WebhookInfo {
  url: string;
  expiresAt: number;
}

// --- Constants ---

const DINGTALK_JID_PREFIX = 'dingtalk:';
const MAX_MESSAGE_LENGTH = 20000;
const WEBHOOK_EXPIRY_BUFFER = 60000; // 1 min buffer before actual expiry

const DEFAULT_CLAUDE_MD = `${buildDefaultGroupPrompt('DingTalk.')}

## DingTalk Formatting

Use markdown formatting for DingTalk messages:
- **Bold** (double asterisks)
- *Italic* (single asterisks)
- Bullet points
- Code blocks (triple backticks)
- > Blockquotes

Note: DingTalk markdown supports a subset of standard markdown.
Keep messages clear and well-structured.
`;

// --- DingTalkChannel class ---

export class DingTalkChannel implements Channel {
  name = 'dingtalk';

  private credentials: DingTalkCredentials | null = null;
  private client: any = null; // DWClient from dingtalk-stream
  private connected = false;
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;
  private webhooks = new Map<string, WebhookInfo>();

  private opts: ChannelOpts;

  constructor(opts: ChannelOpts) {
    this.opts = opts;
  }

  // --- Public Channel interface ---

  async connect(): Promise<void> {
    const credsPath = path.join(STORE_DIR, 'dingtalk-credentials.json');

    if (!fs.existsSync(credsPath)) {
      logger.warn(
        'DingTalk credentials not found. Run `npm run auth:dingtalk` first.',
      );
      return;
    }

    try {
      this.credentials = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
    } catch (err) {
      logger.error({ err }, 'Failed to parse DingTalk credentials');
      return;
    }

    if (!this.credentials?.clientId || !this.credentials?.clientSecret) {
      logger.error('DingTalk credentials missing clientId or clientSecret');
      return;
    }

    await this.setupStream();
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.credentials) {
      logger.warn({ jid }, 'DingTalk: cannot send — not connected');
      return;
    }

    if (!jid.startsWith(DINGTALK_JID_PREFIX)) {
      logger.warn({ jid }, 'DingTalk: invalid jid format, skipping send');
      return;
    }

    const conversationId = jid.slice(DINGTALK_JID_PREFIX.length);

    // Convert markdown images to text links (DingTalk doesn't support inline image upload in markdown)
    // Strip file attachment references
    let cleanText = text
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '[$1]($2)')
      .replace(/\[file:([^\]]+)\]/g, '[File: $1]');

    // Prefix with assistant name
    cleanText = `**${ASSISTANT_NAME}**: ${cleanText}`;

    // Split if too long
    const chunks = this.splitMessage(cleanText, MAX_MESSAGE_LENGTH);

    for (const chunk of chunks) {
      await this.sendChunk(conversationId, chunk);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith(DINGTALK_JID_PREFIX);
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        this.client.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.connected = false;
  }

  async setTyping(_jid: string, _isTyping: boolean): Promise<void> {
    // DingTalk bot API does not expose a typing indicator.
  }

  async syncGroups(_force: boolean): Promise<void> {
    // DingTalk group metadata is fetched on-demand during message handling.
  }

  // --- Private helpers ---

  private async setupStream(): Promise<void> {
    if (!this.credentials) return;

    try {
      const { DWClient, TOPIC_ROBOT } = await import('dingtalk-stream');

      this.client = new DWClient({
        clientId: this.credentials.clientId,
        clientSecret: this.credentials.clientSecret,
      });

      this.client.registerCallbackListener(TOPIC_ROBOT, async (res: any) => {
        try {
          const data = JSON.parse(res.data);
          await this.handleMessage(data);
          // Acknowledge to prevent retry
          this.client.socketCallBackResponse(res.headers.messageId, {
            status: 'SUCCESS',
            message: 'OK',
          });
        } catch (err) {
          logger.error({ err }, 'DingTalk: error handling robot message');
        }
      });

      await this.client.connect();
      this.connected = true;
      logger.info('DingTalk: Stream client connected');
    } catch (err) {
      logger.error({ err }, 'DingTalk: failed to start stream client');
    }
  }

  /**
   * Download a media file from DingTalk using downloadCode.
   * Returns the relative path (e.g., "uploads/123_photo.png") or null.
   */
  private async downloadMedia(
    downloadCode: string,
    filename: string,
    groupFolder: string,
  ): Promise<string | null> {
    if (!this.credentials) return null;

    try {
      const token = await this.getAccessToken();
      if (!token) return null;

      const response = await fetch(
        'https://api.dingtalk.com/v1.0/robot/messageFiles/download',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-acs-dingtalk-access-token': token,
          },
          body: JSON.stringify({
            downloadCode,
            robotCode: this.credentials.clientId,
          }),
        },
      );

      if (!response.ok) return null;
      const result: any = await response.json();
      if (!result.downloadUrl) return null;

      // Download the actual file
      const fileResp = await fetch(result.downloadUrl);
      if (!fileResp.ok) return null;
      const buffer = Buffer.from(await fileResp.arrayBuffer());

      const uploadDir = path.join(GROUPS_DIR, groupFolder, 'uploads');
      fs.mkdirSync(uploadDir, { recursive: true });
      const safeName = `${Date.now()}_${filename.replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff]/g, '_').slice(0, 200)}`;
      fs.writeFileSync(path.join(uploadDir, safeName), buffer);

      logger.info(
        { filename: safeName, groupFolder },
        'DingTalk: downloaded media',
      );
      return `uploads/${safeName}`;
    } catch (err) {
      logger.error({ err, downloadCode }, 'DingTalk: failed to download media');
      return null;
    }
  }

  private async handleMessage(data: any): Promise<void> {
    const conversationId: string = data.conversationId;
    if (!conversationId) return;

    const jid = `${DINGTALK_JID_PREFIX}${conversationId}`;
    const isGroup = data.conversationType === '2';
    const senderName: string =
      data.senderNick || data.senderStaffId || 'Unknown';
    const timestamp = data.createAt
      ? new Date(data.createAt).toISOString()
      : new Date().toISOString();

    // Extract text content and detect media
    let content = '';
    let downloadCode = '';
    let mediaFilename = '';
    let mediaType = '';

    const msgtype = data.msgtype || '';

    if (msgtype === 'picture' || msgtype === 'image') {
      try {
        const parsed =
          typeof data.content === 'string'
            ? JSON.parse(data.content)
            : data.content;
        downloadCode =
          parsed?.pictureDownloadCode || parsed?.downloadCode || '';
        mediaFilename = 'image.png';
        mediaType = 'image';
      } catch {
        /* ignore */
      }
      if (!downloadCode && data.picUrl) {
        content = `[Image: ${data.picUrl}]`;
      }
    } else if (msgtype === 'file') {
      try {
        const parsed =
          typeof data.content === 'string'
            ? JSON.parse(data.content)
            : data.content;
        downloadCode = parsed?.downloadCode || '';
        mediaFilename = parsed?.fileName || 'file';
        mediaType = 'file';
      } catch {
        /* ignore */
      }
    } else if (msgtype === 'video') {
      try {
        const parsed =
          typeof data.content === 'string'
            ? JSON.parse(data.content)
            : data.content;
        downloadCode = parsed?.downloadCode || '';
        mediaFilename = parsed?.fileName || 'video.mp4';
        mediaType = 'file';
      } catch {
        /* ignore */
      }
    } else if (msgtype === 'audio') {
      try {
        const parsed =
          typeof data.content === 'string'
            ? JSON.parse(data.content)
            : data.content;
        downloadCode = parsed?.downloadCode || '';
        mediaFilename = parsed?.fileName || 'audio.ogg';
        mediaType = 'file';
      } catch {
        /* ignore */
      }
    } else if (data.text?.content) {
      content = data.text.content.trim();
    }

    if (!content && !downloadCode) return;

    // Store session webhook for replying
    if (data.sessionWebhook) {
      this.webhooks.set(conversationId, {
        url: data.sessionWebhook,
        expiresAt: data.sessionWebhookExpiredTime || Date.now() + 3600000,
      });
    }

    // Notify host of chat metadata
    this.opts.onChatMetadata(jid, timestamp, undefined, 'dingtalk', isGroup);

    // Auto-register unregistered chats
    let groups = this.opts.registeredGroups();
    if (!groups[jid]) {
      this.autoRegisterGroup(jid, conversationId, isGroup);
      groups = this.opts.registeredGroups();
    }

    if (groups[jid]) {
      // Download media attachment if present
      if (downloadCode && groups[jid].folder) {
        const savedPath = await this.downloadMedia(
          downloadCode,
          mediaFilename,
          groups[jid].folder,
        );
        if (savedPath) {
          const label = mediaType === 'image' ? 'image' : 'file';
          content = content
            ? `${content}\n[Attached ${label}: ${savedPath}]`
            : `[Attached ${label}: ${savedPath}]`;
        } else if (!content) {
          content = `[${mediaType || 'media'}: download failed]`;
        }
      }

      this.opts.onMessage(jid, {
        id: data.msgId || `dt_${Date.now()}`,
        chat_jid: jid,
        sender: data.senderStaffId || senderName,
        sender_name: senderName,
        content,
        timestamp,
        is_from_me: false,
        is_bot_message: false,
      });
    }
  }

  private autoRegisterGroup(
    jid: string,
    conversationId: string,
    isGroup: boolean,
  ): void {
    const shortId = conversationId.slice(0, 16).replace(/[^a-zA-Z0-9]/g, '');
    const folder = `dingtalk_${shortId}`;
    const displayName = isGroup ? 'DingTalk Group' : 'DingTalk Chat';

    try {
      const groupDir = path.join(GROUPS_DIR, folder);
      fs.mkdirSync(groupDir, { recursive: true });

      const claudeMdPath = path.join(groupDir, 'CLAUDE.md');
      if (!fs.existsSync(claudeMdPath)) {
        fs.writeFileSync(claudeMdPath, DEFAULT_CLAUDE_MD);
      }

      const group: RegisteredGroup = {
        name: displayName,
        folder,
        trigger: `@${ASSISTANT_NAME}`,
        added_at: new Date().toISOString(),
        requiresTrigger: isGroup,
      };
      setRegisteredGroup(jid, group);

      // Update in-memory cache so the message is processed immediately
      const groups = this.opts.registeredGroups();
      groups[jid] = group;

      logger.info(
        { jid, folder, displayName, isGroup },
        'DingTalk: auto-registered new group',
      );
    } catch (err) {
      logger.error({ jid, err }, 'DingTalk: failed to auto-register group');
    }
  }

  /**
   * Send a message chunk to a DingTalk conversation.
   * Tries session webhook first, falls back to OpenAPI.
   */
  private async sendChunk(conversationId: string, text: string): Promise<void> {
    // Try session webhook first (faster, no extra auth)
    const webhook = this.webhooks.get(conversationId);
    if (webhook && webhook.expiresAt > Date.now() + WEBHOOK_EXPIRY_BUFFER) {
      try {
        const response = await fetch(webhook.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            msgtype: 'markdown',
            markdown: {
              title: ASSISTANT_NAME,
              text,
            },
          }),
        });

        if (response.ok) {
          const result: any = await response.json();
          if (result.errcode === 0) {
            logger.info(
              { conversationId },
              'DingTalk: message sent via webhook',
            );
            return;
          }
          logger.warn(
            { conversationId, result },
            'DingTalk: webhook returned error, trying OpenAPI',
          );
        }
      } catch (err) {
        logger.warn(
          { conversationId, err },
          'DingTalk: webhook send error, trying OpenAPI',
        );
      }
    }

    // Fallback: use OpenAPI
    await this.sendViaOpenAPI(conversationId, text);
  }

  /**
   * Send message via DingTalk OpenAPI (proactive messages or expired webhooks).
   */
  private async sendViaOpenAPI(
    conversationId: string,
    text: string,
  ): Promise<void> {
    if (!this.credentials) return;

    try {
      const token = await this.getAccessToken();
      if (!token) {
        logger.error(
          { conversationId },
          'DingTalk: failed to get access token',
        );
        return;
      }

      const response = await fetch(
        'https://api.dingtalk.com/v1.0/robot/groupMessages/send',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-acs-dingtalk-access-token': token,
          },
          body: JSON.stringify({
            msgParam: JSON.stringify({
              title: ASSISTANT_NAME,
              text,
            }),
            msgKey: 'sampleMarkdown',
            openConversationId: conversationId,
            robotCode: this.credentials.clientId,
          }),
        },
      );

      if (response.ok) {
        logger.info({ conversationId }, 'DingTalk: message sent via OpenAPI');
      } else {
        const errBody = await response.text();
        logger.error(
          { conversationId, status: response.status, errBody },
          'DingTalk: OpenAPI send failed',
        );
      }
    } catch (err) {
      logger.error(
        { conversationId, err },
        'DingTalk: failed to send via OpenAPI',
      );
    }
  }

  /**
   * Get DingTalk access token (cached with TTL).
   */
  private async getAccessToken(): Promise<string | null> {
    if (this.accessToken && this.accessTokenExpiresAt > Date.now() + 60000) {
      return this.accessToken;
    }

    if (!this.credentials) return null;

    try {
      const response = await fetch(
        'https://api.dingtalk.com/v1.0/oauth2/accessToken',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            appKey: this.credentials.clientId,
            appSecret: this.credentials.clientSecret,
          }),
        },
      );

      if (!response.ok) {
        logger.error(
          { status: response.status },
          'DingTalk: failed to get access token',
        );
        return null;
      }

      const data: any = await response.json();
      if (data.accessToken) {
        this.accessToken = data.accessToken;
        this.accessTokenExpiresAt = Date.now() + (data.expireIn || 7200) * 1000;
        return this.accessToken;
      }

      logger.error(data, 'DingTalk: access token response missing token');
      return null;
    } catch (err) {
      logger.error({ err }, 'DingTalk: failed to fetch access token');
      return null;
    }
  }

  /**
   * Split a long message into chunks that fit DingTalk's length limit.
   */
  private splitMessage(text: string, maxLen: number): string[] {
    if (text.length <= maxLen) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLen) {
        chunks.push(remaining);
        break;
      }

      // Try to split at a newline near the limit
      let splitAt = remaining.lastIndexOf('\n', maxLen);
      if (splitAt < maxLen * 0.5) {
        splitAt = remaining.lastIndexOf(' ', maxLen);
      }
      if (splitAt < maxLen * 0.5) {
        splitAt = maxLen;
      }

      chunks.push(remaining.slice(0, splitAt));
      remaining = remaining.slice(splitAt).trimStart();
    }

    return chunks;
  }
}

// Self-register the channel — triggers when this module is imported.
// Returns null if DingTalk credentials are absent (graceful no-op).
registerChannel('dingtalk', (opts: ChannelOpts) => {
  const credsPath = path.join(STORE_DIR, 'dingtalk-credentials.json');
  if (!fs.existsSync(credsPath)) {
    logger.debug('DingTalk credentials not found — channel not registered');
    return null;
  }
  return new DingTalkChannel(opts);
});
