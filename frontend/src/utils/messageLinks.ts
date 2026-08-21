// Opens a message in its source app (Discord or Telegram), honoring the
// open-in-app settings. Mirrors the channel-badge logic in Message.tsx.

import { isIOSApp } from './platform';
import type { FrontendMessage } from '../types';

type SourceMessage = Pick<FrontendMessage, 'guildId' | 'channelId' | 'id' | 'source' | 'platformUrl'>;

export function openMessageSource(
  message: SourceMessage,
  opts: { openInDiscordApp?: boolean; openInTelegramApp?: boolean },
): void {
  const useDiscordApp = (opts.openInDiscordApp ?? true) || isIOSApp();
  const useTelegramApp = (opts.openInTelegramApp ?? true) || isIOSApp();

  if (message.source === 'telegram') {
    const webUrl = message.platformUrl;
    if (!webUrl) return;
    let url = webUrl;
    if (useTelegramApp) {
      const inviteMatch = webUrl.match(/^https:\/\/t\.me\/(?:joinchat\/|\+)(.+)$/);
      const privateMatch = webUrl.match(/^https:\/\/t\.me\/c\/(\d+)\/(\d+)$/);
      const publicMatch = webUrl.match(/^https:\/\/t\.me\/([^/]+)\/(\d+)$/);
      if (inviteMatch) url = `tg://join?invite=${inviteMatch[1]}`;
      else if (privateMatch) url = `tg://privatepost?channel=${privateMatch[1]}&post=${privateMatch[2]}`;
      else if (publicMatch) url = `tg://resolve?domain=${publicMatch[1]}&post=${publicMatch[2]}`;
      window.location.href = url;
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }

  const path = `discord.com/channels/${message.guildId ?? '@me'}/${message.channelId}/${message.id}`;
  if (useDiscordApp) {
    window.location.href = `discord://${path}`;
  } else {
    window.open(`https://${path}`, '_blank', 'noopener,noreferrer');
  }
}
