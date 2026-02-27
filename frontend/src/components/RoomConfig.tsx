import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../stores/appStore';
import type { ChannelRef, KeywordPattern, KeywordMatchMode } from '../types';
import { X, Search, Plus, Trash2, Hash, MessageCircle, Users, Filter } from 'lucide-react';

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
  const [tab, setTab] = useState<'channels' | 'users' | 'filter' | 'keywords'>('channels');
  const [roomKeywordPatterns, setRoomKeywordPatterns] = useState<KeywordPattern[]>([]);
  const [newKeywordPattern, setNewKeywordPattern] = useState('');
  const [newKeywordMatchMode, setNewKeywordMatchMode] = useState<KeywordMatchMode>('includes');
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
    const initialTab = configModalTab && configModalTab !== 'global' ? configModalTab : 'channels';
    setTab(initialTab);
  }, [editingRoom, configModalOpen, configModalTab]);

  if (!configModalOpen || configModalTab === 'global') return null;

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

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingRoom) {
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
            {editingRoom ? `Edit Room: ${editingRoom.name}` : 'Create New Room'}
          </h2>
          <button onClick={closeConfigModal} className="text-discord-text-muted hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
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
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4" data-form-type="other" data-lpignore="true" data-1p-ignore>
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
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  data-form-type="other"
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
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  data-form-type="other"
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
              <p className="text-sm text-discord-text-muted mb-2">
                Add patterns to match against messages in this room. Use <strong className="text-discord-text">Contains</strong> for substring matches, <strong className="text-discord-text">Exact</strong> for whole-word matches, or <strong className="text-discord-text">Regex</strong> for advanced patterns. Matches trigger an orange highlight and alert.
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
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newKeywordPattern.trim()) {
                        setRoomKeywordPatterns((prev) => [...prev, { pattern: newKeywordPattern.trim(), matchMode: newKeywordMatchMode, label: newKeywordLabel.trim() || undefined }]);
                        setNewKeywordPattern('');
                        setNewKeywordLabel('');
                      }
                    }}
                    placeholder={
                      newKeywordMatchMode === 'regex' ? 'Regex pattern (e.g. launch|stealth)'
                      : newKeywordMatchMode === 'exact' ? 'Exact word (e.g. launch)'
                      : 'Keyword (e.g. stealth launch)'
                    }
                    className="flex-1 bg-discord-dark border-none rounded px-3 py-2 text-sm text-discord-text outline-none focus:ring-2 focus:ring-discord-blurple font-mono"
                  />
                  <button
                    onClick={() => {
                      if (!newKeywordPattern.trim()) return;
                      setRoomKeywordPatterns((prev) => [...prev, { pattern: newKeywordPattern.trim(), matchMode: newKeywordMatchMode, label: newKeywordLabel.trim() || undefined }]);
                      setNewKeywordPattern('');
                      setNewKeywordLabel('');
                    }}
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
                {roomKeywordPatterns.length === 0 && (
                  <p className="text-sm text-discord-text-muted text-center py-4">
                    No keyword patterns configured.
                  </p>
                )}
                {roomKeywordPatterns.map((kw, idx) => (
                  <div key={idx} className="flex items-center justify-between px-3 py-2 bg-discord-dark rounded">
                    <div className="flex items-center gap-2 min-w-0">
                      {(kw.matchMode === 'regex' || (!kw.matchMode && kw.isRegex)) && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-400/20 text-orange-400 font-semibold shrink-0">
                          REGEX
                        </span>
                      )}
                      {kw.matchMode === 'exact' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-discord-blurple/20 text-discord-blurple font-semibold shrink-0">
                          EXACT
                        </span>
                      )}
                      <span className="text-sm text-discord-text font-mono truncate">{kw.pattern}</span>
                      {kw.label && (
                        <span className="text-[11px] text-discord-text-muted">({kw.label})</span>
                      )}
                    </div>
                    <button
                      onClick={() => setRoomKeywordPatterns((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-discord-text-muted hover:text-discord-red shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
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
            disabled={saving || !name.trim()}
            className="px-4 py-2 bg-discord-blurple hover:bg-discord-blurple-hover disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm text-white font-medium transition-colors"
          >
            {saving ? 'Saving...' : editingRoom ? 'Update Room' : 'Create Room'}
          </button>
        </div>
      </div>
    </div>
  );
}
