const TOKEN_EVER_CONFIGURED_KEY = 'trenchcord_token_ever_configured';

let currentUserId: string | undefined;

export function setTokenStateUserId(userId: string | undefined): void {
  currentUserId = userId;
}

function storageKey(userId?: string): string {
  const id = userId ?? currentUserId;
  return id ? `${TOKEN_EVER_CONFIGURED_KEY}_${id}` : TOKEN_EVER_CONFIGURED_KEY;
}

export function hasTokenEverBeenConfigured(userId?: string): boolean {
  try {
    return localStorage.getItem(storageKey(userId)) === 'true';
  } catch {
    return false;
  }
}

export function markTokenEverConfigured(userId?: string): void {
  try {
    localStorage.setItem(storageKey(userId), 'true');
  } catch {}
}
