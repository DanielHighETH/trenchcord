/**
 * Helpers for inspecting a settings-backup file before importing it.
 *
 * Both supported shapes are handled: the sanitized export
 * (`{ config: {...}, rooms: [...] }`) and a raw local `config.json`
 * (flat AppConfig).
 */

function configOf(raw: unknown): Record<string, any> | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, any>;
  return data.config && typeof data.config === 'object' ? data.config : data;
}

/**
 * Number of Telegram sessions a backup would import. A Telegram session wraps
 * a single MTProto auth key, and Telegram revokes the key with
 * AUTH_KEY_DUPLICATED when two devices use it concurrently — so a session
 * moved to a second device must stop being used on the first, or the new
 * device should log in fresh instead.
 */
export function backupTelegramSessionCount(raw: unknown): number {
  const cfg = configOf(raw);
  if (!cfg || !Array.isArray(cfg.telegramSessions)) return 0;
  return cfg.telegramSessions.filter((s: unknown) => typeof s === 'string' && s.length > 0).length;
}

/** Whether the backup carries Telegram API credentials (portable, per-app). */
export function backupHasTelegramApiCredentials(raw: unknown): boolean {
  const cfg = configOf(raw);
  return !!cfg && typeof cfg.telegramApiId === 'string' && cfg.telegramApiId !== '' &&
    typeof cfg.telegramApiHash === 'string' && cfg.telegramApiHash !== '';
}
