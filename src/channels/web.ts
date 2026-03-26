/**
 * Web Chat Channel for OmiClaw
 * Enables browser-based chat at http://localhost:3220 (Chat tab) by default.
 * No credentials needed — always available.
 * Self-registers via registerChannel().
 */

import fs from 'fs';
import path from 'path';

import { ASSISTANT_NAME, GROUPS_DIR } from '../config.js';
import {
  getActiveWebChatThreadId,
  setRegisteredGroup,
  storeChatMetadata,
  storeMessageDirect,
  touchWebChatThread,
} from '../db.js';
import { logger } from '../logger.js';
import { Channel, NewMessage, RegisteredGroup } from '../types.js';
import { buildDefaultGroupPrompt } from '../default-group-prompt.js';
import { registerChannel, ChannelOpts } from './registry.js';

const WEB_JID = 'web:chat';
const WEB_FOLDER = 'web_chat';
const WEB_CHAT_DEFAULT_THREAD_ID = 'default';

// Broadcast function set by server.ts
let broadcastFn: ((msg: unknown) => void) | null = null;
let activeThreadId = WEB_CHAT_DEFAULT_THREAD_ID;

export function setWebBroadcast(fn: (msg: unknown) => void): void {
  broadcastFn = fn;
}

export function setWebChatActiveThread(threadId: string): void {
  activeThreadId = threadId || WEB_CHAT_DEFAULT_THREAD_ID;
}

export function getWebChatActiveThread(): string {
  return activeThreadId;
}

const DEFAULT_CLAUDE_MD = buildDefaultGroupPrompt('the web chat interface.');

export class WebChannel implements Channel {
  name = 'web';

  private connected = false;
  private opts: ChannelOpts;

  constructor(opts: ChannelOpts) {
    this.opts = opts;
  }

  async connect(): Promise<void> {
    activeThreadId = getActiveWebChatThreadId();

    // Auto-register the web chat group if not already registered
    const groups = this.opts.registeredGroups();
    if (!groups[WEB_JID]) {
      const groupDir = path.join(GROUPS_DIR, WEB_FOLDER);
      fs.mkdirSync(path.join(groupDir, 'logs'), { recursive: true });

      const claudeMdPath = path.join(groupDir, 'CLAUDE.md');
      if (!fs.existsSync(claudeMdPath)) {
        fs.writeFileSync(claudeMdPath, DEFAULT_CLAUDE_MD);
      }

      const group: RegisteredGroup = {
        name: 'Web Chat',
        folder: WEB_FOLDER,
        trigger: `@${ASSISTANT_NAME}`,
        added_at: new Date().toISOString(),
        requiresTrigger: false,
        isMain: false,
      };
      setRegisteredGroup(WEB_JID, group);
      // Create chats row (FK target for messages table)
      storeChatMetadata(
        WEB_JID,
        new Date().toISOString(),
        'Web Chat',
        'web',
        false,
      );
      // Also update in-memory map so message loop can find this group
      groups[WEB_JID] = group;
      logger.info('Web channel: registered web_chat group');
    }

    // Ensure chats row exists (FK target for messages table) — idempotent
    storeChatMetadata(
      WEB_JID,
      new Date().toISOString(),
      'Web Chat',
      'web',
      false,
    );

    this.connected = true;
    logger.info('Web channel connected');
  }

  async sendMessage(_jid: string, text: string): Promise<void> {
    const now = new Date().toISOString();
    const msgId = `web_bot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Store bot message in DB
    storeMessageDirect({
      id: msgId,
      chat_jid: WEB_JID,
      thread_id: activeThreadId,
      sender: 'assistant',
      sender_name: ASSISTANT_NAME,
      content: text,
      timestamp: now,
      is_from_me: true,
      is_bot_message: true,
    });
    touchWebChatThread(activeThreadId, text, now);

    // Broadcast to WS clients
    if (broadcastFn) {
      broadcastFn({
        type: 'chat:message',
        sender: 'assistant',
        text,
        timestamp: now,
        id: msgId,
        threadId: activeThreadId,
      });
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  ownsJid(jid: string): boolean {
    return jid === WEB_JID;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }
}

/**
 * Handle an incoming web chat message from the browser.
 * Called by server.ts when a chat:send WS message arrives.
 */
export function handleWebChatMessage(
  text: string,
  opts: ChannelOpts,
  threadId = activeThreadId,
): void {
  const now = new Date().toISOString();
  const msgId = `web_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  activeThreadId = threadId || activeThreadId;
  touchWebChatThread(activeThreadId, text, now);

  const msg: NewMessage = {
    id: msgId,
    chat_jid: WEB_JID,
    thread_id: activeThreadId,
    sender: 'web_user',
    sender_name: 'User',
    content: text,
    timestamp: now,
    is_from_me: false,
    is_bot_message: false,
  };

  opts.onMessage(WEB_JID, msg);
}

// Self-register — always available, no credentials needed
registerChannel('web', (opts: ChannelOpts) => {
  return new WebChannel(opts);
});
