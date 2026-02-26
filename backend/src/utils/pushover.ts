import type { PushoverConfig } from '../discord/types.js';

const PUSHOVER_URL = 'https://api.pushover.net/1/messages.json';

interface PushoverMessage {
  title: string;
  message: string;
  url?: string;
  urlTitle?: string;
  priority?: number;
  sound?: string;
}

export async function sendPushover(config: PushoverConfig, msg: PushoverMessage): Promise<void> {
  if (!config.enabled || !config.appToken || !config.userKey) return;

  try {
    const body: Record<string, string | number> = {
      token: config.appToken,
      user: config.userKey,
      title: msg.title,
      message: msg.message,
      priority: msg.priority ?? 1,
      sound: msg.sound ?? 'siren',
    };
    if (msg.url) body.url = msg.url;
    if (msg.urlTitle) body.url_title = msg.urlTitle;

    const res = await fetch(PUSHOVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[Pushover] HTTP ${res.status}: ${text}`);
    }
  } catch (err) {
    console.error('[Pushover] Failed to send notification:', err);
  }
}
