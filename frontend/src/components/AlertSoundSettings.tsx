import { useState, useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import { X, Loader2, Volume2, Play } from 'lucide-react';
import type { PremiumUrgency, PushoverProfile } from '../types';
import {
  DEFAULT_PUSHOVER_PROFILES,
  PUSHOVER_PRIORITIES,
  PUSHOVER_SOUNDS,
  playSoundSample,
} from '../utils/pushoverOptions';
import pushoverSettingsImg from '../assets/pushover-alert-settings.jpg';

const primaryBtnCls =
  'flex items-center gap-2 px-3 py-2 bg-discord-blurple hover:bg-discord-blurple-hover rounded text-sm text-white transition-colors disabled:opacity-50';
const inputCls =
  'bg-discord-dark border border-white/10 rounded px-2.5 py-1.5 text-sm text-discord-text placeholder:text-discord-text-muted/60 focus:outline-none focus:border-discord-blurple/60';

/** Flex-wrap sound picker with per-sound preview. Shared with AlertModal. */
export function SoundChips({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {PUSHOVER_SOUNDS.map((s) => (
        <div
          key={s.id}
          role="button"
          tabIndex={0}
          onClick={() => onChange(s.id)}
          onKeyDown={(e) => { if (e.key === 'Enter') onChange(s.id); }}
          className={`flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
            value === s.id
              ? 'bg-discord-blurple text-white'
              : 'bg-discord-dark text-discord-text-muted hover:text-discord-text'
          }`}
        >
          {s.label}
          {s.sample ? (
            <button
              onClick={(e) => { e.stopPropagation(); playSoundSample(s.id); }}
              className={`p-0.5 rounded transition-colors ${
                value === s.id ? 'hover:bg-white/20' : 'hover:bg-white/10'
              }`}
              title="Play preview"
            >
              <Play size={10} />
            </button>
          ) : (
            <span className="w-[15px]" />
          )}
        </div>
      ))}
    </div>
  );
}

interface EditableProfile {
  priority: number;
  sound: string;
  retryStr: string;
  expireStr: string;
}

function toEditable(profile: PushoverProfile | undefined, fallback: PushoverProfile): EditableProfile {
  const p = profile ?? fallback;
  return {
    priority: p.priority,
    sound: p.sound,
    retryStr: String(p.retry ?? DEFAULT_PUSHOVER_PROFILES.critical.retry),
    expireStr: String(p.expire ?? DEFAULT_PUSHOVER_PROFILES.critical.expire),
  };
}

export default function AlertSoundSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const premiumNotify = useAppStore((s) => s.premiumNotify);
  const savePremiumNotify = useAppStore((s) => s.savePremiumNotify);

  const [tab, setTab] = useState<PremiumUrgency>('normal');
  const [profiles, setProfiles] = useState<Record<PremiumUrgency, EditableProfile>>({
    normal: toEditable(undefined, DEFAULT_PUSHOVER_PROFILES.normal),
    critical: toEditable(undefined, DEFAULT_PUSHOVER_PROFILES.critical),
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab('normal');
    setMsg(null);
    setError(null);
    setProfiles({
      normal: toEditable(premiumNotify?.pushoverProfiles?.normal, DEFAULT_PUSHOVER_PROFILES.normal),
      critical: toEditable(premiumNotify?.pushoverProfiles?.critical, DEFAULT_PUSHOVER_PROFILES.critical),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const current = profiles[tab];
  const patch = (changes: Partial<EditableProfile>) => {
    setProfiles((p) => ({ ...p, [tab]: { ...p[tab], ...changes } }));
    setMsg(null);
    setError(null);
  };

  const build = (p: EditableProfile, name: string): PushoverProfile | null => {
    const profile: PushoverProfile = { priority: p.priority, sound: p.sound };
    if (p.priority === 2) {
      const retry = parseInt(p.retryStr, 10);
      const expire = parseInt(p.expireStr, 10);
      if (!Number.isInteger(retry) || retry < 30 || retry > 10_800) {
        setError(`${name}: retry must be 30–10800 seconds.`);
        return null;
      }
      if (!Number.isInteger(expire) || expire < 30 || expire > 10_800) {
        setError(`${name}: expire must be 30–10800 seconds.`);
        return null;
      }
      profile.retry = retry;
      profile.expire = expire;
    }
    return profile;
  };

  const save = async () => {
    setError(null);
    const normal = build(profiles.normal, 'Normal');
    if (!normal) return;
    const critical = build(profiles.critical, 'Critical');
    if (!critical) return;
    setBusy(true);
    const result = await savePremiumNotify({ pushover_profiles: { normal, critical } });
    setBusy(false);
    if (!result.success) setError(result.error ?? 'Save failed.');
    else setMsg('Saved.');
  };

  const resetTab = () => {
    setProfiles((p) => ({ ...p, [tab]: toEditable(undefined, DEFAULT_PUSHOVER_PROFILES[tab]) }));
    setMsg(null);
    setError(null);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 pt-[var(--safe-top)] pb-[var(--safe-bottom)] animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-discord-sidebar rounded-lg shadow-2xl w-full max-w-lg mx-4 animate-pop-in max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/5">
          <h3 className="flex items-center gap-2 text-base font-semibold text-white">
            <Volume2 size={16} className="text-discord-blurple" /> Alert sounds
          </h3>
          <button onClick={onClose} className="text-discord-text-muted hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-[11px] text-discord-text-muted">
            Every alert is either <span className="text-discord-text">Normal</span> or{' '}
            <span className="text-discord-text">Critical</span> — here you define how each one is
            pushed via Pushover. Telegram and Discord DMs are not affected.
          </p>

          <div className="flex gap-1">
            {(['normal', 'critical'] as PremiumUrgency[]).map((id) => (
              <button
                key={id}
                onClick={() => { setTab(id); setError(null); }}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  tab === id ? 'bg-discord-blurple text-white' : 'bg-discord-dark text-discord-text-muted hover:text-discord-text'
                }`}
              >
                {id === 'normal' ? 'Normal' : 'Critical'}
              </button>
            ))}
            <button
              onClick={resetTab}
              className="ml-auto px-2 py-1.5 rounded text-[11px] text-discord-text-muted hover:text-discord-text transition-colors"
            >
              Reset to default
            </button>
          </div>

          {/* Priority */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-white">Priority</p>
            {PUSHOVER_PRIORITIES.map((p) => (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => patch({ priority: p.id })}
                onKeyDown={(e) => { if (e.key === 'Enter') patch({ priority: p.id }); }}
                className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                  current.priority === p.id
                    ? 'border-discord-blurple/60 bg-discord-blurple/10'
                    : 'border-white/5 bg-discord-dark/60 hover:bg-white/5'
                }`}
              >
                <span
                  className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${
                    current.priority === p.id ? 'bg-discord-blurple' : 'bg-white/15'
                  }`}
                />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-white">
                    {p.label} <span className="text-discord-text-muted text-xs">({p.id})</span>
                  </span>
                  <span className="block text-[11px] text-discord-text-muted">{p.desc}</span>
                </span>
              </div>
            ))}
          </div>

          {current.priority === 2 && (
            <div className="bg-discord-yellow/10 border border-discord-yellow/30 rounded-lg p-3 space-y-2">
              <p className="text-[11px] text-discord-text-muted">
                Emergency notifications bypass silent / Do Not Disturb mode and keep re-alerting
                until you tap <span className="text-discord-text">Acknowledge</span> on the
                notification in the Pushover app.
              </p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-discord-text-muted">
                Repeat every
                <input
                  value={current.retryStr}
                  onChange={(e) => patch({ retryStr: e.target.value })}
                  className={`${inputCls} w-20 text-center`}
                />
                s, give up after
                <input
                  value={current.expireStr}
                  onChange={(e) => patch({ expireStr: e.target.value })}
                  className={`${inputCls} w-20 text-center`}
                />
                s
              </div>
              <p className="text-[10px] text-discord-text-muted/70">
                Repeat: 30–10800 s · Give up: max 10800 s (3 hours)
              </p>
            </div>
          )}

          {/* Sound */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-white">Sound</p>
            <SoundChips value={current.sound} onChange={(id) => patch({ sound: id })} />
          </div>

          {/* Mirrors the Pushover app's Settings → Alert Settings screen */}
          <div className="bg-discord-dark/60 border border-white/5 rounded-lg p-3 space-y-1.5">
            <p className="text-xs font-semibold text-white">Recommended Pushover app settings</p>
            <p className="text-[11px] text-discord-text-muted">
              In the Pushover app, open <span className="text-discord-text">Settings → Alert Settings</span> and:
            </p>
            <ul className="text-[11px] text-discord-text-muted space-y-1 list-disc pl-4">
              <li>
                Turn <span className="text-discord-text">Critical Alerts for emergency-priority</span>{' '}
                <span className="text-discord-green">ON</span> — this is what lets Critical alerts
                break through your phone's silent / Do Not Disturb mode (iOS asks for permission once).
              </li>
              <li>
                Set <span className="text-discord-text">Volume for Critical Alerts</span> loud enough
                to wake you.
              </li>
              <li>
                Keep <span className="text-discord-text">Always use default</span> and{' '}
                <span className="text-discord-text">Always use high-priority default</span>{' '}
                <span className="text-discord-red">OFF</span> — otherwise the app ignores the sounds
                you pick here.
              </li>
            </ul>
            <button
              onClick={() => setGuideOpen((v) => !v)}
              className="text-[11px] text-discord-blurple hover:underline"
            >
              {guideOpen ? 'Hide the settings screen' : 'Show me how it looks in the app'}
            </button>
            {guideOpen && (
              <img
                src={pushoverSettingsImg}
                alt="Pushover app — Settings → Alert Settings with Critical Alerts for emergency-priority ON and the always-use-default toggles OFF"
                className="w-full max-w-[300px] rounded-lg border border-white/10"
              />
            )}
          </div>

          {error && <p className="text-xs text-discord-red">{error}</p>}
          {msg && <p className="text-xs text-discord-green">{msg}</p>}
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-t border-white/5">
          <button onClick={() => void save()} disabled={busy} className={primaryBtnCls}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : null} Save
          </button>
        </div>
      </div>
    </div>
  );
}
