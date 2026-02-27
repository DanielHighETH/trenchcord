import type { SoundConfig, SoundType } from '../types';

let audioCtx: AudioContext | null = null;
const customAudioCache = new Map<string, HTMLAudioElement>();

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

function playCustomSound(url: string, volume: number) {
  try {
    let audio = customAudioCache.get(url);
    if (!audio) {
      audio = new Audio(url);
      customAudioCache.set(url, audio);
    }
    audio.volume = Math.max(0, Math.min(1, volume));
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch {
    // Audio not supported
  }
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
    playCustomSound(soundConfig.customSoundUrl, volumeFraction);
    return;
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
    playCustomSound(soundConfig.customSoundUrl, volumeFraction);
    return;
  }

  const builtin = BUILT_IN_SOUNDS[soundType];
  playTones(builtin.tones, builtin.type, builtin.baseVolume * volumeFraction);
}
