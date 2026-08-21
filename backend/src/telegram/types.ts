export interface TelegramChat {
  id: string;
  title: string;
  type: 'user' | 'group' | 'supergroup' | 'channel';
  photo?: string | null;
  username?: string | null;
  inviteLink?: string | null;
  isBot?: boolean;
}

export interface TelegramSender {
  id: string;
  username: string | null;
  firstName: string;
  lastName: string | null;
  photo: string | null;
  /** Telegram bot account -- shown with the same APP tag as Discord apps. */
  isBot?: boolean;
}

export interface TelegramRawMessage {
  id: number;
  chatId: string;
  chatTitle: string;
  chatType: TelegramChat['type'];
  chatUsername?: string | null;
  chatInviteLink?: string | null;
  sender: TelegramSender;
  text: string;
  date: number;
  replyTo?: {
    id: number;
    senderId: string | null;
    senderName: string;
    senderPhoto: string | null;
    senderIsBot?: boolean;
    text: string;
    /** Media-only message: the reply line previews it as an attachment. */
    hasMedia: boolean;
  } | null;
  forward?: {
    senderName: string;
    chatTitle?: string;
  } | null;
  media?: TelegramMedia | null;
  sticker?: {
    url: string;
    emoji?: string;
    isAnimated: boolean;
  } | null;
  poll?: {
    question: string;
    options: { text: string; voters: number }[];
  } | null;
  buttons?: TelegramButton[] | null;
}

export interface TelegramButton {
  text: string;
  url: string;
}

export type TelegramMediaType = 'photo' | 'video' | 'document' | 'audio' | 'voice' | 'gif';

export interface TelegramMedia {
  type: TelegramMediaType;
  url: string;
  filename: string;
  size: number;
  mimeType?: string;
  width?: number;
  height?: number;
  /** Voice notes only, in Discord's shape so the frontend draws both
   * platforms' voice messages with the same player: recorded length, and a
   * base64 waveform of one 0-255 amplitude sample per byte. */
  durationSecs?: number;
  waveform?: string;
}
