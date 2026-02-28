import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../stores/appStore';
import type { ChannelRef } from '../types';
import { Check, ChevronRight, ChevronLeft, Hash, Search, Sparkles, Layers, Eye, Zap } from 'lucide-react';

const ONBOARDING_KEY = 'trenchcord_onboarding_complete';

type Step = 'welcome' | 'guilds' | 'room' | 'done';

const STEPS: Step[] = ['welcome', 'guilds', 'room', 'done'];

const TIPS = [
  { icon: Layers, title: 'Rooms', desc: 'Aggregate channels from multiple servers into a single feed.' },
  { icon: Eye, title: 'Highlights', desc: 'Track specific users — their messages get visual alerts and sounds.' },
  { icon: Zap, title: 'Contracts', desc: 'Auto-detect Solana & EVM contract addresses with one-click trading links.' },
  { icon: Search, title: 'Keywords', desc: 'Set keyword patterns to catch important messages with regex or simple matching.' },
];

export function isOnboardingComplete(): boolean {
  return localStorage.getItem(ONBOARDING_KEY) === 'true';
}

export function markOnboardingComplete(): void {
  localStorage.setItem(ONBOARDING_KEY, 'true');
}

export default function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const guilds = useAppStore((s) => s.guilds);
  const config = useAppStore((s) => s.config);
  const fetchGuilds = useAppStore((s) => s.fetchGuilds);
  const updateConfig = useAppStore((s) => s.updateConfig);
  const createRoom = useAppStore((s) => s.createRoom);
  const fetchHistory = useAppStore((s) => s.fetchHistory);

  const [step, setStep] = useState<Step>('welcome');
  const [enabledGuilds, setEnabledGuilds] = useState<string[]>([]);
  const [guildSearch, setGuildSearch] = useState('');
  const [roomName, setRoomName] = useState('');
  const [selectedChannels, setSelectedChannels] = useState<ChannelRef[]>([]);
  const [channelSearch, setChannelSearch] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchGuilds();
  }, [fetchGuilds]);

  useEffect(() => {
    if (config?.enabledGuilds) {
      setEnabledGuilds(config.enabledGuilds);
    }
  }, [config?.enabledGuilds]);

  const stepIndex = STEPS.indexOf(step);

  const filteredGuilds = useMemo(() =>
    guilds.filter((g) =>
      !guildSearch || g.name.toLowerCase().includes(guildSearch.toLowerCase())
    ),
    [guilds, guildSearch]
  );

  const availableGuilds = useMemo(() =>
    guilds.filter((g) => enabledGuilds.includes(g.id)),
    [guilds, enabledGuilds]
  );

  const filteredChannelGuilds = useMemo(() =>
    availableGuilds
      .map((g) => ({
        ...g,
        channels: g.channels.filter(
          (c) => !channelSearch || c.name.toLowerCase().includes(channelSearch.toLowerCase()) || g.name.toLowerCase().includes(channelSearch.toLowerCase())
        ),
      }))
      .filter((g) => g.channels.length > 0),
    [availableGuilds, channelSearch]
  );

  const toggleGuild = (guildId: string) => {
    setEnabledGuilds((prev) =>
      prev.includes(guildId) ? prev.filter((id) => id !== guildId) : [...prev, guildId]
    );
  };

  const isChannelSelected = (channelId: string) =>
    selectedChannels.some((c) => c.channelId === channelId);

  const toggleChannel = (ref: ChannelRef) => {
    if (isChannelSelected(ref.channelId)) {
      setSelectedChannels((prev) => prev.filter((c) => c.channelId !== ref.channelId));
    } else {
      setSelectedChannels((prev) => [...prev, ref]);
    }
  };

  const handleNext = async () => {
    if (step === 'welcome') {
      setStep('guilds');
    } else if (step === 'guilds') {
      setSaving(true);
      await updateConfig({ enabledGuilds });
      setSaving(false);
      setStep('room');
    } else if (step === 'room') {
      if (!roomName.trim() || selectedChannels.length === 0) return;
      setSaving(true);
      await createRoom(roomName.trim(), selectedChannels, []);
      await fetchHistory();
      setSaving(false);
      setStep('done');
    } else if (step === 'done') {
      markOnboardingComplete();
      onComplete();
    }
  };

  const handleBack = () => {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  };

  const handleSkip = () => {
    markOnboardingComplete();
    onComplete();
  };

  const canProceed = () => {
    if (step === 'guilds') return enabledGuilds.length > 0;
    if (step === 'room') return roomName.trim().length > 0 && selectedChannels.length > 0;
    return true;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-discord-darker">
      <div className="w-full max-w-2xl mx-4">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === stepIndex
                  ? 'w-8 bg-discord-blurple'
                  : i < stepIndex
                    ? 'w-1.5 bg-discord-blurple/50'
                    : 'w-1.5 bg-discord-divider'
              }`}
            />
          ))}
        </div>

        <div className="bg-discord-sidebar rounded-xl shadow-2xl overflow-hidden">
          {/* ── Welcome ── */}
          {step === 'welcome' && (
            <div className="px-10 py-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-discord-blurple/10 flex items-center justify-center mx-auto mb-6">
                <Sparkles size={32} className="text-discord-blurple" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-3">Welcome to Trenchcord</h1>
              <p className="text-discord-text-muted text-sm leading-relaxed max-w-md mx-auto mb-2">
                Let's get you set up in under a minute. We'll walk you through enabling your
                Discord servers and creating your first monitoring room.
              </p>
              <p className="text-discord-channel-icon text-xs">
                You can always change these settings later.
              </p>
            </div>
          )}

          {/* ── Guild Selection ── */}
          {step === 'guilds' && (
            <div className="px-8 py-8">
              <h2 className="text-xl font-bold text-white mb-1">Enable your servers</h2>
              <p className="text-discord-text-muted text-sm mb-5">
                Pick the Discord servers you want to monitor. Only enabled servers will appear when you configure rooms.
              </p>

              {guilds.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-discord-text-muted">
                  <div className="w-6 h-6 border-2 border-discord-blurple border-t-transparent rounded-full animate-spin mb-3" />
                  <span className="text-sm">Loading your servers...</span>
                </div>
              ) : (
                <>
                  <div className="relative mb-3">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-discord-text-muted" />
                    <input
                      type="text"
                      value={guildSearch}
                      onChange={(e) => setGuildSearch(e.target.value)}
                      placeholder="Search servers..."
                      className="w-full bg-discord-dark border-none rounded px-3 py-2 pl-9 text-sm text-discord-text outline-none focus:ring-2 focus:ring-discord-blurple/40"
                    />
                  </div>

                  <div className="text-[11px] text-discord-text-muted mb-2">
                    {enabledGuilds.length} of {guilds.length} selected
                  </div>

                  <div className="space-y-1 max-h-[320px] overflow-y-auto pr-1">
                    {filteredGuilds.map((guild) => {
                      const enabled = enabledGuilds.includes(guild.id);
                      return (
                        <button
                          key={guild.id}
                          onClick={() => toggleGuild(guild.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                            enabled
                              ? 'bg-discord-blurple/15 ring-1 ring-discord-blurple/30'
                              : 'bg-discord-dark/50 hover:bg-discord-hover'
                          }`}
                        >
                          {guild.icon ? (
                            <img
                              src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.webp?size=32`}
                              alt=""
                              className="w-8 h-8 rounded-full shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-discord-dark flex items-center justify-center shrink-0 text-xs font-semibold text-discord-text-muted">
                              {guild.name.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-discord-text truncate font-medium">{guild.name}</div>
                            <div className="text-[11px] text-discord-text-muted">
                              {guild.channels.length} channel{guild.channels.length !== 1 ? 's' : ''}
                            </div>
                          </div>
                          <div
                            className={`w-5 h-5 rounded flex items-center justify-center shrink-0 transition-colors ${
                              enabled ? 'bg-discord-blurple' : 'border border-discord-divider'
                            }`}
                          >
                            {enabled && <Check size={14} className="text-white" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Create Room ── */}
          {step === 'room' && (
            <div className="px-8 py-8">
              <h2 className="text-xl font-bold text-white mb-1">Create your first room</h2>
              <p className="text-discord-text-muted text-sm mb-5">
                A room aggregates channels from your enabled servers into a single feed. Give it a name and pick some channels.
              </p>

              <div className="mb-4">
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted mb-2">
                  Room Name
                </label>
                <input
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="e.g. alpha-feed, whale-watching, main"
                  autoFocus
                  className="w-full bg-discord-dark border-none rounded px-3 py-2.5 text-sm text-discord-text outline-none focus:ring-2 focus:ring-discord-blurple/40"
                />
              </div>

              <div className="mb-3">
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted mb-2">
                  Channels ({selectedChannels.length} selected)
                </label>
                <div className="relative mb-3">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-discord-text-muted" />
                  <input
                    type="text"
                    value={channelSearch}
                    onChange={(e) => setChannelSearch(e.target.value)}
                    placeholder="Search channels..."
                    className="w-full bg-discord-dark border-none rounded px-3 py-2 pl-9 text-sm text-discord-text outline-none focus:ring-2 focus:ring-discord-blurple/40"
                  />
                </div>
              </div>

              <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
                {filteredChannelGuilds.map((guild) => (
                  <div key={guild.id}>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted mb-1 sticky top-0 bg-discord-sidebar py-1">
                      {guild.name}
                    </div>
                    <div className="space-y-0.5 ml-1">
                      {guild.channels.map((ch) => {
                        const selected = isChannelSelected(ch.id);
                        return (
                          <button
                            key={ch.id}
                            onClick={() =>
                              toggleChannel({
                                guildId: guild.id,
                                channelId: ch.id,
                                guildName: guild.name,
                                channelName: ch.name,
                              })
                            }
                            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-sm text-left transition-colors ${
                              selected
                                ? 'bg-discord-blurple/20 text-discord-blurple'
                                : 'text-discord-channel-icon hover:bg-discord-hover/50 hover:text-discord-text'
                            }`}
                          >
                            <Hash size={14} className="shrink-0" />
                            <span className="truncate flex-1">{ch.name}</span>
                            {selected && (
                              <Check size={14} className="shrink-0 text-discord-blurple" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {filteredChannelGuilds.length === 0 && enabledGuilds.length > 0 && (
                  <p className="text-sm text-discord-text-muted text-center py-6">
                    {channelSearch ? 'No channels match your search.' : 'Loading channels...'}
                  </p>
                )}
                {enabledGuilds.length === 0 && (
                  <p className="text-sm text-discord-text-muted text-center py-6">
                    Go back and enable some servers first.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Done ── */}
          {step === 'done' && (
            <div className="px-10 py-10">
              <div className="text-center mb-8">
                <div className="w-14 h-14 rounded-full bg-discord-green/10 flex items-center justify-center mx-auto mb-5">
                  <Check size={28} className="text-discord-green" />
                </div>
                <h2 className="text-xl font-bold text-white mb-2">You're all set!</h2>
                <p className="text-discord-text-muted text-sm">
                  Your room is live and messages are streaming. Here's what else you can do:
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-2">
                {TIPS.map((tip) => (
                  <div key={tip.title} className="flex gap-3 p-3 rounded-lg bg-discord-dark/50">
                    <tip.icon size={18} className="text-discord-blurple shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm font-medium text-white">{tip.title}</div>
                      <div className="text-xs text-discord-text-muted leading-relaxed mt-0.5">{tip.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Footer ── */}
          <div className="flex items-center justify-between px-8 py-5 border-t border-discord-divider">
            <div>
              {step !== 'welcome' && step !== 'done' && (
                <button
                  onClick={handleBack}
                  className="flex items-center gap-1 text-sm text-discord-text-muted hover:text-discord-text transition-colors"
                >
                  <ChevronLeft size={16} />
                  Back
                </button>
              )}
              {step === 'welcome' && (
                <button
                  onClick={handleSkip}
                  className="text-sm text-discord-text-muted hover:text-discord-text transition-colors"
                >
                  Skip setup
                </button>
              )}
            </div>

            <button
              onClick={handleNext}
              disabled={!canProceed() || saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-discord-blurple hover:bg-discord-blurple-hover disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white transition-colors"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </>
              ) : step === 'done' ? (
                'Start using Trenchcord'
              ) : step === 'room' ? (
                <>
                  Create Room
                  <ChevronRight size={16} />
                </>
              ) : (
                <>
                  Continue
                  <ChevronRight size={16} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
