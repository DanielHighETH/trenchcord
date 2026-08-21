import type { FrontendMessage } from '../types';
import { messageFallbackText } from './addressDetect';

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

/** Notification without a source message (premium alerts, system events). */
export function showGenericNotification(title: string, body: string, url?: string): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

  const notification = new Notification(title, {
    body: body.slice(0, 200) + (body.length > 200 ? '…' : ''),
  });

  notification.onclick = () => {
    if (url) window.open(url, '_blank');
    else window.focus();
    notification.close();
  };
}

export function showDesktopNotification(msg: FrontendMessage, subtitle: string): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

  const icon = msg.author.avatar
    ? `https://cdn.discordapp.com/avatars/${msg.author.id}/${msg.author.avatar}.png?size=128`
    : undefined;

  const location = msg.guildName
    ? `${msg.guildName} / #${msg.channelName}`
    : `#${msg.channelName}`;

  // v2/forwarded messages have empty content; preview their text instead.
  const text = messageFallbackText(msg);
  const preview = text
    ? text.slice(0, 120) + (text.length > 120 ? '…' : '')
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
