export interface TelegramChat {
  id: string;
  title: string;
  type: 'user' | 'group' | 'supergroup' | 'channel';
  photo?: string | null;
  username?: string | null;
  inviteLink?: string | null;
}

export interface TelegramSender {
  id: string;
  username: string | null;
  firstName: string;
  lastName: string | null;
  photo: string | null;
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
    senderName: string;
    text: string;
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
}
