import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';
import type { FrontendMessage } from '../types';

type Attachment = FrontendMessage['attachments'][number];

/** Discord's own set, cycled by the speed pill. */
const PLAYBACK_RATES = [1, 1.5, 2];

/** Bars drawn for every voice note, regardless of how many samples the
 * platform sent -- a 3-second note and a 5-minute one look the same width. */
const BAR_COUNT = 36;

/** Silence still gets a visible dot instead of a gap. */
const MIN_BAR = 0.12;

/** One voice note at a time, as on Discord: starting one stops whatever was
 * already talking, even in another channel's pane. */
let nowPlaying: HTMLAudioElement | null = null;

/**
 * A voice note, as opposed to an audio file someone uploaded. Discord tags
 * them with `duration_secs`/`waveform` (message flag 1<<13); the backend
 * normalises Telegram's voice notes into the same shape. The filename check
 * covers older Discord history, which arrives without those fields.
 */
export function isVoiceAttachment(att: Attachment): boolean {
  if (!att.content_type?.startsWith('audio/')) return false;
  return att.duration_secs !== undefined
    || !!att.waveform
    || /^voice-message\./i.test(att.filename);
}

/**
 * `waveform` is base64 of one 0-255 amplitude sample per byte (the backend
 * rescales Telegram's 5-bit samples into that range). Resampled to BAR_COUNT
 * buckets and normalised against the loudest sample, so a quietly recorded
 * note still draws a readable shape.
 */
function decodeWaveform(waveform: string | undefined): number[] | null {
  if (!waveform) return null;
  let bytes: number[];
  try {
    const bin = atob(waveform);
    bytes = Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null; // Malformed base64 -- fall back to flat bars.
  }
  if (bytes.length === 0) return null;

  const peak = Math.max(...bytes, 1);
  const bars: number[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    const start = Math.floor((i * bytes.length) / BAR_COUNT);
    const end = Math.max(start + 1, Math.floor(((i + 1) * bytes.length) / BAR_COUNT));
    let sum = 0;
    for (let j = start; j < end; j++) sum += bytes[j];
    bars.push(Math.max(MIN_BAR, sum / (end - start) / peak));
  }
  return bars;
}

function formatTime(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export default function VoiceMessage({ att }: { att: Attachment }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(att.duration_secs ?? 0);
  const [rateIndex, setRateIndex] = useState(0);
  const [muted, setMuted] = useState(false);
  const [failed, setFailed] = useState(false);

  // No waveform (older history, or a platform that doesn't send one): flat
  // bars rather than an invented shape the audio never had.
  const bars = useMemo(
    () => decodeWaveform(att.waveform) ?? new Array(BAR_COUNT).fill(0.45),
    [att.waveform],
  );

  // `timeupdate` only fires ~4x a second, which makes the waveform lurch
  // forward in visible steps; drive the fill off the frame clock instead.
  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    const tick = () => {
      if (audioRef.current) setPosition(audioRef.current.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  // Scrolling a voice note out of the message list (or switching rooms) must
  // not leave it playing from nowhere.
  useEffect(() => () => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      if (nowPlaying === a) nowPlaying = null;
    }
  }, []);

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      if (nowPlaying && nowPlaying !== a) nowPlaying.pause();
      nowPlaying = a;
      a.playbackRate = PLAYBACK_RATES[rateIndex];
      a.play().catch((err: DOMException) => {
        // Pausing mid-load rejects the play promise -- only a real decode or
        // format failure means this browser can't play the note.
        if (err?.name !== 'AbortError') setFailed(true);
      });
    } else {
      a.pause();
    }
  };

  const seekToClientX = (clientX: number) => {
    const el = trackRef.current;
    const a = audioRef.current;
    if (!el || !a) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const total = duration || a.duration;
    if (!Number.isFinite(total) || total <= 0) return;
    a.currentTime = ratio * total;
    setPosition(a.currentTime);
  };

  const nudge = (seconds: number) => {
    const a = audioRef.current;
    if (!a) return;
    const total = duration || a.duration || 0;
    a.currentTime = Math.min(total, Math.max(0, a.currentTime + seconds));
    setPosition(a.currentTime);
  };

  const cycleRate = () => {
    const next = (rateIndex + 1) % PLAYBACK_RATES.length;
    setRateIndex(next);
    if (audioRef.current) audioRef.current.playbackRate = PLAYBACK_RATES[next];
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (audioRef.current) audioRef.current.muted = next;
  };

  // Safari (and so the iOS shell) can refuse Discord's ogg/opus outright.
  // A dead player would be worse than the file link it replaced.
  if (failed) {
    return (
      <a
        href={att.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-discord-text-link hover:underline text-sm"
      >
        Voice message{duration ? ` · ${formatTime(duration)}` : ''}
      </a>
    );
  }

  const progress = duration > 0 ? Math.min(1, position / duration) : 0;
  const playedBars = progress * BAR_COUNT;

  return (
    <div className="flex items-center gap-2.5 rounded-3xl bg-discord-embed-bg px-3 py-2 w-full sm:w-[380px] max-w-full">
      <audio
        ref={audioRef}
        src={att.proxy_url}
        // Duration is already known for platform-tagged notes, so the audio
        // itself is only fetched once someone presses play; without it the
        // player has to read metadata to know how long the note is.
        preload={att.duration_secs ? 'none' : 'metadata'}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setPosition(0);
          if (audioRef.current) audioRef.current.currentTime = 0;
        }}
        onError={() => setFailed(true)}
      />

      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
        className="shrink-0 h-10 w-10 compact:h-9 compact:w-9 rounded-full bg-discord-blurple hover:bg-discord-blurple-hover transition-colors grid place-items-center"
      >
        {isPlaying
          ? <Pause className="h-4 w-4 text-white fill-white" />
          : <Play className="h-4 w-4 text-white fill-white translate-x-[1px]" />}
      </button>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Seek voice message"
        aria-valuemin={0}
        aria-valuemax={Math.floor(duration)}
        aria-valuenow={Math.floor(position)}
        aria-valuetext={`${formatTime(position)} of ${formatTime(duration)}`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          seekToClientX(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) seekToClientX(e.clientX);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') { e.preventDefault(); nudge(5); }
          else if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-5); }
          else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); togglePlay(); }
        }}
        className="flex-1 min-w-0 h-8 flex items-center gap-[2px] overflow-hidden cursor-pointer touch-none outline-none focus-visible:ring-1 focus-visible:ring-discord-blurple rounded"
      >
        {bars.map((height, i) => (
          <div
            key={i}
            style={{ height: `${Math.round(height * 100)}%` }}
            className={`flex-1 min-w-px rounded-full ${i < playedBars ? 'bg-white' : 'bg-discord-text-muted'}`}
          />
        ))}
      </div>

      <span className="shrink-0 text-xs tabular-nums text-discord-text-muted">
        {formatTime(isPlaying || position > 0 ? position : duration)}
      </span>

      <button
        type="button"
        onClick={cycleRate}
        aria-label={`Playback speed ${PLAYBACK_RATES[rateIndex]}x`}
        className="shrink-0 rounded bg-discord-input hover:bg-discord-hover-light transition-colors px-1.5 py-0.5 text-[11px] font-medium text-discord-text-normal tabular-nums"
      >
        {PLAYBACK_RATES[rateIndex]}x
      </button>

      <button
        type="button"
        onClick={toggleMute}
        aria-label={muted ? 'Unmute voice message' : 'Mute voice message'}
        className="shrink-0 text-discord-text-muted hover:text-discord-text-normal transition-colors"
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
    </div>
  );
}
