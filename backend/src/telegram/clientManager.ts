import { EventEmitter } from 'events';
import { TelegramClientWrapper } from './client.js';
import type { TelegramChat, TelegramRawMessage } from './types.js';

const DEDUP_WINDOW_MS = 10_000;
const DEDUP_MAX_SIZE = 5_000;

export class TelegramClientManager extends EventEmitter {
  private clients: TelegramClientWrapper[] = [];
  private recentMessageIds = new Map<string, number>();
  private dedupeTimer: ReturnType<typeof setInterval> | null = null;
  private readyCount = 0;
  private readyResolve: (() => void) | null = null;
  private readyPromise: Promise<void>;

  constructor(
    private apiId: number,
    private apiHash: string,
    sessions: string[],
  ) {
    super();
    this.readyPromise = new Promise<void>((resolve) => {
      this.readyResolve = resolve;
    });
    for (const session of sessions) {
      const client = new TelegramClientWrapper(apiId, apiHash, session);
      this.clients.push(client);
      this.wireEvents(client);
    }
    if (sessions.length === 0) {
      this.readyResolve?.();
    }
  }

  private wireEvents(client: TelegramClientWrapper): void {
    client.on('message', (raw: TelegramRawMessage) => {
      const key = `${raw.chatId}:${raw.id}`;
      const now = Date.now();
      if (this.recentMessageIds.has(key)) return;
      this.recentMessageIds.set(key, now);
      this.emit('message', raw);
    });

    client.on('messageUpdate', (raw: TelegramRawMessage) => {
      this.emit('messageUpdate', raw);
    });

    client.on('ready', (user: { id: string; username: string | null; firstName: string }) => {
      this.readyCount++;
      if (this.readyCount >= this.clients.length) {
        this.readyResolve?.();
      }
      this.emit('ready', user);
    });

    client.on('fatal', (err: Error) => this.emit('fatal', err));
  }

  waitUntilReady(timeoutMs = 30_000): Promise<void> {
    return Promise.race([
      this.readyPromise,
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }

  async connect(): Promise<void> {
    this.dedupeTimer = setInterval(() => this.pruneDedup(), DEDUP_WINDOW_MS);
    for (const client of this.clients) {
      await client.connect();
    }
  }

  disconnect(): void {
    if (this.dedupeTimer) {
      clearInterval(this.dedupeTimer);
      this.dedupeTimer = null;
    }
    for (const client of this.clients) {
      client.disconnect();
    }
  }

  private pruneDedup(): void {
    const cutoff = Date.now() - DEDUP_WINDOW_MS;
    for (const [id, ts] of this.recentMessageIds) {
      if (ts < cutoff) this.recentMessageIds.delete(id);
    }
    if (this.recentMessageIds.size > DEDUP_MAX_SIZE) {
      const entries = [...this.recentMessageIds.entries()].sort((a, b) => a[1] - b[1]);
      const toRemove = entries.slice(0, entries.length - DEDUP_MAX_SIZE);
      for (const [id] of toRemove) this.recentMessageIds.delete(id);
    }
  }

  async getChats(): Promise<TelegramChat[]> {
    const merged = new Map<string, TelegramChat>();
    for (const client of this.clients) {
      const chats = await client.getChats();
      for (const chat of chats) {
        if (!merged.has(chat.id)) {
          merged.set(chat.id, chat);
        }
      }
    }
    return Array.from(merged.values());
  }

  getChatName(chatId: string): string {
    for (const client of this.clients) {
      const name = client.getChatName(chatId);
      if (name !== 'Unknown') return name;
    }
    return 'Unknown';
  }

  async fetchMessages(chatId: string, limit = 30): Promise<TelegramRawMessage[]> {
    for (const client of this.clients) {
      try {
        const msgs = await client.fetchMessages(chatId, limit);
        if (msgs.length > 0) return msgs;
      } catch {
        continue;
      }
    }
    return [];
  }

  async sendMessage(
    chatId: string,
    content: string,
    attachments?: { filename: string; data: Buffer; contentType: string }[],
  ): Promise<{ id: number }> {
    for (const client of this.clients) {
      if (client.isConnected()) {
        const result = await client.sendMessage(chatId, content, attachments);
        return { id: result.id };
      }
    }
    throw new Error('No connected Telegram client available');
  }

  async downloadMediaByIds(chatId: string, messageId: number): Promise<{ buffer: Buffer; mimeType: string } | null> {
    for (const client of this.clients) {
      try {
        const result = await client.downloadMediaByIds(chatId, messageId);
        if (result) return result;
      } catch {
        continue;
      }
    }
    return null;
  }

  async downloadProfilePhoto(peerId: string): Promise<Buffer | null> {
    for (const client of this.clients) {
      try {
        const result = await client.downloadProfilePhoto(peerId);
        if (result) return result;
      } catch {
        continue;
      }
    }
    return null;
  }

  isConnected(): boolean {
    return this.clients.some((c) => c.isConnected());
  }

  getClientCount(): number {
    return this.clients.length;
  }

  getFirstClient(): TelegramClientWrapper | null {
    return this.clients[0] ?? null;
  }
}
