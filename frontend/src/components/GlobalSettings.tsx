import { useState, useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '../stores/appStore';
import type { SolPlatform, EvmPlatform, ContractClickAction, BadgeClickAction, KeywordPattern, KeywordMatchMode, SoundSettings, SoundType, SoundConfig } from '../types';
import { Key, Search, Plus, Trash2, Eye, EyeOff, Volume2, Upload, Play, Users, Shield, Tag, Zap, Settings2, ArrowLeft, HelpCircle } from 'lucide-react';
import { requestNotificationPermission } from '../utils/desktopNotification';
import { previewSound } from '../utils/notificationSound';

type Section = 'tokens' | 'general' | 'contracts' | 'sounds' | 'keywords' | 'users' | 'guilds' | 'help';

const SECTIONS: { id: Section; label: string; icon: typeof Key }[] = [
  { id: 'tokens', label: 'Tokens', icon: Key },
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'contracts', label: 'Contracts', icon: Zap },
  { id: 'sounds', label: 'Sounds & Notifications', icon: Volume2 },
  { id: 'keywords', label: 'Keywords', icon: Tag },
  { id: 'users', label: 'Highlighted Users', icon: Users },
  { id: 'guilds', label: 'Guilds', icon: Shield },
  { id: 'help', label: 'Help & Features', icon: HelpCircle },
];

