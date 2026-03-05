import type { SoundConfig, SoundType } from '../types';

let audioCtx: AudioContext | null = null;
const audioCache = new Map<string, HTMLAudioElement>();

function getAudioContext(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function playTones(tones: [number, number, number][], type: OscillatorType = 'triangle', volume = 0.18) {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;

    for (const [freq, offset, dur] of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.value = freq;

      gain.gain.setValueAtTime(0, now + offset);
      gain.gain.linearRampToValueAtTime(volume, now + offset + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + offset);
      osc.stop(now + offset + dur + 0.01);
    }
  } catch {
    // Audio not supported or blocked
  }
}

function playAudioFile(url: string, volume: number) {
  try {
    let audio = audioCache.get(url);
    if (!audio) {
      audio = new Audio(url);
      audioCache.set(url, audio);
    }
    audio.volume = Math.max(0, Math.min(1, volume));
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch {
    // Audio not supported
  }
}

export const PRESET_SOUNDS = [
  { id: 'ping', label: 'Ping', file: '/sounds/ping.wav' },
  { id: 'double-ping', label: 'Double Ping', file: '/sounds/double-ping.wav' },
  { id: 'rising-chime', label: 'Rising Chime', file: '/sounds/rising-chime.wav' },
  { id: 'falling-chime', label: 'Falling Chime', file: '/sounds/falling-chime.wav' },
  { id: 'pop', label: 'Pop', file: '/sounds/pop.wav' },
  { id: 'alert', label: 'Alert', file: '/sounds/alert.wav' },
  { id: 'bell', label: 'Bell', file: '/sounds/bell.wav' },
  { id: 'chirp', label: 'Chirp', file: '/sounds/chirp.wav' },
  { id: 'deep', label: 'Deep', file: '/sounds/deep.wav' },
  { id: 'sparkle', label: 'Sparkle', file: '/sounds/sparkle.wav' },
] as const;

export type PresetSoundId = (typeof PRESET_SOUNDS)[number]['id'];

export function getPresetUrl(presetId: string): string | undefined {
  return PRESET_SOUNDS.find((p) => p.id === presetId)?.file;
}

const BUILT_IN_SOUNDS: Record<SoundType, { tones: [number, number, number][]; type: OscillatorType; baseVolume: number }> = {
  highlight: {
    tones: [[880, 0, 0.08], [1175, 0.09, 0.12]],
    type: 'triangle',
    baseVolume: 0.18,
  },
  contractAlert: {
    tones: [[880, 0, 0.1], [1175, 0.1, 0.1], [1480, 0.2, 0.18]],
    type: 'square',
    baseVolume: 0.14,
  },
  keywordAlert: {
    tones: [[1047, 0, 0.08], [784, 0.09, 0.12]],
    type: 'sine',
    baseVolume: 0.16,
  },
};

export function playSound(soundType: SoundType, soundConfig?: SoundConfig) {
  if (soundConfig && !soundConfig.enabled) return;

  const volumeFraction = (soundConfig?.volume ?? 80) / 100;

  if (soundConfig?.useCustom && soundConfig.customSoundUrl) {
    playAudioFile(soundConfig.customSoundUrl, volumeFraction);
    return;
  }

  if (soundConfig?.presetSound) {
    const url = getPresetUrl(soundConfig.presetSound);
    if (url) {
      playAudioFile(url, volumeFraction);
      return;
    }
  }

  const builtin = BUILT_IN_SOUNDS[soundType];
  playTones(builtin.tones, builtin.type, builtin.baseVolume * volumeFraction);
}

export function playHighlightSound(soundConfig?: SoundConfig) {
  playSound('highlight', soundConfig);
}

export function playContractAlertSound(soundConfig?: SoundConfig) {
  playSound('contractAlert', soundConfig);
}

export function playKeywordAlertSound(soundConfig?: SoundConfig) {
  playSound('keywordAlert', soundConfig);
}

export function previewSound(soundType: SoundType, soundConfig: SoundConfig) {
  const volumeFraction = soundConfig.volume / 100;

  if (soundConfig.useCustom && soundConfig.customSoundUrl) {
    playAudioFile(soundConfig.customSoundUrl, volumeFraction);
    return;
  }

  if (soundConfig.presetSound) {
    const url = getPresetUrl(soundConfig.presetSound);
    if (url) {
      playAudioFile(url, volumeFraction);
      return;
    }
  }

  const builtin = BUILT_IN_SOUNDS[soundType];
  playTones(builtin.tones, builtin.type, builtin.baseVolume * volumeFraction);
}

export function previewPreset(presetId: string, volume = 80) {
  const url = getPresetUrl(presetId);
  if (url) playAudioFile(url, volume / 100);
}
