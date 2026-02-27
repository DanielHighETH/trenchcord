import type { FrontendMessage } from '../types';

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

export function showDesktopNotification(msg: FrontendMessage, subtitle: string): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

  const icon = msg.author.avatar
    ? `https://cdn.discordapp.com/avatars/${msg.author.id}/${msg.author.avatar}.png?size=128`
    : undefined;

  const location = msg.guildName
    ? `${msg.guildName} / #${msg.channelName}`
    : `#${msg.channelName}`;

  const preview = msg.content
    ? msg.content.slice(0, 120) + (msg.content.length > 120 ? '…' : '')
    : msg.attachments?.length
      ? `[${msg.attachments.length} attachment${msg.attachments.length > 1 ? 's' : ''}]`
      : '';

  const body = `${subtitle} · ${location}\n${preview}`;

  const notification = new Notification(msg.author.displayName, {
    body,
    icon,
  });

  notification.onclick = () => {
    window.focus();
    notification.close();
  };
}