export default function GlobalSettings() {
  const config = useAppStore((s) => s.config);
  const updateConfig = useAppStore((s) => s.updateConfig);
  const guilds = useAppStore((s) => s.guilds);
  const fetchGuilds = useAppStore((s) => s.fetchGuilds);
  const fetchConfig = useAppStore((s) => s.fetchConfig);
  const maskedTokens = useAppStore((s) => s.maskedTokens);
  const fetchMaskedTokens = useAppStore((s) => s.fetchMaskedTokens);
  const addToken = useAppStore((s) => s.addToken);
  const removeToken = useAppStore((s) => s.removeToken);
  const allMessages = useAppStore((s) => s.messages);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const settingsSection = useAppStore((s) => s.settingsSection);

  const userNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const msgs of Object.values(allMessages)) {
      for (const msg of msgs) {
        if (!map.has(msg.author.id)) {
          map.set(msg.author.id, msg.author.displayName);
        }
      }
    }
    return map;
  }, [allMessages]);

  const [section, setSection] = useState<Section>((settingsSection as Section) || 'tokens');
  const [globalUsers, setGlobalUsers] = useState<string[]>([]);
  const [newUserId, setNewUserId] = useState('');
  const [contractDetection, setContractDetection] = useState(true);
  const [guildColors, setGuildColors] = useState<Record<string, string>>({});
  const [enabledGuilds, setEnabledGuilds] = useState<string[]>([]);
  const [guildSearch, setGuildSearch] = useState('');
  const [evmAddressColor, setEvmAddressColor] = useState('#fee75c');
  const [solAddressColor, setSolAddressColor] = useState('#14f195');
  const [openInDiscordApp, setOpenInDiscordApp] = useState(false);
  const [messageSounds, setMessageSounds] = useState(false);
  const defaultSoundConfig: SoundConfig = { enabled: true, volume: 80, useCustom: false };
  const [soundSettings, setSoundSettings] = useState<SoundSettings>({
    highlight: { ...defaultSoundConfig },
    contractAlert: { ...defaultSoundConfig },
    keywordAlert: { ...defaultSoundConfig },
  });
  const [uploadingSoundType, setUploadingSoundType] = useState<SoundType | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pushoverEnabled, setPushoverEnabled] = useState(false);
  const [pushoverAppToken, setPushoverAppToken] = useState('');
  const [pushoverUserKey, setPushoverUserKey] = useState('');
  const [solPlatform, setSolPlatform] = useState<SolPlatform>('axiom');
  const [evmPlatform, setEvmPlatform] = useState<EvmPlatform>('gmgn');
  const [customSolUrl, setCustomSolUrl] = useState('');
  const [customEvmUrl, setCustomEvmUrl] = useState('');
  const [contractClickAction, setContractClickAction] = useState<ContractClickAction>('copy_open');
  const [autoOpenHighlightedContracts, setAutoOpenHighlightedContracts] = useState(false);
  const [globalKeywordPatterns, setGlobalKeywordPatterns] = useState<KeywordPattern[]>([]);
  const [keywordAlertsEnabled, setKeywordAlertsEnabled] = useState(true);
  const [desktopNotifications, setDesktopNotifications] = useState(false);
  const [badgeClickAction, setBadgeClickAction] = useState<BadgeClickAction>('discord');
  const [newKeywordPattern, setNewKeywordPattern] = useState('');
  const [newKeywordMatchMode, setNewKeywordMatchMode] = useState<KeywordMatchMode>('includes');
  const [newKeywordLabel, setNewKeywordLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [newToken, setNewToken] = useState('');
  const [showNewToken, setShowNewToken] = useState(false);
  const [tokenError, setTokenError] = useState('');
  const [addingToken, setAddingToken] = useState(false);

  useEffect(() => {
    fetchGuilds();
    fetchConfig();
    fetchMaskedTokens();
  }, [fetchGuilds, fetchConfig, fetchMaskedTokens]);

  useEffect(() => {
    if (config) {
      setGlobalUsers(config.globalHighlightedUsers);
      setContractDetection(config.contractDetection);
      setGuildColors(config.guildColors ?? {});
      setEnabledGuilds(config.enabledGuilds ?? []);
      setEvmAddressColor(config.evmAddressColor ?? '#fee75c');
      setSolAddressColor(config.solAddressColor ?? '#14f195');
      setOpenInDiscordApp(config.openInDiscordApp ?? false);
      setMessageSounds(config.messageSounds ?? false);
      if (config.soundSettings) {
        setSoundSettings({
          highlight: { ...defaultSoundConfig, ...config.soundSettings.highlight },
          contractAlert: { ...defaultSoundConfig, ...config.soundSettings.contractAlert },
          keywordAlert: { ...defaultSoundConfig, ...config.soundSettings.keywordAlert },
        });
      }
      setPushoverEnabled(config.pushover?.enabled ?? false);
      setPushoverAppToken(config.pushover?.appToken ?? '');
      setPushoverUserKey(config.pushover?.userKey ?? '');
      setSolPlatform(config.contractLinkTemplates?.solPlatform ?? 'axiom');
      setEvmPlatform(config.contractLinkTemplates?.evmPlatform ?? 'gmgn');
      setCustomSolUrl(config.contractLinkTemplates?.sol ?? '');
      setCustomEvmUrl(config.contractLinkTemplates?.evm ?? '');
      setContractClickAction(config.contractClickAction ?? 'copy_open');
      setAutoOpenHighlightedContracts(config.autoOpenHighlightedContracts ?? false);
      setGlobalKeywordPatterns(config.globalKeywordPatterns ?? []);
      setKeywordAlertsEnabled(config.keywordAlertsEnabled ?? true);
      setDesktopNotifications(config.desktopNotifications ?? false);
      setBadgeClickAction(config.badgeClickAction ?? 'discord');
    }
  }, [config]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateConfig({
        globalHighlightedUsers: globalUsers,
        contractDetection,
        guildColors,
        enabledGuilds,
        evmAddressColor,
        solAddressColor,
        openInDiscordApp,
        messageSounds,
        soundSettings,
        pushover: { enabled: pushoverEnabled, appToken: pushoverAppToken, userKey: pushoverUserKey },
        contractLinkTemplates: { evm: customEvmUrl, sol: customSolUrl, solPlatform, evmPlatform },
        contractClickAction,
        autoOpenHighlightedContracts,
        globalKeywordPatterns,
        keywordAlertsEnabled,
        desktopNotifications,
        badgeClickAction,
      });
    } finally {
      setSaving(false);
    }
  };

  const addGlobalUser = () => {
    const id = newUserId.trim();
    if (id && !globalUsers.includes(id)) {
      setGlobalUsers((prev) => [...prev, id]);
      setNewUserId('');
    }
  };

  const removeGlobalUser = (userId: string) => {
    setGlobalUsers((prev) => prev.filter((u) => u !== userId));
  };

  const addKeyword = () => {
    if (!newKeywordPattern.trim()) return;
    setGlobalKeywordPatterns((prev) => [
      ...prev,
      { pattern: newKeywordPattern.trim(), matchMode: newKeywordMatchMode, label: newKeywordLabel.trim() || undefined },
    ]);
    setNewKeywordPattern('');
    setNewKeywordLabel('');
  };

  const Toggle = ({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) => (
    <label className="flex items-center gap-3 cursor-pointer">
      <div
        className={`w-10 h-5 rounded-full transition-colors relative ${value ? 'bg-discord-green' : 'bg-discord-input'}`}
        onClick={() => onChange(!value)}
      >
        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </div>
      <span className="text-sm text-discord-text">{label}</span>
    </label>
  );

  return (
    <div className="flex-1 flex h-full bg-discord-dark">
      {/* Section navigation */}
      <div className="w-60 bg-discord-sidebar/50 border-r border-discord-divider flex flex-col shrink-0">
        <div className="px-4 pt-5 pb-3 flex items-center gap-2">
          <button
            onClick={() => setActiveView('chat')}
            className="p-1 rounded hover:bg-discord-hover/50 text-discord-text-muted hover:text-white transition-colors"
            title="Back to chat"
          >
            <ArrowLeft size={16} />
          </button>
          <h2 className="text-sm font-semibold text-white uppercase tracking-wide">Settings</h2>
        </div>
        <nav className="flex-1 px-2 pb-4 space-y-0.5">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setSection(id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-sm text-left transition-colors ${
                section === id
                  ? 'bg-discord-hover text-white'
                  : 'text-discord-text-muted hover:bg-discord-hover/50 hover:text-discord-text'
              }`}
            >
              <Icon size={16} className="shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Content area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-8 py-6 space-y-6" data-form-type="other" data-lpignore="true" data-1p-ignore>

            {section === 'tokens' && (
              <>
                <div>
                  <h3 className="text-lg font-semibold text-white mb-1">Discord Tokens</h3>
                  <p className="text-sm text-discord-text-muted mb-4">
                    Manage your Discord authentication tokens. Multiple tokens allow monitoring across different accounts.
                  </p>

                  {maskedTokens.length > 0 && (
                    <div className="space-y-1.5 mb-4">
                      {maskedTokens.map((t) => (
                        <div key={t.index} className="flex items-center justify-between px-3 py-2.5 bg-discord-sidebar rounded">
                          <div className="flex items-center gap-2 min-w-0">
                            <Key size={14} className="shrink-0 text-discord-blurple" />
                            <span className="text-sm text-discord-text font-mono tracking-wider truncate">{t.masked}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-discord-blurple/20 text-discord-blurple font-semibold shrink-0">
                              TOKEN {t.index + 1}
                            </span>
                          </div>
                          <button
                            onClick={async () => { await removeToken(t.index); }}
                            className="text-discord-text-muted hover:text-discord-red shrink-0 ml-2"
                            title="Remove token"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {maskedTokens.length === 0 && (
                    <p className="text-sm text-discord-text-muted text-center py-3 mb-4 bg-discord-sidebar/50 rounded">
                      No tokens configured.
                    </p>
                  )}

                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <input
                        type={showNewToken ? 'text' : 'password'}
                        value={newToken}
                        onChange={(e) => { setNewToken(e.target.value); setTokenError(''); }}
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter' && newToken.trim()) {
                            setAddingToken(true);
                            setTokenError('');
                            const result = await addToken(newToken.trim());
                            if (result.success) { setNewToken(''); setShowNewToken(false); }
                            else { setTokenError(result.error ?? 'Failed to add token'); }
                            setAddingToken(false);
                          }
                        }}
                        placeholder="Paste Discord token..."
                        className="w-full bg-discord-sidebar border-none rounded px-3 py-2 pr-9 text-sm text-discord-text outline-none focus:ring-2 focus:ring-discord-blurple font-mono"
                        disabled={addingToken}
                        autoComplete="off"
                        data-1p-ignore
                        data-lpignore="true"
                        data-form-type="other"
                      />
                      <button
                        onClick={() => setShowNewToken(!showNewToken)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-discord-text-muted hover:text-discord-text"
                        type="button"
                        tabIndex={-1}
                      >
                        {showNewToken ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <button
                      onClick={async () => {
                        if (!newToken.trim()) return;
                        setAddingToken(true);
                        setTokenError('');
                        const result = await addToken(newToken.trim());
                        if (result.success) { setNewToken(''); setShowNewToken(false); }
                        else { setTokenError(result.error ?? 'Failed to add token'); }
                        setAddingToken(false);
                      }}
                      disabled={addingToken || !newToken.trim()}
                      className="px-3 py-2 bg-discord-blurple hover:bg-discord-blurple-hover disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm text-white transition-colors"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  {tokenError && (
                    <p className="text-xs text-discord-red mt-1.5">{tokenError}</p>
                  )}
                </div>
              </>
            )}

            {section === 'general' && (
              <>
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">General</h3>

                  <div className="space-y-5">
                    <div className="p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-sm font-semibold text-white mb-2">Contract Detection</h4>
                      <Toggle
                        value={contractDetection}
                        onChange={setContractDetection}
                        label="Detect SOL/EVM contract addresses in messages"
                      />
                    </div>

                    <div className="p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-sm font-semibold text-white mb-2">Open in Discord App</h4>
                      <Toggle
                        value={openInDiscordApp}
                        onChange={setOpenInDiscordApp}
                        label="Clicking a channel badge opens the message directly in the Discord app"
                      />
                    </div>

                    <div className="p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-sm font-semibold text-white mb-2">Desktop Notifications</h4>
                      <Toggle
                        value={desktopNotifications}
                        onChange={(v) => {
                          setDesktopNotifications(v);
                          if (v) requestNotificationPermission();
                        }}
                        label="Show browser notifications for highlighted users and keyword matches (when tab is not focused)"
                      />
                    </div>

                    <div className="p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-sm font-semibold text-white mb-2">Badge Click Action</h4>
                      <p className="text-sm text-discord-text-muted mb-3">
                        What happens when you click a keyword match or contract badge on a message.
                      </p>
                      <div className="flex gap-1.5">
                        {([
                          ['discord', 'Open in Discord'],
                          ['platform', 'Open in Platform'],
                          ['both', 'Discord + Platform'],
                        ] as [BadgeClickAction, string][]).map(([action, label]) => (
                          <button
                            key={action}
                            onClick={() => setBadgeClickAction(action)}
                            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                              badgeClickAction === action
                                ? 'bg-discord-blurple text-white'
                                : 'bg-discord-dark text-discord-text-muted hover:text-discord-text'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px] text-discord-text-muted mt-2">
                        {badgeClickAction === 'discord' && 'Always opens the original message in Discord.'}
                        {badgeClickAction === 'platform' && 'Opens the contract in your configured trading platform if one is detected, otherwise falls back to Discord.'}
                        {badgeClickAction === 'both' && 'Opens the message in Discord and also opens the contract in your trading platform (if detected).'}
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {section === 'contracts' && (
              <>
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">Contracts</h3>

                  <div className="space-y-5">
                    <div className="p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-sm font-semibold text-white mb-2">Contract Click Action</h4>
                      <p className="text-sm text-discord-text-muted mb-3">
                        What happens when you click a contract address in chat.
                      </p>
                      <div className="flex gap-1.5">
                        {([
                          ['copy', 'Copy Address'],
                          ['copy_open', 'Copy + Open'],
                          ['open', 'Open Only'],
                        ] as [ContractClickAction, string][]).map(([action, label]) => (
                          <button
                            key={action}
                            onClick={() => setContractClickAction(action)}
                            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                              contractClickAction === action
                                ? 'bg-discord-blurple text-white'
                                : 'bg-discord-dark text-discord-text-muted hover:text-discord-text'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-sm font-semibold text-white mb-2">Trading Platform</h4>
                      <p className="text-sm text-discord-text-muted mb-3">
                        Choose which trading platform opens when you click a contract address.
                      </p>
                      <div className="space-y-3">
                        <div className="px-3 py-2.5 bg-discord-dark rounded">
                          <label className="text-[11px] text-discord-text-muted mb-1.5 block">SOL Platform</label>
                          <div className="flex gap-1.5">
                            {(['axiom', 'padre', 'bloom', 'gmgn', 'custom'] as SolPlatform[]).map((p) => (
                              <button
                                key={p}
                                onClick={() => setSolPlatform(p)}
                                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                                  solPlatform === p
                                    ? 'bg-discord-blurple text-white'
                                    : 'bg-discord-sidebar text-discord-text-muted hover:text-discord-text'
                                }`}
                              >
                                {p === 'axiom' ? 'Axiom' : p === 'padre' ? 'Padre' : p === 'bloom' ? 'Bloom' : p === 'gmgn' ? 'GMGN' : 'Custom'}
                              </button>
                            ))}
                          </div>
                          {solPlatform === 'custom' && (
                            <input
                              type="text"
                              value={customSolUrl}
                              onChange={(e) => setCustomSolUrl(e.target.value)}
                              placeholder="https://example.com/token/{address}"
                              className="w-full mt-2 bg-discord-sidebar border-none rounded px-2 py-1.5 text-sm text-discord-text outline-none focus:ring-1 focus:ring-discord-blurple font-mono"
                            />
                          )}
                        </div>
                        <div className="px-3 py-2.5 bg-discord-dark rounded">
                          <label className="text-[11px] text-discord-text-muted mb-1.5 block">EVM Platform</label>
                          <div className="flex gap-1.5">
                            {(['gmgn', 'bloom', 'custom'] as EvmPlatform[]).map((p) => (
                              <button
                                key={p}
                                onClick={() => setEvmPlatform(p)}
                                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                                  evmPlatform === p
                                    ? 'bg-discord-blurple text-white'
                                    : 'bg-discord-sidebar text-discord-text-muted hover:text-discord-text'
                                }`}
                              >
                                {p === 'gmgn' ? 'GMGN' : p === 'bloom' ? 'Bloom' : 'Custom'}
                              </button>
                            ))}
                          </div>
                          {evmPlatform === 'custom' && (
                            <input
                              type="text"
                              value={customEvmUrl}
                              onChange={(e) => setCustomEvmUrl(e.target.value)}
                              placeholder="https://example.com/token/{address}"
                              className="w-full mt-2 bg-discord-sidebar border-none rounded px-2 py-1.5 text-sm text-discord-text outline-none focus:ring-1 focus:ring-discord-blurple font-mono"
                            />
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-sm font-semibold text-white mb-2">Auto-Open Highlighted Contracts</h4>
                      <Toggle
                        value={autoOpenHighlightedContracts}
                        onChange={setAutoOpenHighlightedContracts}
                        label="Automatically open a new tab when a highlighted user posts a contract address"
                      />
                    </div>

                    <div className="p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-sm font-semibold text-white mb-2">Address Colors</h4>
                      <p className="text-sm text-discord-text-muted mb-3">
                        Customize highlight colors for detected contract addresses by chain type.
                      </p>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 px-3 py-2 bg-discord-dark rounded">
                          <input
                            type="color"
                            value={evmAddressColor}
                            onChange={(e) => setEvmAddressColor(e.target.value)}
                            className="w-6 h-6 rounded cursor-pointer border border-discord-divider bg-transparent shrink-0"
                          />
                          <span className="text-sm text-discord-text flex-1">EVM (0x...)</span>
                          <input
                            type="text"
                            value={evmAddressColor}
                            onChange={(e) => setEvmAddressColor(e.target.value)}
                            className="w-24 bg-discord-sidebar border-none rounded px-2 py-1 text-xs text-discord-text outline-none focus:ring-1 focus:ring-discord-blurple font-mono"
                          />
                          {evmAddressColor !== '#fee75c' && (
                            <button onClick={() => setEvmAddressColor('#fee75c')} className="text-[11px] text-discord-text-muted hover:text-white">Reset</button>
                          )}
                        </div>
                        <div className="flex items-center gap-3 px-3 py-2 bg-discord-dark rounded">
                          <input
                            type="color"
                            value={solAddressColor}
                            onChange={(e) => setSolAddressColor(e.target.value)}
                            className="w-6 h-6 rounded cursor-pointer border border-discord-divider bg-transparent shrink-0"
                          />
                          <span className="text-sm text-discord-text flex-1">SOL</span>
                          <input
                            type="text"
                            value={solAddressColor}
                            onChange={(e) => setSolAddressColor(e.target.value)}
                            className="w-24 bg-discord-sidebar border-none rounded px-2 py-1 text-xs text-discord-text outline-none focus:ring-1 focus:ring-discord-blurple font-mono"
                          />
                          {solAddressColor !== '#14f195' && (
                            <button onClick={() => setSolAddressColor('#14f195')} className="text-[11px] text-discord-text-muted hover:text-white">Reset</button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {section === 'sounds' && (
              <>
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">Sounds & Notifications</h3>

                  <div className="space-y-5">
                    <div className="p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-sm font-semibold text-white mb-3">Sound Settings</h4>
                      <Toggle
                        value={messageSounds}
                        onChange={setMessageSounds}
                        label="Enable notification sounds (master toggle)"
                      />

                      {messageSounds && (
                        <div className="space-y-3 mt-4">
                          <input
                            type="file"
                            ref={fileInputRef}
                            accept=".mp3,.wav,.ogg,.webm,.m4a"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file || !uploadingSoundType) return;
                              const formData = new FormData();
                              formData.append('file', file);
                              try {
                                const res = await fetch(`/api/sounds/${uploadingSoundType}`, { method: 'POST', body: formData });
                                const data = await res.json();
                                if (res.ok && data.url) {
                                  setSoundSettings((prev) => ({
                                    ...prev,
                                    [uploadingSoundType]: { ...prev[uploadingSoundType], useCustom: true, customSoundUrl: data.url },
                                  }));
                                }
                              } catch { /* ignore */ }
                              setUploadingSoundType(null);
                              e.target.value = '';
                            }}
                          />
                          {([
                            ['highlight', 'Highlighted User'],
                            ['contractAlert', 'Contract Alert'],
                            ['keywordAlert', 'Keyword Match'],
                          ] as [SoundType, string][]).map(([type, label]) => {
                            const sc = soundSettings[type];
                            return (
                              <div key={type} className="px-3 py-3 bg-discord-dark rounded space-y-2.5">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Volume2 size={14} className="text-discord-text-muted" />
                                    <span className="text-sm text-discord-text font-medium">{label}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => previewSound(type, sc)}
                                      className="p-1 rounded hover:bg-discord-hover/50 text-discord-text-muted hover:text-discord-text transition-colors"
                                      title="Preview sound"
                                    >
                                      <Play size={14} />
                                    </button>
                                    <div
                                      className={`w-9 h-[18px] rounded-full transition-colors relative cursor-pointer ${
                                        sc.enabled ? 'bg-discord-green' : 'bg-discord-input'
                                      }`}
                                      onClick={() => setSoundSettings((prev) => ({
                                        ...prev,
                                        [type]: { ...prev[type], enabled: !prev[type].enabled },
                                      }))}
                                    >
                                      <div
                                        className={`absolute top-[2px] w-[14px] h-[14px] bg-white rounded-full transition-transform ${
                                          sc.enabled ? 'translate-x-[18px]' : 'translate-x-[2px]'
                                        }`}
                                      />
                                    </div>
                                  </div>
                                </div>

                                {sc.enabled && (
                                  <>
                                    <div className="flex items-center gap-3">
                                      <span className="text-[11px] text-discord-text-muted w-12 shrink-0">Volume</span>
                                      <input
                                        type="range"
                                        min={0}
                                        max={100}
                                        value={sc.volume}
                                        onChange={(e) => setSoundSettings((prev) => ({
                                          ...prev,
                                          [type]: { ...prev[type], volume: Number(e.target.value) },
                                        }))}
                                        className="flex-1 h-1.5 accent-discord-blurple cursor-pointer"
                                      />
                                      <span className="text-[11px] text-discord-text-muted w-8 text-right">{sc.volume}%</span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <span className="text-[11px] text-discord-text-muted">Sound:</span>
                                      <button
                                        onClick={() => setSoundSettings((prev) => ({
                                          ...prev,
                                          [type]: { ...prev[type], useCustom: false },
                                        }))}
                                        className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                                          !sc.useCustom
                                            ? 'bg-discord-blurple text-white'
                                            : 'bg-discord-sidebar text-discord-text-muted hover:text-discord-text'
                                        }`}
                                      >
                                        Built-in
                                      </button>
                                      <button
                                        onClick={() => {
                                          if (sc.customSoundUrl) {
                                            setSoundSettings((prev) => ({ ...prev, [type]: { ...prev[type], useCustom: true } }));
                                          } else {
                                            setUploadingSoundType(type);
                                            fileInputRef.current?.click();
                                          }
                                        }}
                                        className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                                          sc.useCustom
                                            ? 'bg-discord-blurple text-white'
                                            : 'bg-discord-sidebar text-discord-text-muted hover:text-discord-text'
                                        }`}
                                      >
                                        Custom
                                      </button>
                                      {sc.useCustom && sc.customSoundUrl && (
                                        <button
                                          onClick={() => { setUploadingSoundType(type); fileInputRef.current?.click(); }}
                                          className="p-1 rounded hover:bg-discord-hover/50 text-discord-text-muted hover:text-discord-text transition-colors"
                                          title="Upload new sound"
                                        >
                                          <Upload size={12} />
                                        </button>
                                      )}
                                      {sc.useCustom && sc.customSoundUrl && (
                                        <button
                                          onClick={async () => {
                                            await fetch(`/api/sounds/${type}`, { method: 'DELETE' });
                                            setSoundSettings((prev) => ({
                                              ...prev,
                                              [type]: { ...prev[type], useCustom: false, customSoundUrl: undefined },
                                            }));
                                          }}
                                          className="text-discord-text-muted hover:text-discord-red transition-colors"
                                          title="Remove custom sound"
                                        >
                                          <Trash2 size={12} />
                                        </button>
                                      )}
                                    </div>
                                    {sc.useCustom && sc.customSoundUrl && (
                                      <div className="text-[10px] text-discord-text-muted truncate">
                                        {sc.customSoundUrl.split('/').pop()}
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-sm font-semibold text-white mb-2">Pushover Notifications</h4>
                      <p className="text-sm text-discord-text-muted mb-3">
                        Send push notifications via{' '}
                        <a href="https://pushover.net" target="_blank" rel="noopener noreferrer" className="text-discord-text-link hover:underline">
                          Pushover
                        </a>{' '}
                        when a highlighted user posts a contract address.
                      </p>
                      <Toggle
                        value={pushoverEnabled}
                        onChange={setPushoverEnabled}
                        label="Enable Pushover notifications"
                      />
                      {pushoverEnabled && (
                        <div className="space-y-3 mt-4">
                          <div className="px-3 py-2 bg-discord-dark rounded">
                            <label className="text-[11px] text-discord-text-muted mb-1 block">Application API Token</label>
                            <input
                              type="password"
                              value={pushoverAppToken}
                              onChange={(e) => setPushoverAppToken(e.target.value)}
                              placeholder="azGDORePK8gMaC0QOYAMyEEuzJnyUi"
                              className="w-full bg-discord-sidebar border-none rounded px-2 py-1.5 text-sm text-discord-text outline-none focus:ring-1 focus:ring-discord-blurple font-mono"
                              autoComplete="off"
                              data-1p-ignore
                              data-lpignore="true"
                              data-form-type="other"
                            />
                          </div>
                          <div className="px-3 py-2 bg-discord-dark rounded">
                            <label className="text-[11px] text-discord-text-muted mb-1 block">User Key</label>
                            <input
                              type="password"
                              value={pushoverUserKey}
                              onChange={(e) => setPushoverUserKey(e.target.value)}
                              placeholder="uQiRzpo4DXghDmr9QzzfQu27cmVRsG"
                              className="w-full bg-discord-sidebar border-none rounded px-2 py-1.5 text-sm text-discord-text outline-none focus:ring-1 focus:ring-discord-blurple font-mono"
                              autoComplete="off"
                              data-1p-ignore
                              data-lpignore="true"
                              data-form-type="other"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            {section === 'keywords' && (
              <>
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">Keywords</h3>

                  <div className="space-y-5">
                    <div className="p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-sm font-semibold text-white mb-2">Keyword Alerts</h4>
                      <Toggle
                        value={keywordAlertsEnabled}
                        onChange={setKeywordAlertsEnabled}
                        label="Enable keyword/regex pattern matching alerts"
                      />
                    </div>

                    <div className="p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-sm font-semibold text-white mb-2">Global Keyword Patterns</h4>
                      <p className="text-sm text-discord-text-muted mb-2">
                        Add patterns to match against messages globally. Use <strong className="text-discord-text">Contains</strong> for substring matches, <strong className="text-discord-text">Exact</strong> for whole-word matches, or <strong className="text-discord-text">Regex</strong> for advanced patterns.
                      </p>
                      <div className="text-xs text-discord-text-muted bg-discord-dark rounded px-3 py-2 mb-4 space-y-1">
                        <p className="font-semibold text-discord-text-muted/80">Regex examples:</p>
                        <p><code className="text-orange-400/80 font-mono">stealth\s*(launch|drop)</code> — stealth launch, stealthdrop</p>
                        <p><code className="text-orange-400/80 font-mono">\b(airdrop|air\s*drop)\b</code> — airdrop, air drop (whole word)</p>
                        <p><code className="text-orange-400/80 font-mono">deploy(ed|ing)?</code> — deploy, deployed, deploying</p>
                        <p><code className="text-orange-400/80 font-mono">ca\s*[:=]\s*0x[a-f0-9]+</code> — ca: 0xABC..., CA=0x...</p>
                        <p className="pt-1">Build & test patterns at <a href="https://regex101.com" target="_blank" rel="noopener noreferrer" className="text-discord-blurple hover:underline">regex101.com</a></p>
                      </div>

                      <div className="space-y-3 mb-4">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newKeywordPattern}
                            onChange={(e) => setNewKeywordPattern(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') addKeyword(); }}
                            placeholder={
                              newKeywordMatchMode === 'regex' ? 'Regex pattern (e.g. launch|stealth)'
                              : newKeywordMatchMode === 'exact' ? 'Exact word (e.g. launch)'
                              : 'Keyword (e.g. stealth launch)'
                            }
                            className="flex-1 bg-discord-dark border-none rounded px-3 py-2 text-sm text-discord-text outline-none focus:ring-2 focus:ring-discord-blurple font-mono"
                          />
                          <button
                            onClick={addKeyword}
                            className="px-3 py-2 bg-discord-blurple hover:bg-discord-blurple-hover rounded text-sm text-white transition-colors"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex rounded overflow-hidden border border-discord-divider">
                            {(['includes', 'exact', 'regex'] as KeywordMatchMode[]).map((mode) => (
                              <button
                                key={mode}
                                onClick={() => setNewKeywordMatchMode(mode)}
                                className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                  newKeywordMatchMode === mode
                                    ? 'bg-discord-blurple text-white'
                                    : 'bg-discord-dark text-discord-text-muted hover:text-discord-text'
                                }`}
                              >
                                {mode === 'includes' ? 'Contains' : mode === 'exact' ? 'Exact' : 'Regex'}
                              </button>
                            ))}
                          </div>
                          <input
                            type="text"
                            value={newKeywordLabel}
                            onChange={(e) => setNewKeywordLabel(e.target.value)}
                            placeholder="Label (optional)"
                            className="flex-1 bg-discord-dark border-none rounded px-3 py-1.5 text-xs text-discord-text outline-none focus:ring-1 focus:ring-discord-blurple"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        {globalKeywordPatterns.length === 0 && (
                          <p className="text-sm text-discord-text-muted text-center py-4">
                            No keyword patterns configured.
                          </p>
                        )}
                        {globalKeywordPatterns.map((kw, idx) => (
                          <div key={idx} className="flex items-center justify-between px-3 py-2 bg-discord-dark rounded">
                            <div className="flex items-center gap-2 min-w-0">
                              {(kw.matchMode === 'regex' || (!kw.matchMode && kw.isRegex)) && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-400/20 text-orange-400 font-semibold shrink-0">REGEX</span>
                              )}
                              {kw.matchMode === 'exact' && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-discord-blurple/20 text-discord-blurple font-semibold shrink-0">EXACT</span>
                              )}
                              <span className="text-sm text-discord-text font-mono truncate">{kw.pattern}</span>
                              {kw.label && (
                                <span className="text-[11px] text-discord-text-muted">({kw.label})</span>
                              )}
                            </div>
                            <button
                              onClick={() => setGlobalKeywordPatterns((prev) => prev.filter((_, i) => i !== idx))}
                              className="text-discord-text-muted hover:text-discord-red shrink-0"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {section === 'users' && (
              <>
                <div>
                  <h3 className="text-lg font-semibold text-white mb-1">Global Highlighted Users</h3>
                  <p className="text-sm text-discord-text-muted mb-4">
                    These users will be highlighted in all rooms.
                  </p>
                  <div className="flex gap-2 mb-4">
                    <input
                      type="text"
                      value={newUserId}
                      onChange={(e) => setNewUserId(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addGlobalUser()}
                      placeholder="Discord User ID"
                      className="flex-1 bg-discord-sidebar border-none rounded px-3 py-2 text-sm text-discord-text outline-none focus:ring-2 focus:ring-discord-blurple"
                      autoComplete="off"
                      data-1p-ignore
                      data-lpignore="true"
                      data-form-type="other"
                    />
                    <button
                      onClick={addGlobalUser}
                      className="px-3 py-2 bg-discord-blurple hover:bg-discord-blurple-hover rounded text-sm text-white transition-colors"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <div className="space-y-1">
                    {globalUsers.length === 0 && (
                      <p className="text-sm text-discord-text-muted text-center py-4">
                        No global highlighted users.
                      </p>
                    )}
                    {globalUsers.map((uid) => (
                      <div key={uid} className="flex items-center justify-between px-3 py-2 bg-discord-sidebar rounded">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm text-discord-text font-mono">{uid}</span>
                          {userNameMap.has(uid) && (
                            <span className="text-[11px] text-discord-text-muted">{userNameMap.get(uid)}</span>
                          )}
                        </div>
                        <button
                          onClick={() => removeGlobalUser(uid)}
                          className="text-discord-text-muted hover:text-discord-red shrink-0"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {section === 'help' && (
              <>
                <div>
                  <h3 className="text-lg font-semibold text-white mb-1">Help & Features</h3>
                  <p className="text-sm text-discord-text-muted mb-6">
                    Everything you need to know about using Trenchcord.
                  </p>

                  <div className="space-y-4">
                    {/* Getting Started */}
                    <details className="group bg-discord-sidebar rounded-lg" open>
                      <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none">
                        <svg className="w-4 h-4 text-discord-text-muted transition-transform group-open:rotate-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <span className="text-sm font-semibold text-white">Getting Started</span>
                      </summary>
                      <div className="px-4 pb-4 space-y-2 text-sm text-discord-text">
                        <div className="flex gap-2 items-start">
                          <span className="text-discord-blurple font-bold mt-0.5">1.</span>
                          <span>Go to <strong className="text-white">Settings &gt; Guilds</strong> and enable the Discord servers you want to monitor.</span>
                        </div>
                        <div className="flex gap-2 items-start">
                          <span className="text-discord-blurple font-bold mt-0.5">2.</span>
                          <span>Click the <strong className="text-white">+</strong> button next to "Rooms" in the sidebar to create a room.</span>
                        </div>
                        <div className="flex gap-2 items-start">
                          <span className="text-discord-blurple font-bold mt-0.5">3.</span>
                          <span>Add channels from your enabled guilds into the room. A single room can aggregate channels from multiple servers.</span>
                        </div>
                        <div className="flex gap-2 items-start">
                          <span className="text-discord-blurple font-bold mt-0.5">4.</span>
                          <span>Messages from all added channels will stream into the room in real time.</span>
                        </div>
                      </div>
                    </details>

                    {/* Message Interactions */}
                    <details className="group bg-discord-sidebar rounded-lg">
                      <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none">
                        <svg className="w-4 h-4 text-discord-text-muted transition-transform group-open:rotate-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <span className="text-sm font-semibold text-white">Message Interactions</span>
                      </summary>
                      <div className="px-4 pb-4 space-y-2.5 text-sm text-discord-text">
                        <div className="px-3 py-2 bg-discord-dark rounded">
                          <p className="font-medium text-white text-xs mb-1">Channel Badge</p>
                          <p className="text-discord-text-muted text-xs">Click the <strong className="text-discord-text">server / #channel</strong> badge on any message to jump to the original message in Discord. Configure whether it opens in the Discord app or browser in Settings &gt; General.</p>
                        </div>
                        <div className="px-3 py-2 bg-discord-dark rounded">
                          <p className="font-medium text-white text-xs mb-1">Badge Click Action</p>
                          <p className="text-discord-text-muted text-xs">In Settings &gt; General, choose what badge clicks do: open in <strong className="text-discord-text">Discord</strong>, open in your <strong className="text-discord-text">trading platform</strong> (if a contract is detected), or <strong className="text-discord-text">both</strong>.</p>
                        </div>
                        <div className="px-3 py-2 bg-discord-dark rounded">
                          <p className="font-medium text-white text-xs mb-1">Image Lightbox</p>
                          <p className="text-discord-text-muted text-xs">Click any image in a message to view it fullscreen. Press <strong className="text-discord-text">ESC</strong> to close.</p>
                        </div>
                        <div className="px-3 py-2 bg-discord-dark rounded">
                          <p className="font-medium text-white text-xs mb-1">Compact Messages</p>
                          <p className="text-discord-text-muted text-xs">Messages from the same author within 5 minutes are grouped together. Hover over a compact message to see its timestamp.</p>
                        </div>
                        <div className="px-3 py-2 bg-discord-dark rounded">
                          <p className="font-medium text-white text-xs mb-1">Right-Click Users</p>
                          <p className="text-discord-text-muted text-xs">Right-click a username to access the context menu where you can hide that user from the channel.</p>
                        </div>
                      </div>
                    </details>

                    {/* Focus Mode */}
                    <details className="group bg-discord-sidebar rounded-lg">
                      <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none">
                        <svg className="w-4 h-4 text-discord-text-muted transition-transform group-open:rotate-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <span className="text-sm font-semibold text-white">Focus Mode</span>
                      </summary>
                      <div className="px-4 pb-4 space-y-2 text-sm text-discord-text">
                        <p className="text-discord-text-muted">When a room has multiple channels, you can temporarily filter to a single channel:</p>
                        <div className="px-3 py-2 bg-discord-dark rounded space-y-1.5">
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Enter:</span> <span className="text-discord-text-muted">Click the</span> <Eye size={13} className="inline text-discord-text-muted mx-0.5" /> <span className="text-discord-text-muted">eye icon on any message to focus on that message's channel.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Active:</span> <span className="text-discord-text-muted">A "Focus Mode" badge appears in the channel header showing which channel you're filtering to. Only messages from that channel are displayed.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Exit:</span> <span className="text-discord-text-muted">Click the</span> <span className="text-white font-bold mx-0.5">&times;</span> <span className="text-discord-text-muted">on the badge to return to the full room view.</span></p>
                        </div>
                      </div>
                    </details>

                    {/* Contract Detection */}
                    <details className="group bg-discord-sidebar rounded-lg">
                      <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none">
                        <svg className="w-4 h-4 text-discord-text-muted transition-transform group-open:rotate-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <span className="text-sm font-semibold text-white">Contract Detection</span>
                      </summary>
                      <div className="px-4 pb-4 space-y-2 text-sm text-discord-text">
                        <p className="text-discord-text-muted">Trenchcord automatically detects Solana and EVM contract addresses in messages.</p>
                        <div className="px-3 py-2 bg-discord-dark rounded space-y-1.5">
                          <p className="text-xs"><span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#14f195]/20 text-[#14f195] mr-1">SOL</span> <span className="text-discord-text-muted">Solana addresses appear as green pills.</span></p>
                          <p className="text-xs"><span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#fee75c]/20 text-[#fee75c] mr-1">EVM</span> <span className="text-discord-text-muted">EVM addresses (0x...) appear as yellow pills.</span></p>
                          <p className="text-xs text-discord-text-muted">Click a contract to <strong className="text-discord-text">copy</strong> and/or <strong className="text-discord-text">open</strong> it in your configured trading platform (configurable in Settings &gt; Contracts).</p>
                        </div>
                        <div className="px-3 py-2 bg-discord-dark rounded">
                          <p className="font-medium text-white text-xs mb-1">Contracts Dashboard</p>
                          <p className="text-discord-text-muted text-xs">Click <strong className="text-discord-text">Contracts</strong> in the sidebar to see a live feed of all detected contracts, searchable and filterable by chain.</p>
                        </div>
                        <div className="px-3 py-2 bg-discord-dark rounded">
                          <p className="font-medium text-white text-xs mb-1">Auto-Open</p>
                          <p className="text-discord-text-muted text-xs">Enable "Auto-Open Highlighted Contracts" in Settings &gt; Contracts to automatically open a new tab when a highlighted user posts a contract.</p>
                        </div>
                      </div>
                    </details>

                    {/* User Highlighting */}
                    <details className="group bg-discord-sidebar rounded-lg">
                      <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none">
                        <svg className="w-4 h-4 text-discord-text-muted transition-transform group-open:rotate-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <span className="text-sm font-semibold text-white">User Highlighting</span>
                      </summary>
                      <div className="px-4 pb-4 space-y-2 text-sm text-discord-text">
                        <p className="text-discord-text-muted">Track specific Discord users to never miss their messages.</p>
                        <div className="px-3 py-2 bg-discord-dark rounded space-y-1.5">
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Global:</span> <span className="text-discord-text-muted">Add user IDs in Settings &gt; Highlighted Users. These users are highlighted in all rooms.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Per-Room:</span> <span className="text-discord-text-muted">Edit a room (hover &gt; gear icon) &gt; Users tab to add room-specific highlights.</span></p>
                          <p className="text-xs text-discord-text-muted">Highlighted messages appear with a <span className="text-blue-400 font-medium">blue border</span>. Toast alerts pop up in the corner when they send a message.</p>
                        </div>
                      </div>
                    </details>

                    {/* Keyword Alerts */}
                    <details className="group bg-discord-sidebar rounded-lg">
                      <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none">
                        <svg className="w-4 h-4 text-discord-text-muted transition-transform group-open:rotate-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <span className="text-sm font-semibold text-white">Keyword Alerts</span>
                      </summary>
                      <div className="px-4 pb-4 space-y-2 text-sm text-discord-text">
                        <p className="text-discord-text-muted">Get alerted when messages match your keyword patterns.</p>
                        <div className="px-3 py-2 bg-discord-dark rounded space-y-1.5">
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Global:</span> <span className="text-discord-text-muted">Settings &gt; Keywords — matched in all rooms.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Per-Room:</span> <span className="text-discord-text-muted">Room config &gt; Keywords tab — only matched in that room.</span></p>
                          <p className="text-xs text-discord-text-muted">Three match modes: <strong className="text-discord-text">Contains</strong> (substring), <strong className="text-discord-text">Exact</strong> (whole word), and <strong className="text-discord-text">Regex</strong> (advanced patterns).</p>
                          <p className="text-xs text-discord-text-muted">Matched messages appear with an <span className="text-orange-400 font-medium">orange border</span>.</p>
                        </div>
                      </div>
                    </details>

                    {/* Room Configuration */}
                    <details className="group bg-discord-sidebar rounded-lg">
                      <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none">
                        <svg className="w-4 h-4 text-discord-text-muted transition-transform group-open:rotate-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <span className="text-sm font-semibold text-white">Room Configuration</span>
                      </summary>
                      <div className="px-4 pb-4 space-y-2 text-sm text-discord-text">
                        <div className="px-3 py-2 bg-discord-dark rounded space-y-1.5">
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Edit/Delete:</span> <span className="text-discord-text-muted">Hover over a room in the sidebar to reveal the gear (edit) and trash (delete) icons.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Room Color:</span> <span className="text-discord-text-muted">Set a custom background color for the room in the config modal.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Disable Embeds:</span> <span className="text-discord-text-muted">Toggle embeds off for specific channels in the Channels tab of room config.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">User Filter:</span> <span className="text-discord-text-muted">In the Filter tab, add user IDs to only show messages from those users in the room.</span></p>
                        </div>
                      </div>
                    </details>

                    {/* User Management */}
                    <details className="group bg-discord-sidebar rounded-lg">
                      <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none">
                        <svg className="w-4 h-4 text-discord-text-muted transition-transform group-open:rotate-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <span className="text-sm font-semibold text-white">Hiding Users</span>
                      </summary>
                      <div className="px-4 pb-4 space-y-2 text-sm text-discord-text">
                        <div className="px-3 py-2 bg-discord-dark rounded space-y-1.5">
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Hide:</span> <span className="text-discord-text-muted">Right-click any username &gt; "Hide user" to hide them from that specific channel.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Manage:</span> <span className="text-discord-text-muted">Click the hidden users icon in the channel header to view and unhide users.</span></p>
                        </div>
                      </div>
                    </details>

                    {/* Sounds & Notifications */}
                    <details className="group bg-discord-sidebar rounded-lg">
                      <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none">
                        <svg className="w-4 h-4 text-discord-text-muted transition-transform group-open:rotate-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <span className="text-sm font-semibold text-white">Sounds & Notifications</span>
                      </summary>
                      <div className="px-4 pb-4 space-y-2 text-sm text-discord-text">
                        <div className="px-3 py-2 bg-discord-dark rounded space-y-1.5">
                          <p className="text-xs text-discord-text-muted">Three independent sound channels with individual volume controls:</p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Highlighted User:</span> <span className="text-discord-text-muted">Plays when a highlighted user sends a message.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Contract Alert:</span> <span className="text-discord-text-muted">Plays when a contract address is detected.</span></p>
                          <p className="text-xs"><span className="text-discord-blurple font-semibold">Keyword Match:</span> <span className="text-discord-text-muted">Plays when a keyword pattern matches.</span></p>
                          <p className="text-xs text-discord-text-muted">Upload custom sounds (MP3, WAV, OGG) or use built-in tones. Configure in Settings &gt; Sounds.</p>
                        </div>
                        <div className="px-3 py-2 bg-discord-dark rounded space-y-1.5">
                          <p className="font-medium text-white text-xs mb-1">Desktop Notifications</p>
                          <p className="text-xs text-discord-text-muted">Enable in Settings &gt; General. Browser notifications appear when the tab is not focused and a highlighted user or keyword match is detected.</p>
                        </div>
                        <div className="px-3 py-2 bg-discord-dark rounded space-y-1.5">
                          <p className="font-medium text-white text-xs mb-1">Pushover</p>
                          <p className="text-xs text-discord-text-muted">Push notifications to your phone via Pushover when highlighted users post contracts. Configure in Settings &gt; Sounds.</p>
                        </div>
                      </div>
                    </details>

                    {/* Guild Colors */}
                    <details className="group bg-discord-sidebar rounded-lg">
                      <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none">
                        <svg className="w-4 h-4 text-discord-text-muted transition-transform group-open:rotate-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <span className="text-sm font-semibold text-white">Guild Colors</span>
                      </summary>
                      <div className="px-4 pb-4 text-sm text-discord-text">
                        <div className="px-3 py-2 bg-discord-dark rounded">
                          <p className="text-xs text-discord-text-muted">In Settings &gt; Guilds, assign a background color to each server. In rooms with multiple guilds, messages are color-coded so you can instantly tell which server a message came from.</p>
                        </div>
                      </div>
                    </details>

                    {/* DMs */}
                    <details className="group bg-discord-sidebar rounded-lg">
                      <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none">
                        <svg className="w-4 h-4 text-discord-text-muted transition-transform group-open:rotate-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <span className="text-sm font-semibold text-white">Direct Messages</span>
                      </summary>
                      <div className="px-4 pb-4 text-sm text-discord-text">
                        <div className="px-3 py-2 bg-discord-dark rounded">
                          <p className="text-xs text-discord-text-muted">DMs automatically appear in the sidebar under "Direct Messages" when you receive new messages. Click one to view the conversation.</p>
                        </div>
                      </div>
                    </details>

                    {/* Multiple Tokens */}
                    <details className="group bg-discord-sidebar rounded-lg">
                      <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none">
                        <svg className="w-4 h-4 text-discord-text-muted transition-transform group-open:rotate-90 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        <span className="text-sm font-semibold text-white">Multiple Accounts</span>
                      </summary>
                      <div className="px-4 pb-4 text-sm text-discord-text">
                        <div className="px-3 py-2 bg-discord-dark rounded">
                          <p className="text-xs text-discord-text-muted">Add multiple Discord tokens in Settings &gt; Tokens to monitor channels across different accounts simultaneously. All guilds and channels from all tokens are available when creating rooms.</p>
                        </div>
                      </div>
                    </details>
                  </div>
                </div>
              </>
            )}

            {section === 'guilds' && (
              <>
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">Guilds</h3>

                  <div className="space-y-5">
                    <div className="p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-sm font-semibold text-white mb-2">Enabled Guilds</h4>
                      <p className="text-sm text-discord-text-muted mb-3">
                        Only enabled guilds will appear in the channel picker when creating rooms. All guilds are off by default.
                      </p>
                      <div className="relative mb-3">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-discord-text-muted" />
                        <input
                          type="text"
                          value={guildSearch}
                          onChange={(e) => setGuildSearch(e.target.value)}
                          placeholder="Search guilds..."
                          className="w-full bg-discord-dark border-none rounded px-3 py-2 pl-9 text-sm text-discord-text outline-none focus:ring-2 focus:ring-discord-blurple"
                        />
                      </div>
                      <div className="text-[11px] text-discord-text-muted mb-2">
                        {enabledGuilds.length} of {guilds.length} guilds enabled
                      </div>
                      <div className="space-y-1 max-h-[350px] overflow-y-auto">
                        {guilds
                          .filter((g) => !guildSearch || g.name.toLowerCase().includes(guildSearch.toLowerCase()))
                          .sort((a, b) => {
                            const aEnabled = enabledGuilds.includes(a.id) ? 0 : 1;
                            const bEnabled = enabledGuilds.includes(b.id) ? 0 : 1;
                            return aEnabled - bEnabled;
                          })
                          .map((guild) => {
                            const enabled = enabledGuilds.includes(guild.id);
                            return (
                              <button
                                key={guild.id}
                                onClick={() => {
                                  setEnabledGuilds((prev) =>
                                    enabled ? prev.filter((id) => id !== guild.id) : [...prev, guild.id]
                                  );
                                }}
                                className={`w-full flex items-center gap-3 px-3 py-2 rounded text-sm text-left transition-colors ${
                                  enabled
                                    ? 'bg-discord-green/10 text-discord-text'
                                    : 'bg-discord-dark/50 text-discord-text-muted'
                                }`}
                              >
                                <div
                                  className={`w-4 h-4 rounded-sm border flex items-center justify-center shrink-0 transition-colors ${
                                    enabled
                                      ? 'bg-discord-green border-discord-green'
                                      : 'border-discord-channel-icon bg-transparent'
                                  }`}
                                >
                                  {enabled && (
                                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                      <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                  )}
                                </div>
                                <Users size={14} className="shrink-0 opacity-60" />
                                <span className="truncate flex-1">{guild.name}</span>
                                <span className="text-[11px] text-discord-text-muted shrink-0">
                                  {guild.channels.length} ch
                                </span>
                              </button>
                            );
                          })}
                        {guilds.length === 0 && (
                          <p className="text-sm text-discord-text-muted text-center py-2">Loading guilds...</p>
                        )}
                        {guilds.length > 0 && guilds.filter((g) => !guildSearch || g.name.toLowerCase().includes(guildSearch.toLowerCase())).length === 0 && (
                          <p className="text-sm text-discord-text-muted text-center py-2">No guilds match your search.</p>
                        )}
                      </div>
                    </div>

                    <div className="p-4 bg-discord-sidebar rounded-lg">
                      <h4 className="text-sm font-semibold text-white mb-2">Guild Message Colors</h4>
                      <p className="text-sm text-discord-text-muted mb-3">
                        Set a background color for messages from each enabled guild to visually distinguish them in mixed rooms.
                      </p>
                      <div className="space-y-2">
                        {guilds.filter((g) => enabledGuilds.includes(g.id)).map((guild) => (
                          <div key={guild.id} className="flex items-center gap-3 px-3 py-2 bg-discord-dark rounded">
                            <input
                              type="color"
                              value={guildColors[guild.id] || '#313338'}
                              onChange={(e) => setGuildColors((prev) => ({ ...prev, [guild.id]: e.target.value }))}
                              className="w-6 h-6 rounded cursor-pointer border border-discord-divider bg-transparent shrink-0"
                            />
                            <span className="text-sm text-discord-text flex-1 truncate">{guild.name}</span>
                            <input
                              type="text"
                              value={guildColors[guild.id] || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setGuildColors((prev) => {
                                  if (!val) { const { [guild.id]: _, ...rest } = prev; return rest; }
                                  return { ...prev, [guild.id]: val };
                                });
                              }}
                              placeholder="default"
                              className="w-24 bg-discord-sidebar border-none rounded px-2 py-1 text-xs text-discord-text outline-none focus:ring-1 focus:ring-discord-blurple font-mono"
                            />
                            {guildColors[guild.id] && (
                              <button
                                onClick={() => setGuildColors((prev) => { const { [guild.id]: _, ...rest } = prev; return rest; })}
                                className="text-discord-text-muted hover:text-white"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                        {enabledGuilds.length === 0 && (
                          <p className="text-sm text-discord-text-muted text-center py-2">Enable some guilds above first.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Save bar */}
        <div className="border-t border-discord-divider px-8 py-3 flex items-center justify-end gap-3 shrink-0 bg-discord-dark">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-discord-blurple hover:bg-discord-blurple-hover disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm text-white font-medium transition-colors"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
