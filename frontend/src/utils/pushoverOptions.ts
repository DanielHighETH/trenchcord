// Pushover priority + sound catalogs (per https://pushover.net/api) shared by
// the Alerts sound settings and the per-alert override editor.

import type { PushoverProfile } from '../types';

export const PUSHOVER_PRIORITIES: { id: number; label: string; desc: string }[] = [
  { id: -2, label: 'Lowest', desc: 'No sound, no banner — only the app badge count updates.' },
  { id: -1, label: 'Low', desc: 'Silent notification: shows up quietly with no sound or vibration.' },
  { id: 0, label: 'Normal', desc: 'Regular notification with sound. Respects your Pushover quiet hours.' },
  { id: 1, label: 'High', desc: 'Bypasses quiet hours and highlights the notification in red.' },
  { id: 2, label: 'Emergency', desc: 'Bypasses silent / Do Not Disturb and quiet hours, and repeats until you tap Acknowledge in the Pushover app.' },
];

// `sample` is the short filename Pushover's own docs page plays; null = no
// audible preview (vibrate/none). Fetched from api.pushover.net on demand.
export const PUSHOVER_SOUNDS: { id: string; label: string; sample: string | null }[] = [
  { id: 'pushover', label: 'Pushover', sample: 'po' },
  { id: 'bike', label: 'Bike', sample: 'bk' },
  { id: 'bugle', label: 'Bugle', sample: 'bu' },
  { id: 'cashregister', label: 'Cash Register', sample: 'ch' },
  { id: 'classical', label: 'Classical', sample: 'cl' },
  { id: 'cosmic', label: 'Cosmic', sample: 'co' },
  { id: 'falling', label: 'Falling', sample: 'fa' },
  { id: 'gamelan', label: 'Gamelan', sample: 'gl' },
  { id: 'incoming', label: 'Incoming', sample: 'ic' },
  { id: 'intermission', label: 'Intermission', sample: 'im' },
  { id: 'magic', label: 'Magic', sample: 'ma' },
  { id: 'mechanical', label: 'Mechanical', sample: 'mc' },
  { id: 'pianobar', label: 'Piano Bar', sample: 'pn' },
  { id: 'siren', label: 'Siren', sample: 'si' },
  { id: 'spacealarm', label: 'Space Alarm', sample: 'sp' },
  { id: 'tugboat', label: 'Tug Boat', sample: 'tg' },
  { id: 'alien', label: 'Alien Alarm (long)', sample: 'ln' },
  { id: 'climb', label: 'Climb (long)', sample: 'mb' },
  { id: 'persistent', label: 'Persistent (long)', sample: 'ps' },
  { id: 'echo', label: 'Pushover Echo (long)', sample: 'ec' },
  { id: 'updown', label: 'Up Down (long)', sample: 'ud' },
  { id: 'vibrate', label: 'Vibrate Only', sample: null },
  { id: 'none', label: 'None (silent)', sample: null },
];

export const DEFAULT_PUSHOVER_PROFILES: { normal: PushoverProfile; critical: PushoverProfile } = {
  normal: { priority: 0, sound: 'pushover' },
  critical: { priority: 2, sound: 'persistent', retry: 60, expire: 3600 },
};

let currentSample: HTMLAudioElement | null = null;

/** Play a sound's preview clip (fetched from api.pushover.net). */
export function playSoundSample(soundId: string): void {
  const sound = PUSHOVER_SOUNDS.find((s) => s.id === soundId);
  if (!sound?.sample) return;
  currentSample?.pause();
  currentSample = new Audio(`https://api.pushover.net/sounds/${sound.sample}.mp3`);
  void currentSample.play().catch(() => {
    // Autoplay refusal or offline — preview is best-effort.
  });
}
