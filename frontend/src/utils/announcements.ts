export interface Announcement {
  id: string;
  title: string;
  body: string;
  level: 'info' | 'warning' | 'critical' | string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  createdAt: string;
  expiresAt: string | null;
}

// Absolute URL to a static JSON feed with open CORS, so all clients (desktop,
// localhost website, hosted web) can read it without any backend/database.
// Published by editing announcements.json at the repo root and pushing to main.
export const ANNOUNCEMENTS_URL: string =
  import.meta.env.VITE_ANNOUNCEMENTS_URL ??
  'https://raw.githubusercontent.com/DanielHighETH/trenchcord/main/announcements.json';

const SEEN_KEY = 'trenchcord_seen_announcements';

export function getSeenIds(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function markSeen(id: string): void {
  try {
    const seen = getSeenIds();
    if (seen.includes(id)) return;
    // Cap the list so it can't grow unbounded over time.
    const next = [...seen, id].slice(-200);
    localStorage.setItem(SEEN_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export async function fetchAnnouncements(): Promise<Announcement[]> {
  try {
    const res = await fetch(ANNOUNCEMENTS_URL, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const data = await res.json();
    const list = Array.isArray(data?.announcements) ? data.announcements : [];
    return list as Announcement[];
  } catch {
    return [];
  }
}

/** Active, non-expired, not-yet-seen announcements, newest first. */
export function selectUnseen(announcements: Announcement[]): Announcement[] {
  const seen = new Set(getSeenIds());
  const now = Date.now();
  return announcements
    .filter((a) => a && typeof a.id === 'string' && !seen.has(a.id))
    .filter((a) => !a.expiresAt || new Date(a.expiresAt).getTime() > now)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
