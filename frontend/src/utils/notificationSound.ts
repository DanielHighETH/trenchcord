let audioCtx: AudioContext | null = null;

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

/**
 * Two-tone chime for highlighted-user messages.
 */
export function playHighlightSound() {
  playTones([
    [880, 0, 0.08],
    [1175, 0.09, 0.12],
  ]);
}

/**
 * Three-tone ascending alert for highlighted user + contract address.
 * More urgent than the standard highlight chime — uses a square wave
 * at higher volume with a rapid ascending pattern.
 */
export function playContractAlertSound() {
  playTones([
    [880, 0, 0.1],
    [1175, 0.1, 0.1],
    [1480, 0.2, 0.18],
  ], 'square', 0.14);
}

/**
 * Two-tone descending alert for keyword matches.
 * Distinct from the highlight chime — uses a sine wave.
 */
export function playKeywordAlertSound() {
  playTones([
    [1047, 0, 0.08],
    [784, 0.09, 0.12],
  ], 'sine', 0.16);
}
