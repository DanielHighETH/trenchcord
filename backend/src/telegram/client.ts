import { EventEmitter } from 'events';
import { TelegramClient as GramJSClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions/index.js';
import { NewMessage } from 'teleproto/events/index.js';
import { EditedMessage } from 'teleproto/events/EditedMessage.js';
import { Api } from 'teleproto/tl/index.js';
import type { TelegramChat, TelegramSender, TelegramRawMessage, TelegramMedia, TelegramButton } from './types.js';
import { rewriteReferralLinks } from '../utils/contract.js';

export class TelegramClientWrapper extends EventEmitter {
  private client: GramJSClient;
  private session: StringSession;
  private apiId: number;
  private apiHash: string;
  private chatCache = new Map<string, TelegramChat>();
  private senderCache = new Map<string, TelegramSender>();
  private connected = false;

  constructor(apiId: number, apiHash: string, sessionString: string) {
    super();
    this.apiId = apiId;
    this.apiHash = apiHash;
    this.session = new StringSession(sessionString);
    this.client = new GramJSClient(this.session, this.apiId, this.apiHash, {
      connectionRetries: 5,
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
      this.connected = true;

      const me = await this.client.getMe() as Api.User;
      console.log(`[Telegram] Connected as ${me.firstName} (@${me.username ?? 'no-username'})`);

      this.emit('ready', {
        id: me.id.toString(),
        username: me.username ?? null,
        firstName: me.firstName ?? '',
      });

      this.setupEventHandlers();
      // Prime the entity/chat cache once so resolveChat's getEntity can resolve
      // channels. teleproto's UpdateManager keeps the update stream live on its
      // own, so no recurring polling is needed.
      await this.client.getDialogs({ limit: 200 }).catch(() => {});
    } catch (err: any) {
      console.error('[Telegram] Connection failed:', err.message);
      this.emit('fatal', new Error(`Telegram connection failed: ${err.message}`));
    }
  }

  private setupEventHandlers(): void {
    this.client.addEventHandler(async (event) => {
      try {
        const message = event.message;
        if (!message) return;

        const raw = await this.buildRawMessage(message);
        if (raw) {
          this.emit('message', raw);
        }
      } catch (err: any) {
        console.error('[Telegram] Error processing message:', err.message);
      }
    }, new NewMessage({}));

    this.client.addEventHandler(async (event) => {
      try {
        const message = event.message;
        if (!message) return;

        const raw = await this.buildRawMessage(message);
        if (raw) {
          this.emit('messageUpdate', raw);
        }
      } catch (err: any) {
        console.error('[Telegram] Error processing message update:', err.message);
      }
    }, new EditedMessage({}));
  }

  private async buildRawMessage(message: Api.Message): Promise<TelegramRawMessage | null> {
    const chat = await this.resolveChat(message);
    if (!chat) return null;

    const sender = await this.resolveSender(message);
    if (!sender) return null;

    let replyTo: TelegramRawMessage['replyTo'] = null;
    if (message.replyTo && 'replyToMsgId' in message.replyTo && message.replyTo.replyToMsgId) {
      try {
        const replyMsgId = message.replyTo.replyToMsgId;
        const replyMsg = await this.client.getMessages(message.peerId!, {
          ids: [replyMsgId],
        });
        if (replyMsg.length > 0 && replyMsg[0]) {
          const replySender = await this.resolveSender(replyMsg[0]);
          replyTo = {
            id: replyMsg[0].id,
            senderName: replySender?.firstName ?? 'Unknown',
            text: replyMsg[0].text ?? '',
          };
        }
      } catch {
        // Reply resolution can fail for deleted messages
      }
    }

    let forward: TelegramRawMessage['forward'] = null;
    if (message.fwdFrom) {
      const fwd = message.fwdFrom;
      let senderName = 'Unknown';
      let chatTitle: string | undefined;
      if (fwd.fromId) {
        try {
          const entity = await this.client.getEntity(fwd.fromId);
          if (entity instanceof Api.User) {
            senderName = entity.firstName ?? entity.username ?? 'Unknown';
          } else if (entity instanceof Api.Channel || entity instanceof Api.Chat) {
            senderName = (entity as any).title ?? 'Unknown';
            chatTitle = (entity as any).title;
          }
        } catch {
          senderName = fwd.fromName ?? 'Unknown';
        }
      } else if (fwd.fromName) {
        senderName = fwd.fromName;
      }
      forward = { senderName, chatTitle };
    }

    const media = await this.resolveMedia(message);
    if (media) {
      media.url = `/api/telegram/media/${chat.id}/${message.id}`;
    }
    const sticker = await this.resolveSticker(message);
    const poll = this.resolvePoll(message);
    const buttons = this.resolveButtons(message);

    return {
      id: message.id,
      chatId: chat.id,
      chatTitle: chat.title,
      chatType: chat.type,
      chatUsername: chat.username ?? null,
      chatInviteLink: chat.inviteLink ?? null,
      sender,
      text: this.applyLinkEntities(message),
      date: message.date,
      replyTo,
      forward,
      media,
      sticker,
      poll,
      buttons,
    };
  }

  // Build the message display text as markdown from the RAW text plus its
  // formatting entities. Important: we must use message.rawText here, not
  // message.text — teleproto derives message.text by re-serializing the raw
  // text through the client parse mode, which injects markdown characters and
  // shifts every position, so it no longer lines up with the entity offsets
  // (which are relative to the raw text). Entity offsets are UTF-16 units,
  // matching JS string indexing.
  //
  // We serialize bold/code/links ourselves so their offsets stay consistent.
  // Links whose visible label is just numbers/symbols (stat-value noise) are
  // dropped to plain text; everything else stays a clickable link.
  private applyLinkEntities(message: Api.Message): string {
    const raw = message.rawText ?? '';
    const entities = message.entities;
    if (!entities || entities.length === 0) return raw;

    const isMeaningfulLabel = (s: string) => /[\p{L}\p{Extended_Pictographic}]/u.test(s);

    // Markers to splice into the raw text. `rank` controls nesting so bold wraps
    // links (e.g. "**[label](url)**"): lower rank is more outer.
    type Marker = { pos: number; kind: 0 | 1; rank: number; str: string; offset: number; length: number };
    const markers: Marker[] = [];
    const add = (offset: number, length: number, rank: number, open: string, close: string) => {
      markers.push({ pos: offset, kind: 1, rank, str: open, offset, length });
      markers.push({ pos: offset + length, kind: 0, rank, str: close, offset, length });
    };

    for (const e of entities) {
      if (e instanceof Api.MessageEntityBold) {
        add(e.offset, e.length, 0, '**', '**');
      } else if (e instanceof Api.MessageEntityCode) {
        add(e.offset, e.length, 1, '`', '`');
      } else if (e instanceof Api.MessageEntityPre) {
        add(e.offset, e.length, 1, '```\n', '\n```');
      } else if (e instanceof Api.MessageEntityTextUrl) {
        const label = raw.substring(e.offset, e.offset + e.length);
        if (!isMeaningfulLabel(label)) continue;
        add(e.offset, e.length, 2, '[', `](${rewriteReferralLinks(e.url)})`);
      }
    }
    if (markers.length === 0) return raw;

    markers.sort((a, b) => {
      if (a.pos !== b.pos) return a.pos - b.pos;
      if (a.kind !== b.kind) return a.kind - b.kind; // closes before opens
      if (a.kind === 1) return a.rank - b.rank || b.length - a.length; // opens: outer first
      return b.rank - a.rank || b.offset - a.offset; // closes: inner first
    });

    let result = '';
    let cursor = 0;
    for (const m of markers) {
      result += raw.substring(cursor, m.pos);
      result += m.str;
      cursor = m.pos;
    }
    result += raw.substring(cursor);
    return result;
  }

  // Inline keyboard URL buttons (e.g. "dash", "chart") carry links that aren't
  // part of the message text. Extract the ones that resolve to an actual URL.
  private resolveButtons(message: Api.Message): TelegramButton[] | null {
    const markup = message.replyMarkup;
    if (!(markup instanceof Api.ReplyInlineMarkup)) return null;

    const buttons: TelegramButton[] = [];
    for (const row of markup.rows) {
      for (const button of row.buttons) {
        if (button instanceof Api.KeyboardButtonUrl) {
          buttons.push({ text: button.text, url: button.url });
        } else if (button instanceof Api.KeyboardButtonUrlAuth) {
          buttons.push({ text: button.text, url: button.url });
        }
      }
    }

    return buttons.length > 0 ? buttons : null;
  }

  private async resolveChat(message: Api.Message): Promise<TelegramChat | null> {
    if (!message.peerId) return null;
    const chatId = this.peerToId(message.peerId);
    const cached = this.chatCache.get(chatId);
    if (cached) return cached;

    try {
      const entity = await this.client.getEntity(message.peerId);
      let chat: TelegramChat;

      if (entity instanceof Api.User) {
        chat = {
          id: chatId,
          title: entity.firstName
            ? `${entity.firstName}${entity.lastName ? ' ' + entity.lastName : ''}`
            : entity.username ?? 'Private Chat',
          type: 'user',
          username: entity.username ?? null,
        };
      } else if (entity instanceof Api.Chat) {
        chat = {
          id: chatId,
          title: entity.title ?? 'Group',
          type: 'group',
          inviteLink: await this.resolveGroupInviteLink(entity.id),
        };
      } else if (entity instanceof Api.Channel) {
        chat = {
          id: chatId,
          title: entity.title ?? 'Channel',
          type: entity.megagroup ? 'supergroup' : 'channel',
          username: entity.username ?? null,
        };
      } else {
        return null;
      }

      this.chatCache.set(chatId, chat);
      return chat;
    } catch {
      return null;
    }
  }

  // Basic (legacy) groups have no public per-message permalink, so the only way
  // to open them in Telegram is via an invite link. Prefer an existing exported
  // invite; fall back to exporting one (requires invite permission).
  private async resolveGroupInviteLink(chatId: Api.Chat['id']): Promise<string | null> {
    try {
      const full = await this.client.invoke(new Api.messages.GetFullChat({ chatId }));
      const existing = (full.fullChat as any)?.exportedInvite;
      if (existing instanceof Api.ChatInviteExported) return existing.link;
    } catch {
      // ignore - fall through to export attempt
    }
    try {
      const exported = await this.client.invoke(
        new Api.messages.ExportChatInvite({ peer: new Api.InputPeerChat({ chatId }) }),
      );
      if (exported instanceof Api.ChatInviteExported) return exported.link;
    } catch {
      // ignore - no permission or unavailable
    }
    return null;
  }

  private async resolveSender(message: Api.Message): Promise<TelegramSender | null> {
    const senderId = message.senderId?.toString();
    if (!senderId) {
      if (message.peerId) {
        const chatId = this.peerToId(message.peerId);
        const chat = this.chatCache.get(chatId);
        if (chat) {
          return {
            id: chatId,
            username: null,
            firstName: chat.title,
            lastName: null,
            photo: `/api/telegram/avatar/${chatId}`,
          };
        }
      }
      return null;
    }

    const cached = this.senderCache.get(senderId);
    if (cached) return cached;

    try {
      const entity = await this.client.getEntity(message.senderId!);
      let sender: TelegramSender;

      if (entity instanceof Api.User) {
        sender = {
          id: senderId,
          username: entity.username ?? null,
          firstName: entity.firstName ?? '',
          lastName: entity.lastName ?? null,
          photo: entity.photo ? `/api/telegram/avatar/${senderId}` : null,
        };
      } else if (entity instanceof Api.Channel || entity instanceof Api.Chat) {
        sender = {
          id: senderId,
          username: (entity as any).username ?? null,
          firstName: (entity as any).title ?? 'Unknown',
          lastName: null,
          photo: (entity as any).photo ? `/api/telegram/avatar/${senderId}` : null,
        };
      } else {
        return null;
      }

      this.senderCache.set(senderId, sender);
      return sender;
    } catch {
      return { id: senderId, username: null, firstName: 'Unknown', lastName: null, photo: null };
    }
  }

  private async resolveMedia(message: Api.Message): Promise<TelegramMedia | null> {
    if (!message.media) return null;

    // Skip stickers (handled separately) and polls
    if (message.media instanceof Api.MessageMediaDocument) {
      const doc = message.media.document;
      if (doc instanceof Api.Document) {
        const isSticker = doc.attributes.some(
          (a) => a instanceof Api.DocumentAttributeSticker
        );
        if (isSticker) return null;

        const isAnimated = doc.attributes.some(
          (a) => a instanceof Api.DocumentAttributeAnimated
        );
        const videoAttr = doc.attributes.find(
          (a) => a instanceof Api.DocumentAttributeVideo
        ) as Api.DocumentAttributeVideo | undefined;
        const filenameAttr = doc.attributes.find(
          (a) => a instanceof Api.DocumentAttributeFilename
        ) as Api.DocumentAttributeFilename | undefined;

        let type: TelegramMedia['type'] = 'document';
        if (isAnimated) type = 'gif';
        else if (videoAttr) type = 'video';
        else if (doc.mimeType?.startsWith('audio/')) type = 'audio';
        else if (doc.mimeType === 'audio/ogg') type = 'voice';

        return {
          type,
          url: '', // Will be resolved via download URL
          filename: filenameAttr?.fileName ?? `file_${message.id}`,
          size: Number(doc.size),
          mimeType: doc.mimeType ?? undefined,
          width: videoAttr?.w,
          height: videoAttr?.h,
        };
      }
    }

    if (message.media instanceof Api.MessageMediaPhoto) {
      const photo = message.media.photo;
      if (photo instanceof Api.Photo) {
        const biggest = photo.sizes
          .filter((s): s is Api.PhotoSize => s instanceof Api.PhotoSize)
          .sort((a, b) => b.size - a.size)[0];

        return {
          type: 'photo',
          url: '', // Will be resolved via download URL
          filename: `photo_${message.id}.jpg`,
          size: biggest?.size ?? 0,
          mimeType: 'image/jpeg',
          width: biggest?.w,
          height: biggest?.h,
        };
      }
    }

    return null;
  }

  private async resolveSticker(message: Api.Message): Promise<TelegramRawMessage['sticker']> {
    if (!message.media || !(message.media instanceof Api.MessageMediaDocument)) return null;

    const doc = message.media.document;
    if (!(doc instanceof Api.Document)) return null;

    const stickerAttr = doc.attributes.find(
      (a) => a instanceof Api.DocumentAttributeSticker
    ) as Api.DocumentAttributeSticker | undefined;
    if (!stickerAttr) return null;

    const isAnimated = doc.mimeType === 'application/x-tgsticker' || doc.mimeType === 'video/webm';

    return {
      url: '', // Sticker preview - would need download
      emoji: stickerAttr.alt ?? undefined,
      isAnimated,
    };
  }

  private resolvePoll(message: Api.Message): TelegramRawMessage['poll'] {
    if (!message.media || !(message.media instanceof Api.MessageMediaPoll)) return null;

    const poll = message.media.poll;
    const results = message.media.results;

    return {
      question: typeof poll.question === 'string'
        ? poll.question
        : (poll.question as any)?.text ?? '',
      options: poll.answers.map((answer, i) => {
        const text = typeof answer.text === 'string'
          ? answer.text
          : (answer.text as any)?.text ?? '';
        const voters = results?.results?.[i]?.voters ?? 0;
        return { text, voters };
      }),
    };
  }

  private peerToId(peer: Api.TypePeer): string {
    if (peer instanceof Api.PeerUser) return peer.userId.toString();
    if (peer instanceof Api.PeerChat) return `-${peer.chatId}`;
    if (peer instanceof Api.PeerChannel) return `-100${peer.channelId}`;
    return '0';
  }

  async getChats(): Promise<TelegramChat[]> {
    const chats: TelegramChat[] = [];
    try {
      const dialogs = await this.client.getDialogs({ limit: 200 });
      for (const dialog of dialogs) {
        const entity = dialog.entity;
        if (!entity) continue;

        let chat: TelegramChat | null = null;

        if (entity instanceof Api.User) {
          if (entity.bot || entity.self) continue;
          chat = {
            id: entity.id.toString(),
            title: entity.firstName
              ? `${entity.firstName}${entity.lastName ? ' ' + entity.lastName : ''}`
              : entity.username ?? 'User',
            type: 'user',
            username: entity.username ?? null,
          };
        } else if (entity instanceof Api.Chat) {
          chat = {
            id: `-${entity.id}`,
            title: entity.title ?? 'Group',
            type: 'group',
          };
        } else if (entity instanceof Api.Channel) {
          chat = {
            id: `-100${entity.id}`,
            title: entity.title ?? 'Channel',
            type: entity.megagroup ? 'supergroup' : 'channel',
            username: entity.username ?? null,
          };
        }

        if (chat) {
          chats.push(chat);
          this.chatCache.set(chat.id, chat);
        }
      }
    } catch (err: any) {
      console.error('[Telegram] Failed to fetch chats:', err.message);
    }
    return chats;
  }

  async fetchMessages(chatId: string, limit = 30): Promise<TelegramRawMessage[]> {
    const messages: TelegramRawMessage[] = [];
    try {
      const entity = await this.client.getEntity(chatId);
      const result = await this.client.getMessages(entity, { limit });

      for (const msg of result) {
        if (!msg || !(msg instanceof Api.Message)) continue;
        const raw = await this.buildRawMessage(msg);
        if (raw) messages.push(raw);
      }
    } catch (err: any) {
      console.error(`[Telegram] Failed to fetch messages for ${chatId}:`, err.message);
    }
    return messages.reverse();
  }

  async downloadMedia(message: Api.Message): Promise<Buffer | null> {
    try {
      const buffer = await this.client.downloadMedia(message);
      return buffer as Buffer | null;
    } catch {
      return null;
    }
  }

  async downloadMediaByIds(chatId: string, messageId: number): Promise<{ buffer: Buffer; mimeType: string } | null> {
    try {
      const entity = await this.client.getEntity(chatId);
      const msgs = await this.client.getMessages(entity, { ids: [messageId] });
      const msg = msgs[0];
      if (!msg || !(msg instanceof Api.Message) || !msg.media) return null;

      let mimeType = 'application/octet-stream';
      if (msg.media instanceof Api.MessageMediaPhoto) {
        mimeType = 'image/jpeg';
      } else if (msg.media instanceof Api.MessageMediaDocument) {
        const doc = msg.media.document;
        if (doc instanceof Api.Document) {
          mimeType = doc.mimeType ?? 'application/octet-stream';
        }
      }

      const buffer = await this.client.downloadMedia(msg);
      if (!buffer || !(buffer instanceof Buffer)) return null;
      return { buffer, mimeType };
    } catch (err: any) {
      console.error(`[Telegram] Failed to download media ${chatId}/${messageId}:`, err.message);
      return null;
    }
  }

  async downloadProfilePhoto(peerId: string): Promise<Buffer | null> {
    try {
      const entity = await this.client.getEntity(peerId);
      const buffer = await this.client.downloadProfilePhoto(entity);
      if (!buffer || !(buffer instanceof Buffer) || buffer.length === 0) return null;
      return buffer;
    } catch (err: any) {
      console.error(`[Telegram] Failed to download profile photo for ${peerId}:`, err.message);
      return null;
    }
  }

  async sendMessage(
    chatId: string,
    content: string,
    attachments?: { filename: string; data: Buffer; contentType: string }[],
  ): Promise<Api.Message> {
    const entity = await this.client.getEntity(chatId);

    if (attachments && attachments.length > 0) {
      const { CustomFile } = await import('teleproto/client/uploads.js');
      const first = attachments[0];
      const customFile = new CustomFile(first.filename, first.data.length, '', first.data);
      const result = await this.client.sendFile(entity, {
        file: customFile,
        caption: content || undefined,
        forceDocument: !first.contentType.startsWith('image/'),
      });

      for (let i = 1; i < attachments.length; i++) {
        const att = attachments[i];
        const f = new CustomFile(att.filename, att.data.length, '', att.data);
        await this.client.sendFile(entity, {
          file: f,
          forceDocument: !att.contentType.startsWith('image/'),
        });
      }

      return result as Api.Message;
    }

    return this.client.sendMessage(entity, { message: content });
  }

  getChatName(chatId: string): string {
    return this.chatCache.get(chatId)?.title ?? 'Unknown';
  }

  isConnected(): boolean {
    return this.connected;
  }

  getUnderlyingClient(): GramJSClient {
    return this.client;
  }

  getSessionString(): string {
    return this.session.save() as unknown as string;
  }

  disconnect(): void {
    this.connected = false;
    this.client.disconnect().catch(() => {});
  }
}
