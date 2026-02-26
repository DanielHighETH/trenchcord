import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../stores/appStore';
import type { ChannelRef, SolPlatform, EvmPlatform, ContractClickAction, KeywordPattern } from '../types';
import { X, Search, Plus, Trash2, Hash, MessageCircle, Users, Filter } from 'lucide-react';
import { requestNotificationPermission } from '../utils/desktopNotification';

export default function RoomConfig() {
  const configModalOpen = useAppStore((s) => s.configModalOpen);
  const configModalTab = useAppStore((s) => s.configModalTab);
  const editingRoom = useAppStore((s) => s.editingRoom);
  const closeConfigModal = useAppStore((s) => s.closeConfigModal);
  const guilds = useAppStore((s) => s.guilds);
  const dmChannels = useAppStore((s) => s.dmChannels);
  const createRoom = useAppStore((s) => s.createRoom);
  const updateRoom = useAppStore((s) => s.updateRoom);
  const config = useAppStore((s) => s.config);
  const updateConfig = useAppStore((s) => s.updateConfig);
  const fetchGuilds = useAppStore((s) => s.fetchGuilds);
  const fetchDMChannels = useAppStore((s) => s.fetchDMChannels);
  const fetchConfig = useAppStore((s) => s.fetchConfig);
  const allMessages = useAppStore((s) => s.messages);

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

  const [name, setName] = useState('');
  const [selectedChannels, setSelectedChannels] = useState<ChannelRef[]>([]);
  const [highlightedUsers, setHighlightedUsers] = useState<string[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<string[]>([]);
  const [filterEnabled, setFilterEnabled] = useState(false);
  const [roomColor, setRoomColor] = useState('');
  const [newUserId, setNewUserId] = useState('');
  const [newFilterUser, setNewFilterUser] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'channels' | 'users' | 'filter' | 'keywords' | 'global'>('channels');
  const [globalUsers, setGlobalUsers] = useState<string[]>([]);
  const [contractDetection, setContractDetection] = useState(true);
  const [guildColors, setGuildColors] = useState<Record<string, string>>({});
  const [enabledGuilds, setEnabledGuilds] = useState<string[]>([]);
  const [guildSearch, setGuildSearch] = useState('');
  const [evmAddressColor, setEvmAddressColor] = useState('#fee75c');
  const [solAddressColor, setSolAddressColor] = useState('#14f195');
  const [openInDiscordApp, setOpenInDiscordApp] = useState(false);
  const [messageSounds, setMessageSounds] = useState(false);
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
  const [roomKeywordPatterns, setRoomKeywordPatterns] = useState<KeywordPattern[]>([]);
  const [newKeywordPattern, setNewKeywordPattern] = useState('');
  const [newKeywordIsRegex, setNewKeywordIsRegex] = useState(false);
  const [newKeywordLabel, setNewKeywordLabel] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (configModalOpen) {
      fetchGuilds();
      fetchDMChannels();
      fetchConfig();
    }
  }, [configModalOpen, fetchGuilds, fetchDMChannels, fetchConfig]);

  useEffect(() => {
    if (editingRoom) {
      setName(editingRoom.name);
      setSelectedChannels([...editingRoom.channels]);
      setHighlightedUsers([...editingRoom.highlightedUsers]);
      setFilteredUsers([...(editingRoom.filteredUsers ?? [])]);
      setFilterEnabled(editingRoom.filterEnabled ?? false);
      setRoomColor(editingRoom.color ?? '');
      setRoomKeywordPatterns([...(editingRoom.keywordPatterns ?? [])]);
    } else {
      setName('');
      setSelectedChannels([]);
      setHighlightedUsers([]);
      setFilteredUsers([]);
      setFilterEnabled(false);
      setRoomColor('');
      setRoomKeywordPatterns([]);
    }
    setSearch('');
    setNewUserId('');
    setNewFilterUser('');
    setTab(configModalTab ?? 'channels');
  }, [editingRoom, configModalOpen, configModalTab]);

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
    }
  }, [config]);

  if (!configModalOpen) return null;

  const isChannelSelected = (channelId: string) =>
    selectedChannels.some((c) => c.channelId === channelId);

  const toggleChannel = (ref: ChannelRef) => {
    if (isChannelSelected(ref.channelId)) {
      setSelectedChannels((prev) => prev.filter((c) => c.channelId !== ref.channelId));
    } else {
      setSelectedChannels((prev) => [...prev, ref]);
    }
  };

  const toggleChannelEmbeds = (channelId: string) => {
    setSelectedChannels((prev) =>
      prev.map((c) =>
        c.channelId === channelId ? { ...c, disableEmbeds: !c.disableEmbeds } : c
      )
    );
  };

  const addHighlightedUser = () => {
    const id = newUserId.trim();
    if (id && !highlightedUsers.includes(id)) {
      setHighlightedUsers((prev) => [...prev, id]);
      setNewUserId('');
    }
  };

  const removeHighlightedUser = (userId: string) => {
    setHighlightedUsers((prev) => prev.filter((u) => u !== userId));
  };

  const addFilteredUser = () => {
    const val = newFilterUser.trim();
    if (val && !filteredUsers.includes(val)) {
      setFilteredUsers((prev) => [...prev, val]);
      setNewFilterUser('');
    }
  };

  const removeFilteredUser = (user: string) => {
    setFilteredUsers((prev) => prev.filter((u) => u !== user));
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

  const handleSave = async () => {
    setSaving(true);
    try {
      if (tab === 'global') {
        await updateConfig({
          globalHighlightedUsers: globalUsers,
          contractDetection,
          guildColors,
          enabledGuilds,
          evmAddressColor,
          solAddressColor,
          openInDiscordApp,
          messageSounds,
          pushover: { enabled: pushoverEnabled, appToken: pushoverAppToken, userKey: pushoverUserKey },
          contractLinkTemplates: {
            evm: customEvmUrl,
            sol: customSolUrl,
            solPlatform,
            evmPlatform,
          },
          contractClickAction,
          autoOpenHighlightedContracts,
          globalKeywordPatterns,
          keywordAlertsEnabled,
          desktopNotifications,
        });
      } else if (editingRoom) {
        await updateRoom(editingRoom.id, { name, channels: selectedChannels, highlightedUsers, filteredUsers, filterEnabled, color: roomColor || null, keywordPatterns: roomKeywordPatterns });
      } else {
        if (!name.trim()) return;
        await createRoom(name.trim(), selectedChannels, highlightedUsers, roomColor || null, filteredUsers, filterEnabled);
      }
      closeConfigModal();
    } finally {
      setSaving(false);
    }
  };

  const activeEnabledGuilds = config?.enabledGuilds ?? enabledGuilds;

  const filteredGuilds = guilds
    .filter((g) => activeEnabledGuilds.includes(g.id))
    .map((g) => ({
      ...g,
      channels: g.channels.filter(
        (c) => !search || c.name.toLowerCase().includes(search.toLowerCase()) || g.name.toLowerCase().includes(search.toLowerCase())
      ),
    })).filter((g) => g.channels.length > 0);

  const filteredDMs = dmChannels.filter(
    (dm) =>
      !search ||
      dm.recipients.some(
        (r) =>
          r.username.toLowerCase().includes(search.toLowerCase()) ||
          (r.global_name ?? '').toLowerCase().includes(search.toLowerCase())
      )
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={closeConfigModal}>
      <div
        className="bg-discord-sidebar rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-discord-divider">
          <h2 className="text-lg font-semibold text-white">
            {editingRoom ? `Edit Room: ${editingRoom.name}` : configModalTab === 'global' ? 'Settings' : 'Create New Room'}
          </h2>
          <button onClick={closeConfigModal} className="text-discord-text-muted hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Tabs - hide when opened as global-settings-only */}
        {!(configModalTab === 'global' && !editingRoom) && (
          <div className="flex gap-0 border-b border-discord-divider px-6">
            <button
              onClick={() => setTab('channels')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === 'channels'
                  ? 'border-discord-blurple text-white'
                  : 'border-transparent text-discord-text-muted hover:text-discord-text'
              }`}
            >
              Channels
            </button>
            <button
              onClick={() => setTab('users')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === 'users'
                  ? 'border-discord-blurple text-white'
                  : 'border-transparent text-discord-text-muted hover:text-discord-text'
              }`}
            >
              Highlighted Users
            </button>
            <button
              onClick={() => setTab('filter')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === 'filter'
                  ? 'border-discord-blurple text-white'
                  : 'border-transparent text-discord-text-muted hover:text-discord-text'
              }`}
            >
              User Filter
            </button>
            <button
              onClick={() => setTab('keywords')}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === 'keywords'
                  ? 'border-discord-blurple text-white'
                  : 'border-transparent text-discord-text-muted hover:text-discord-text'
              }`}
            >
              Keywords
            </button>
            {editingRoom && (
              <button
                onClick={() => setTab('global')}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  tab === 'global'
                    ? 'border-discord-blurple text-white'
                    : 'border-transparent text-discord-text-muted hover:text-discord-text'
                }`}
              >
                Global Settings
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {tab === 'channels' && (
            <>
              {/* Room name */}
              <div className="mb-4">
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted mb-2">
                  Room Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="my-room"
                  className="w-full bg-discord-dark border-none rounded px-3 py-2 text-sm text-discord-text outline-none focus:ring-2 focus:ring-discord-blurple"
                />
              </div>

              {/* Room background color */}
              <div className="mb-4">
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted mb-2">
                  Room Background Color
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={roomColor || '#313338'}
                    onChange={(e) => setRoomColor(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border border-discord-divider bg-transparent"
                  />
                  <input
                    type="text"
                    value={roomColor}
                    onChange={(e) => setRoomColor(e.target.value)}
                    placeholder="#313338 (default)"
                    className="flex-1 bg-discord-dark border-none rounded px-3 py-2 text-sm text-discord-text outline-none focus:ring-2 focus:ring-discord-blurple font-mono"
                  />
                  {roomColor && (
                    <button
                      onClick={() => setRoomColor('')}
                      className="text-[11px] text-discord-text-muted hover:text-white"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>

              {/* Selected count */}
              <div className="text-[11px] text-discord-text-muted mb-3">
                {selectedChannels.length} channel{selectedChannels.length !== 1 ? 's' : ''} selected
              </div>

              {/* Per-channel embed settings */}
              {selectedChannels.length > 0 && (
                <div className="mb-4 border border-discord-divider rounded p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted mb-2">
                    Embeds per channel
                  </div>
                  <div className="space-y-1.5">
                    {selectedChannels.map((ch) => (
                      <div key={ch.channelId} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-discord-dark/50">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {ch.guildId ? <Hash size={12} className="shrink-0 text-discord-channel-icon" /> : <MessageCircle size={12} className="shrink-0 text-discord-channel-icon" />}
                          <span className="text-sm text-discord-text truncate">
                            {ch.guildName ? `${ch.guildName} / ` : ''}{ch.channelName ?? ch.channelId}
                          </span>
                        </div>
                        <button
                          onClick={() => toggleChannelEmbeds(ch.channelId)}
                          className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded transition-colors ${
                            ch.disableEmbeds
                              ? 'bg-discord-red/20 text-discord-red'
                              : 'bg-discord-green/20 text-discord-green'
                          }`}
                        >
                          {ch.disableEmbeds ? 'EMBEDS OFF' : 'EMBEDS ON'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Search */}
              <div className="relative mb-4">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-discord-text-muted" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search guilds and channels..."
                  className="w-full bg-discord-dark border-none rounded px-3 py-2 pl-9 text-sm text-discord-text outline-none focus:ring-2 focus:ring-discord-blurple"
                />
              </div>

              {/* Guild channels */}
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {filteredGuilds.map((guild) => (
                  <div key={guild.id}>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted mb-1 flex items-center gap-1.5">
                      <Users size={12} />
                      {guild.name}
                    </div>
                    <div className="space-y-0.5 ml-2">
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
                            className={`w-full flex items-center gap-2 px-2 py-1 rounded text-sm text-left transition-colors ${
                              selected
                                ? 'bg-discord-blurple/20 text-discord-blurple'
                                : 'text-discord-channel-icon hover:bg-discord-hover/50 hover:text-discord-text'
                            }`}
                          >
                            <Hash size={14} />
                            <span className="truncate">{ch.name}</span>
                            {selected && <span className="ml-auto text-[10px]">ADDED</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* DM channels */}
                {filteredDMs.length > 0 && (
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted mb-1 flex items-center gap-1.5">
                      <MessageCircle size={12} />
                      Direct Messages
                    </div>
                    <div className="space-y-0.5 ml-2">
                      {filteredDMs.map((dm) => {
                        const selected = isChannelSelected(dm.id);
                        const recipientNames = dm.recipients
                          .map((r) => r.global_name || r.username)
                          .join(', ');
                        return (
                          <button
                            key={dm.id}
                            onClick={() =>
                              toggleChannel({
                                guildId: null,
                                channelId: dm.id,
                                channelName: recipientNames,
                              })
                            }
                            className={`w-full flex items-center gap-2 px-2 py-1 rounded text-sm text-left transition-colors ${
                              selected
                                ? 'bg-discord-blurple/20 text-discord-blurple'
                                : 'text-discord-channel-icon hover:bg-discord-hover/50 hover:text-discord-text'
                            }`}
                          >
                            <MessageCircle size={14} />
                            <span className="truncate">{recipientNames}</span>
                            {selected && <span className="ml-auto text-[10px]">ADDED</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {filteredGuilds.length === 0 && filteredDMs.length === 0 && (
                  <p className="text-sm text-discord-text-muted text-center py-4">
                    {guilds.length === 0 ? 'Loading guilds...' : 'No channels match your search.'}
                  </p>
                )}
              </div>
            </>
          )}

          {tab === 'users' && (
            <>
              <p className="text-sm text-discord-text-muted mb-4">
                Add Discord user IDs to highlight in this room. Their messages will be visually
                highlighted and you'll get alerts when they send messages.
              </p>
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addHighlightedUser()}
                  placeholder="Discord User ID"
                  className="flex-1 bg-discord-dark border-none rounded px-3 py-2 text-sm text-discord-text outline-none focus:ring-2 focus:ring-discord-blurple"
                />
                <button
                  onClick={addHighlightedUser}
                  className="px-3 py-2 bg-discord-blurple hover:bg-discord-blurple-hover rounded text-sm text-white transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>
              <div className="space-y-1">
                {highlightedUsers.length === 0 && (
                  <p className="text-sm text-discord-text-muted text-center py-4">
                    No highlighted users for this room.
                  </p>
                )}
                {highlightedUsers.map((uid) => (
                  <div
                    key={uid}
                    className="flex items-center justify-between px-3 py-2 bg-discord-dark rounded"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm text-discord-text font-mono">{uid}</span>
                      {userNameMap.has(uid) && (
                        <span className="text-[11px] text-discord-text-muted">{userNameMap.get(uid)}</span>
                      )}
                    </div>
                    <button
                      onClick={() => removeHighlightedUser(uid)}
                      className="text-discord-text-muted hover:text-discord-red shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'filter' && (
            <>
              <p className="text-sm text-discord-text-muted mb-4">
                When enabled, only messages from these users will be shown in this room.
                You can add Discord user IDs or usernames. Tip: click a username in chat to copy their ID.
              </p>

              <label className="flex items-center gap-3 cursor-pointer mb-4">
                <div
                  className={`w-10 h-5 rounded-full transition-colors relative ${
                    filterEnabled ? 'bg-discord-green' : 'bg-discord-input'
                  }`}
                  onClick={() => setFilterEnabled(!filterEnabled)}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                      filterEnabled ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </div>
                <span className="text-sm text-discord-text">
                  {filterEnabled ? 'Filter active' : 'Filter disabled'}
                  {filterEnabled && filteredUsers.length === 0 && (
                    <span className="text-discord-yellow ml-2">(add users below)</span>
                  )}
                </span>
              </label>

              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={newFilterUser}
                  onChange={(e) => setNewFilterUser(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addFilteredUser()}
                  placeholder="User ID or username"
                  className="flex-1 bg-discord-dark border-none rounded px-3 py-2 text-sm text-discord-text outline-none focus:ring-2 focus:ring-discord-blurple"
                />
                <button
                  onClick={addFilteredUser}
                  className="px-3 py-2 bg-discord-blurple hover:bg-discord-blurple-hover rounded text-sm text-white transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>
              <div className="space-y-1">
                {filteredUsers.length === 0 && (
                  <p className="text-sm text-discord-text-muted text-center py-4">
                    No filtered users for this room.
                  </p>
                )}
                {filteredUsers.map((uid) => (
                  <div
                    key={uid}
                    className="flex items-center justify-between px-3 py-2 bg-discord-dark rounded"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Filter size={12} className="shrink-0 text-discord-green" />
                      <span className="text-sm text-discord-text font-mono truncate">{uid}</span>
                      {userNameMap.has(uid) && (
                        <span className="text-[11px] text-discord-text-muted">{userNameMap.get(uid)}</span>
                      )}
                    </div>
                    <button
                      onClick={() => removeFilteredUser(uid)}
                      className="text-discord-text-muted hover:text-discord-red shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'keywords' && (
            <>
              <p className="text-sm text-discord-text-muted mb-4">
                Add keyword or regex patterns to match against messages{editingRoom ? ' in this room' : ''}. Matching messages will be highlighted with an orange border and trigger alerts.
              </p>

              <div className="space-y-3 mb-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newKeywordPattern}
                    onChange={(e) => setNewKeywordPattern(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newKeywordPattern.trim()) {
                        const patterns = editingRoom ? roomKeywordPatterns : globalKeywordPatterns;
                        const setter = editingRoom ? setRoomKeywordPatterns : setGlobalKeywordPatterns;
                        setter([...patterns, { pattern: newKeywordPattern.trim(), isRegex: newKeywordIsRegex, label: newKeywordLabel.trim() || undefined }]);
                        setNewKeywordPattern('');
                        setNewKeywordLabel('');
                      }
                    }}
                    placeholder={newKeywordIsRegex ? 'Regex pattern (e.g. launch|stealth)' : 'Keyword (e.g. stealth launch)'}
                    className="flex-1 bg-discord-dark border-none rounded px-3 py-2 text-sm text-discord-text outline-none focus:ring-2 focus:ring-discord-blurple font-mono"
                  />
                  <button
                    onClick={() => {
                      if (!newKeywordPattern.trim()) return;
                      const patterns = editingRoom ? roomKeywordPatterns : globalKeywordPatterns;
                      const setter = editingRoom ? setRoomKeywordPatterns : setGlobalKeywordPatterns;
                      setter([...patterns, { pattern: newKeywordPattern.trim(), isRegex: newKeywordIsRegex, label: newKeywordLabel.trim() || undefined }]);
                      setNewKeywordPattern('');
                      setNewKeywordLabel('');
                    }}
                    className="px-3 py-2 bg-discord-blurple hover:bg-discord-blurple-hover rounded text-sm text-white transition-colors"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newKeywordIsRegex}
                      onChange={(e) => setNewKeywordIsRegex(e.target.checked)}
                      className="rounded border-discord-divider"
                    />
                    <span className="text-xs text-discord-text-muted">Regex</span>
                  </label>
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
                {(() => {
                  const patterns = editingRoom ? roomKeywordPatterns : globalKeywordPatterns;
                  const setter = editingRoom ? setRoomKeywordPatterns : setGlobalKeywordPatterns;
                  if (patterns.length === 0) {
                    return (
                      <p className="text-sm text-discord-text-muted text-center py-4">
                        No keyword patterns configured.
                      </p>
                    );
                  }
                  return patterns.map((kw, idx) => (
                    <div key={idx} className="flex items-center justify-between px-3 py-2 bg-discord-dark rounded">
                      <div className="flex items-center gap-2 min-w-0">
                        {kw.isRegex && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-400/20 text-orange-400 font-semibold shrink-0">
                            REGEX
                          </span>
                        )}
                        <span className="text-sm text-discord-text font-mono truncate">{kw.pattern}</span>
                        {kw.label && (
                          <span className="text-[11px] text-discord-text-muted">({kw.label})</span>
                        )}
                      </div>
                      <button
                        onClick={() => setter(patterns.filter((_, i) => i !== idx))}
                        className="text-discord-text-muted hover:text-discord-red shrink-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ));
                })()}
              </div>
            </>
          )}

          {tab === 'global' && (
            <>
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-white mb-2">Contract Detection</h3>
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    className={`w-10 h-5 rounded-full transition-colors relative ${
                      contractDetection ? 'bg-discord-green' : 'bg-discord-input'
                    }`}
                    onClick={() => setContractDetection(!contractDetection)}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                        contractDetection ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </div>
                  <span className="text-sm text-discord-text">
                    Detect SOL/EVM contract addresses in messages
                  </span>
                </label>
              </div>

              <div className="mb-6">
                <h3 className="text-sm font-semibold text-white mb-2">Open in Discord App</h3>
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    className={`w-10 h-5 rounded-full transition-colors relative ${
                      openInDiscordApp ? 'bg-discord-green' : 'bg-discord-input'
                    }`}
                    onClick={() => setOpenInDiscordApp(!openInDiscordApp)}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                        openInDiscordApp ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </div>
                  <span className="text-sm text-discord-text">
                    Clicking a channel badge opens the message directly in the Discord app
                  </span>
                </label>
              </div>

              <div className="mb-6">
                <h3 className="text-sm font-semibold text-white mb-2">Message Sounds</h3>
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    className={`w-10 h-5 rounded-full transition-colors relative ${
                      messageSounds ? 'bg-discord-green' : 'bg-discord-input'
                    }`}
                    onClick={() => setMessageSounds(!messageSounds)}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                        messageSounds ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </div>
                  <span className="text-sm text-discord-text">
                    Play a sound when highlighted users send messages
                  </span>
                </label>
              </div>

              <div className="mb-6">
                <h3 className="text-sm font-semibold text-white mb-2">Keyword Alerts</h3>
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    className={`w-10 h-5 rounded-full transition-colors relative ${
                      keywordAlertsEnabled ? 'bg-discord-green' : 'bg-discord-input'
                    }`}
                    onClick={() => setKeywordAlertsEnabled(!keywordAlertsEnabled)}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                        keywordAlertsEnabled ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </div>
                  <span className="text-sm text-discord-text">
                    Enable keyword/regex pattern matching alerts
                  </span>
                </label>
              </div>

              <div className="mb-6">
                <h3 className="text-sm font-semibold text-white mb-2">Desktop Notifications</h3>
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    className={`w-10 h-5 rounded-full transition-colors relative ${
                      desktopNotifications ? 'bg-discord-green' : 'bg-discord-input'
                    }`}
                    onClick={() => {
                      const newVal = !desktopNotifications;
                      setDesktopNotifications(newVal);
                      if (newVal) requestNotificationPermission();
                    }}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                        desktopNotifications ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </div>
                  <span className="text-sm text-discord-text">
                    Show browser notifications for highlighted users and keyword matches (when tab is not focused)
                  </span>
                </label>
              </div>

              <div className="mb-6">
                <h3 className="text-sm font-semibold text-white mb-2">Contract Click Action</h3>
                <p className="text-sm text-discord-text-muted mb-3">
                  What happens when you click a contract address in chat.
                </p>
                <div className="flex gap-1.5 mb-3">
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

              <div className="mb-6">
                <h3 className="text-sm font-semibold text-white mb-2">Trading Platform</h3>
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


              <div className="mb-6">
                <h3 className="text-sm font-semibold text-white mb-2">Auto-Open Highlighted Contracts</h3>
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    className={`w-10 h-5 rounded-full transition-colors relative ${
                      autoOpenHighlightedContracts ? 'bg-discord-green' : 'bg-discord-input'
                    }`}
                    onClick={() => setAutoOpenHighlightedContracts(!autoOpenHighlightedContracts)}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                        autoOpenHighlightedContracts ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </div>
                  <span className="text-sm text-discord-text">
                    Automatically open a new tab when a highlighted user posts a contract address
                  </span>
                </label>
              </div>

              <div className="mb-6">
                <h3 className="text-sm font-semibold text-white mb-2">Pushover Notifications</h3>
                <p className="text-sm text-discord-text-muted mb-3">
                  Send push notifications via <a href="https://pushover.net" target="_blank" rel="noopener noreferrer" className="text-discord-text-link hover:underline">Pushover</a> when a highlighted user posts a contract address.
                </p>
                <label className="flex items-center gap-3 cursor-pointer mb-4">
                  <div
                    className={`w-10 h-5 rounded-full transition-colors relative ${
                      pushoverEnabled ? 'bg-discord-green' : 'bg-discord-input'
                    }`}
                    onClick={() => setPushoverEnabled(!pushoverEnabled)}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                        pushoverEnabled ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </div>
                  <span className="text-sm text-discord-text">Enable Pushover notifications</span>
                </label>
                {pushoverEnabled && (
                  <div className="space-y-3">
                    <div className="px-3 py-2 bg-discord-dark rounded">
                      <label className="text-[11px] text-discord-text-muted mb-1 block">Application API Token</label>
                      <input
                        type="password"
                        value={pushoverAppToken}
                        onChange={(e) => setPushoverAppToken(e.target.value)}
                        placeholder="azGDORePK8gMaC0QOYAMyEEuzJnyUi"
                        className="w-full bg-discord-sidebar border-none rounded px-2 py-1.5 text-sm text-discord-text outline-none focus:ring-1 focus:ring-discord-blurple font-mono"
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
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="mb-6">
                <h3 className="text-sm font-semibold text-white mb-2">Address Colors</h3>
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
                    <span className="text-sm text-discord-text flex-1">EVM (0x…)</span>
                    <input
                      type="text"
                      value={evmAddressColor}
                      onChange={(e) => setEvmAddressColor(e.target.value)}
                      className="w-24 bg-discord-sidebar border-none rounded px-2 py-1 text-xs text-discord-text outline-none focus:ring-1 focus:ring-discord-blurple font-mono"
                    />
                    {evmAddressColor !== '#fee75c' && (
                      <button
                        onClick={() => setEvmAddressColor('#fee75c')}
                        className="text-[11px] text-discord-text-muted hover:text-white"
                      >
                        Reset
                      </button>
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
                      <button
                        onClick={() => setSolAddressColor('#14f195')}
                        className="text-[11px] text-discord-text-muted hover:text-white"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-white mb-2">Global Highlighted Users</h3>
                <p className="text-sm text-discord-text-muted mb-3">
                  These users will be highlighted in all rooms.
                </p>
                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={newUserId}
                    onChange={(e) => setNewUserId(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addGlobalUser()}
                    placeholder="Discord User ID"
                    className="flex-1 bg-discord-dark border-none rounded px-3 py-2 text-sm text-discord-text outline-none focus:ring-2 focus:ring-discord-blurple"
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
                    <div
                      key={uid}
                      className="flex items-center justify-between px-3 py-2 bg-discord-dark rounded"
                    >
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

              <div className="mt-6">
                <h3 className="text-sm font-semibold text-white mb-2">Enabled Guilds</h3>
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
                <div className="space-y-1 max-h-[250px] overflow-y-auto">
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

              <div className="mt-6">
                <h3 className="text-sm font-semibold text-white mb-2">Guild Message Colors</h3>
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
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                  {enabledGuilds.length === 0 && (
                    <p className="text-sm text-discord-text-muted text-center py-2">Enable some guilds above first.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-discord-divider">
          <button
            onClick={closeConfigModal}
            className="px-4 py-2 text-sm text-discord-text-muted hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || (tab !== 'global' && !name.trim())}
            className="px-4 py-2 bg-discord-blurple hover:bg-discord-blurple-hover disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm text-white font-medium transition-colors"
          >
            {saving ? 'Saving...' : tab === 'global' ? 'Save Settings' : editingRoom ? 'Update Room' : 'Create Room'}
          </button>
        </div>
      </div>
    </div>
  );
}
