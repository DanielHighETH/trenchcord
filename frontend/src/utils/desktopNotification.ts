import type { FrontendMessage } from '../types';

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

export function showDesktopNotification(msg: FrontendMessage, subtitle: string): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (!document.hidden) return;

  const icon = msg.author.avatar
    ? `https://cdn.discordapp.com/avatars/${msg.author.id}/${msg.author.avatar}.png?size=64`
    : undefined;

  const body = `${subtitle}\n${msg.content.slice(0, 100)}${msg.content.length > 100 ? '...' : ''}`;

  const notification = new Notification(msg.author.displayName, {
    body,
    icon,
    tag: msg.id,
    silent: true,
  });

  notification.onclick = () => {
    window.focus();
    notification.close();
  };
}
