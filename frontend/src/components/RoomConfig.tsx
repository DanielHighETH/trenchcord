import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../stores/appStore';
import type { ChannelRef, CategoryRef, GuildInfo, KeywordPattern, KeywordMatchMode, HighlightMode, Room } from '../types';
import { X, Search, Plus, Trash2, Hash, MessageCircle, Users, Filter, AlertTriangle, Palette, Send, Star, EyeOff, FolderPlus, FolderCheck } from 'lucide-react';
import ColorPickerWithAlpha from './ColorPickerWithAlpha';

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
  const updateConfig = useAppStore((s) => s.updateConfig);
  const allMessages = useAppStore((s) => s.messages);
  const guildRoles = useAppStore((s) => s.guildRoles);
  const fetchGuildRoles = useAppStore((s) => s.fetchGuildRoles);
  const hideRole = useAppStore((s) => s.hideRole);
  const unhideRole = useAppStore((s) => s.unhideRole);
  const telegramChats = useAppStore((s) => s.telegramChats);
  const fetchTelegramChats = useAppStore((s) => s.fetchTelegramChats);
  const authStatus = useAppStore((s) => s.authStatus);

  const userNameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (config?.userNameCache) {
      for (const [id, name] of Object.entries(config.userNameCache)) {
        map.set(id, name);
      }
    }
    for (const msgs of Object.values(allMessages)) {
      for (const msg of msgs) {
        map.set(msg.author.id, msg.author.displayName);
      }
    }
    return map;
  }, [allMessages, config?.userNameCache]);

  const [name, setName] = useState('');
  const [selectedChannels, setSelectedChannels] = useState<ChannelRef[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<CategoryRef[]>([]);
  const [highlightedUsers, setHighlightedUsers] = useState<string[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<string[]>([]);
  const [filterEnabled, setFilterEnabled] = useState(false);
  const [roomColor, setRoomColor] = useState('');
  const [hotkey, setHotkey] = useState('');
  const [newUserId, setNewUserId] = useState('');
  const [newFilterUser, setNewFilterUser] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'channels' | 'users' | 'roles' | 'filter' | 'keywords'>('channels');
  const [platformTab, setPlatformTab] = useState<'discord' | 'telegram'>('discord');
  const [roomKeywordPatterns, setRoomKeywordPatterns] = useState<KeywordPattern[]>([]);
  const [highlightMode, setHighlightMode] = useState<HighlightMode>('background');
  const [highlightedUserColors, setHighlightedUserColors] = useState<Record<string, string>>({});
  const [highlightedRoles, setHighlightedRoles] = useState<NonNullable<Room['highlightedRoles']>>([]);
  const [roleSearch, setRoleSearch] = useState('');
  const [newKeywordPattern, setNewKeywordPattern] = useState('');
  const [newKeywordMatchMode, setNewKeywordMatchMode] = useState<KeywordMatchMode>('includes');
  const [newKeywordLabel, setNewKeywordLabel] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (configModalOpen) {
      fetchGuilds();
      fetchDMChannels();
      fetchConfig();
      if (authStatus?.telegramConnected) {
        fetchTelegramChats();
      }
    }
  }, [configModalOpen, fetchGuilds, fetchDMChannels, fetchConfig, fetchTelegramChats, authStatus?.telegramConnected]);

  useEffect(() => {
    if (editingRoom) {
      setName(editingRoom.name);
      // The API folds category channels into `channels`; they are not picks of
      // their own and must not be saved back as such.
      setSelectedChannels(editingRoom.channels.filter((c) => !c.categoryId));
      setSelectedCategories((editingRoom.categories ?? []).map((c) => ({ ...c, excludedChannelIds: [...(c.excludedChannelIds ?? [])] })));
      setHighlightedUsers([...editingRoom.highlightedUsers]);
      setFilteredUsers([...(editingRoom.filteredUsers ?? [])]);
      setFilterEnabled(editingRoom.filterEnabled ?? false);
      setRoomColor(editingRoom.color ?? '');
      setHotkey(editingRoom.hotkey ?? '');
      setRoomKeywordPatterns([...(editingRoom.keywordPatterns ?? [])]);
      setHighlightMode(editingRoom.highlightMode ?? 'background');
      setHighlightedUserColors({ ...(editingRoom.highlightedUserColors ?? {}) });
      setHighlightedRoles([...(editingRoom.highlightedRoles ?? [])]);
    } else {
      setName('');
      setSelectedChannels([]);
      setSelectedCategories([]);
      setHighlightedUsers([]);
      setFilteredUsers([]);
      setFilterEnabled(false);
      setRoomColor('');
      setHotkey('');
      setRoomKeywordPatterns([]);
      setHighlightMode('background');
      setHighlightedUserColors({});
      setHighlightedRoles([]);
    }
    setRoleSearch('');
    setSearch('');
    setNewUserId('');
    setNewFilterUser('');
    const initialTab = configModalTab && configModalTab !== 'global' ? configModalTab : 'channels';
    setTab(initialTab);
  }, [editingRoom, configModalOpen, configModalTab]);

  // Role pickers need the role list of every server this room watches.
  const roleGuildIds = [...new Set(
    [...selectedChannels.map((c) => c.guildId), ...selectedCategories.map((c) => c.guildId)]
      .filter((g): g is string => !!g)
  )];
  useEffect(() => {
    if (!configModalOpen) return;
    for (const gId of roleGuildIds) fetchGuildRoles(gId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configModalOpen, roleGuildIds.join(','), fetchGuildRoles]);

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

  const isCategorySelected = (categoryId: string) =>
    selectedCategories.some((c) => c.categoryId === categoryId);

  /**
   * Import or drop a whole category. Importing takes every channel under it,
   * now and later; dropping forgets which of them had been switched off.
   */
  const toggleCategory = (guild: GuildInfo, category: { id: string; name: string }) => {
    setSelectedCategories((prev) =>
      prev.some((c) => c.categoryId === category.id)
        ? prev.filter((c) => c.categoryId !== category.id)
        : [...prev, {
            guildId: guild.id,
            categoryId: category.id,
            guildName: guild.name,
            categoryName: category.name,
            excludedChannelIds: [],
          }]
    );
  };

  /** Switch one channel of an imported category on or off by hand. */
  const setCategoryChannelEnabled = (categoryId: string, channelId: string, enabled: boolean) => {
    setSelectedCategories((prev) =>
      prev.map((c) => {
        if (c.categoryId !== categoryId) return c;
        const excluded = c.excludedChannelIds ?? [];
        return {
          ...c,
          excludedChannelIds: enabled
            ? excluded.filter((id) => id !== channelId)
            : [...new Set([...excluded, channelId])],
        };
      })
    );
    // A channel switched off also loses the individual pick that an embed
    // override promoted it to, or it would stay in the room anyway.
    if (!enabled) setSelectedChannels((prev) => prev.filter((c) => c.channelId !== channelId));
  };

  /** The imported category a channel currently comes into the room through. */
  const coveringCategory = (channelId: string): CategoryRef | undefined =>
    selectedCategories.find((cat) => {
      if ((cat.excludedChannelIds ?? []).includes(channelId)) return false;
      const guild = guilds.find((g) => g.id === cat.guildId);
      return guild?.channels.some((ch) => ch.id === channelId && ch.parentId === cat.categoryId) ?? false;
    });

  /**
   * Per-channel settings live on an individual pick, so turning embeds off for
   * a channel that only belongs through its category promotes it to one --
   * and turning them back on hands it back to the category.
   */
  const toggleChannelEmbeds = (ref: ChannelRef) => {
    const picked = selectedChannels.find((c) => c.channelId === ref.channelId);
    if (!picked) {
      setSelectedChannels((prev) => [...prev, { ...ref, categoryId: undefined, disableEmbeds: true }]);
      return;
    }
    const disable = !picked.disableEmbeds;
    if (!disable && coveringCategory(ref.channelId)) {
      setSelectedChannels((prev) => prev.filter((c) => c.channelId !== ref.channelId));
      return;
    }
    setSelectedChannels((prev) =>
      prev.map((c) => (c.channelId === ref.channelId ? { ...c, disableEmbeds: disable } : c))
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
    setHighlightedUserColors((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
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
        await updateRoom(editingRoom.id, { name, channels: selectedChannels, categories: selectedCategories, highlightedUsers, filteredUsers, filterEnabled, color: roomColor || null, keywordPatterns: roomKeywordPatterns, highlightMode, highlightedUserColors, highlightedRoles, hotkey: hotkey || null });
      } else {
        if (!name.trim()) return;
        const created = await createRoom(name.trim(), selectedChannels, highlightedUsers, roomColor || null, filteredUsers, filterEnabled, selectedCategories);
        // POST /rooms doesn't take highlightedRoles; attach them right after.
        if (created && highlightedRoles.length > 0) {
          await updateRoom(created.id, { highlightedRoles });
        }
      }
      closeConfigModal();
    } finally {
      setSaving(false);
    }
  };

  const activeEnabledGuilds = config?.enabledGuilds ?? [];

  // What the imported categories currently resolve to. Mirrors the server's
  // own expansion, so the modal shows the room exactly as it will run.
  const derivedChannels: ChannelRef[] = (() => {
    const picked = new Set(selectedChannels.map((c) => c.channelId));
    const out: ChannelRef[] = [];
    for (const cat of selectedCategories) {
      const guild = guilds.find((g) => g.id === cat.guildId);
      if (!guild) continue;
      const excluded = new Set(cat.excludedChannelIds ?? []);
      for (const ch of guild.channels) {
        if (ch.parentId !== cat.categoryId || excluded.has(ch.id) || picked.has(ch.id)) continue;
        out.push({
          source: 'discord',
          guildId: guild.id,
          channelId: ch.id,
          guildName: guild.name,
          channelName: ch.name,
          categoryId: cat.categoryId,
        });
      }
    }
    return out;
  })();

  const effectiveChannels: ChannelRef[] = [...selectedChannels, ...derivedChannels];

  const guildNameOf = (gId: string) =>
    guilds.find((g) => g.id === gId)?.name ??
    selectedChannels.find((c) => c.guildId === gId)?.guildName ??
    selectedCategories.find((c) => c.guildId === gId)?.guildName ??
    gId;
  const hiddenRolesCfg = config?.hiddenRoles ?? {};

  // Channels grouped the way Discord shows them: loose channels first, then
  // one block per category. A guild whose payload carried no categories simply
  // renders as one loose block, exactly as before.
  const q = search.trim().toLowerCase();
  const filteredGuilds = guilds
    .filter((g) => activeEnabledGuilds.includes(g.id))
    .map((g) => {
      const categories = [...(g.categories ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      const categoryById = new Map(categories.map((c) => [c.id, c]));
      const guildMatches = !q || g.name.toLowerCase().includes(q);
      const visible = g.channels.filter((c) => {
        if (!q || guildMatches || c.name.toLowerCase().includes(q)) return true;
        const cat = c.parentId ? categoryById.get(c.parentId) : undefined;
        return !!cat && cat.name.toLowerCase().includes(q);
      });

      const groups: { category: { id: string; name: string } | null; channels: GuildInfo['channels'] }[] = [];
      const loose = visible.filter((c) => !c.parentId || !categoryById.has(c.parentId));
      if (loose.length > 0) groups.push({ category: null, channels: loose });
      for (const cat of categories) {
        const channels = visible.filter((c) => c.parentId === cat.id);
        if (channels.length > 0) groups.push({ category: cat, channels });
      }
      return { ...g, groups };
    })
    .filter((g) => g.groups.length > 0);

  const filteredDMs = dmChannels.filter(
    (dm) =>
      !search ||
      dm.recipients.some(
        (r) =>
          r.username.toLowerCase().includes(search.toLowerCase()) ||
          (r.global_name ?? '').toLowerCase().includes(search.toLowerCase())
      )
  );

  const filteredTelegramChats = telegramChats.filter(
    (chat) =>
      !search ||
      chat.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 animate-fade-in" onClick={closeConfigModal}>
      <div
        className="bg-discord-sidebar rounded-t-xl sm:rounded-lg shadow-2xl w-full sm:max-w-2xl h-[90dvh] sm:h-auto sm:max-h-[80vh] flex flex-col animate-pop-in compact:animate-sheet-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-discord-divider shrink-0">
          <h2 className="text-base sm:text-lg font-semibold text-white truncate">
            {editingRoom ? `Edit: ${editingRoom.name}` : 'Create New Room'}
          </h2>
          <button onClick={closeConfigModal} className="text-discord-text-muted hover:text-white shrink-0 p-1">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto border-b border-discord-divider px-4 sm:px-6 shrink-0 scrollbar-none">
          <button
            onClick={() => setTab('channels')}
            className={`px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              tab === 'channels'
                ? 'border-discord-blurple text-white'
                : 'border-transparent text-discord-text-muted hover:text-discord-text'
            }`}
          >
            Channels
          </button>
          <button
            onClick={() => setTab('users')}
            className={`px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              tab === 'users'
                ? 'border-discord-blurple text-white'
                : 'border-transparent text-discord-text-muted hover:text-discord-text'
            }`}
          >
            Highlights
          </button>
          <button
            onClick={() => setTab('roles')}
            className={`px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              tab === 'roles'
                ? 'border-discord-blurple text-white'
                : 'border-transparent text-discord-text-muted hover:text-discord-text'
            }`}
          >
            Roles
          </button>
          <button
            onClick={() => setTab('filter')}
            className={`px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              tab === 'filter'
                ? 'border-discord-blurple text-white'
                : 'border-transparent text-discord-text-muted hover:text-discord-text'
            }`}
          >
            Filter
          </button>
          <button
            onClick={() => setTab('keywords')}
            className={`px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              tab === 'keywords'
                ? 'border-discord-blurple text-white'
                : 'border-transparent text-discord-text-muted hover:text-discord-text'
            }`}
          >
            Keywords
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4" data-form-type="other" data-lpignore="true" data-1p-ignore>
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
                  <ColorPickerWithAlpha
                    value={roomColor || '#313338'}
                    onChange={(c) => setRoomColor(c)}
                    defaultColor="#313338"
                    size="md"
                    showTextInput
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

              {/* Hotkey — physical-keyboard feature, meaningless on the phone */}
              <div className="mb-4 compact:hidden">
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted mb-2">
                  Hotkey
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    readOnly
                    value={hotkey ? hotkey.toUpperCase() : ''}
                    onKeyDown={(e) => {
                      e.preventDefault();
                      if (['Backspace', 'Delete', 'Escape'].includes(e.key)) { setHotkey(''); return; }
                      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) setHotkey(e.key.toLowerCase());
                    }}
                    placeholder="Press a key"
                    className="w-24 bg-discord-dark border-none rounded px-3 py-2 text-sm text-discord-text outline-none focus:ring-2 focus:ring-discord-blurple text-center cursor-pointer caret-transparent"
                  />
                  {hotkey && (
                    <button
                      onClick={() => setHotkey('')}
                      className="text-[11px] text-discord-text-muted hover:text-white"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-discord-text-muted mt-1.5">
                  Press this key anywhere (outside a text field) to jump to this room.
                </p>
              </div>

              {/* Selected count */}
              <div className="text-[11px] text-discord-text-muted mb-3">
                {effectiveChannels.length} channel{effectiveChannels.length !== 1 ? 's' : ''} selected
                {selectedCategories.length > 0 && (
                  <>
                    {' · '}
                    following {selectedCategories.length} categor{selectedCategories.length !== 1 ? 'ies' : 'y'}
                    {derivedChannels.length > 0 && ` (${derivedChannels.length} channel${derivedChannels.length !== 1 ? 's' : ''}, kept in sync)`}
                  </>
                )}
              </div>

              {/* Followed categories */}
              {selectedCategories.length > 0 && (
                <div className="mb-4 border border-discord-divider rounded p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted mb-1.5 flex items-center gap-1.5">
                    <FolderCheck size={12} />
                    Followed categories
                  </div>
                  <p className="text-[11px] text-discord-text-muted mb-2">
                    Channels added to these categories join the room by themselves; channels deleted or
                    moved out of them leave it.
                  </p>
                  <div className="space-y-1.5">
                    {selectedCategories.map((cat) => {
                      const guild = guilds.find((g) => g.id === cat.guildId);
                      const excluded = cat.excludedChannelIds ?? [];
                      const live = guild
                        ? guild.channels.filter((c) => c.parentId === cat.categoryId && !excluded.includes(c.id)).length
                        : null;
                      return (
                        <div key={cat.categoryId} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-discord-dark/50">
                          <div className="min-w-0">
                            <div className="text-sm text-discord-text truncate">
                              {cat.guildName ? `${cat.guildName} / ` : ''}{cat.categoryName ?? cat.categoryId}
                            </div>
                            <div className="text-[10px] text-discord-text-muted">
                              {live === null
                                ? 'Channel list loads once Discord connects'
                                : `${live} channel${live !== 1 ? 's' : ''}`}
                              {excluded.length > 0 && ` · ${excluded.length} switched off`}
                            </div>
                          </div>
                          <button
                            onClick={() => setSelectedCategories((prev) => prev.filter((c) => c.categoryId !== cat.categoryId))}
                            title="Stop following this category"
                            className="shrink-0 p-1 rounded text-discord-text-muted hover:text-discord-red hover:bg-discord-hover/50 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Per-channel embed settings */}
              {effectiveChannels.length > 0 && (
                <div className="mb-4 border border-discord-divider rounded p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted mb-2">
                    Embeds per channel
                  </div>
                  <div className="space-y-1.5">
                    {effectiveChannels.map((ch) => (
                      <div key={ch.channelId} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-discord-dark/50">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {ch.source === 'telegram'
                            ? <Send size={12} className="shrink-0 text-[#2AABEE]" />
                            : ch.guildId
                              ? <Hash size={12} className="shrink-0 text-discord-channel-icon" />
                              : <MessageCircle size={12} className="shrink-0 text-discord-channel-icon" />
                          }
                          <span className="text-sm text-discord-text truncate">
                            {ch.guildName ? `${ch.guildName} / ` : ''}{ch.channelName ?? ch.channelId}
                          </span>
                        </div>
                        <button
                          onClick={() => toggleChannelEmbeds(ch)}
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

              {/* Guild message colors */}
              {(() => {
                const roomGuildIds = [...new Set(effectiveChannels.map((c) => c.guildId).filter(Boolean))] as string[];
                if (roomGuildIds.length === 0) return null;
                const guildColors = config?.guildColors ?? {};
                return (
                  <div className="mb-4 border border-discord-divider rounded p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted mb-2 flex items-center gap-1.5">
                      <Palette size={12} />
                      Guild Message Colors
                    </div>
                    <p className="text-xs text-discord-text-muted mb-2">
                      Color-code messages by server. Changes apply globally.
                    </p>
                    <div className="space-y-1.5">
                      {roomGuildIds.map((guildId) => {
                        const guildName = effectiveChannels.find((c) => c.guildId === guildId)?.guildName
                          ?? guilds.find((g) => g.id === guildId)?.name
                          ?? guildId;
                        return (
                          <div key={guildId} className="flex items-center gap-2.5 px-2 py-1.5 rounded bg-discord-dark/50">
                            <ColorPickerWithAlpha
                              value={guildColors[guildId] || '#313338'}
                              onChange={(c) => updateConfig({ guildColors: { ...guildColors, [guildId]: c } })}
                              defaultColor="#313338"
                            />
                            <span className="text-sm text-discord-text flex-1 truncate">{guildName}</span>
                            {guildColors[guildId] && (
                              <button
                                onClick={() => {
                                  const { [guildId]: _, ...rest } = guildColors;
                                  updateConfig({ guildColors: rest });
                                }}
                                className="text-discord-text-muted hover:text-white shrink-0"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Channel message colors (override the guild color) */}
              {(() => {
                const roomGuildChannels = effectiveChannels.filter((c) => c.guildId && c.source !== 'telegram');
                if (roomGuildChannels.length === 0) return null;
                const guildColors = config?.guildColors ?? {};
                const channelColors = config?.channelColors ?? {};
                return (
                  <div className="mb-4 border border-discord-divider rounded p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted mb-2 flex items-center gap-1.5">
                      <Palette size={12} />
                      Channel Message Colors
                    </div>
                    <p className="text-xs text-discord-text-muted mb-2">
                      Give a channel its own color, overriding its guild color. Channels without their own
                      color follow the guild color. Changes apply globally.
                    </p>
                    <div className="space-y-1.5">
                      {roomGuildChannels.map((ch) => (
                        <div key={ch.channelId} className="flex items-center gap-2.5 px-2 py-1.5 rounded bg-discord-dark/50">
                          <ColorPickerWithAlpha
                            value={channelColors[ch.channelId] || guildColors[ch.guildId!] || '#313338'}
                            onChange={(c) => updateConfig({ channelColors: { ...channelColors, [ch.channelId]: c } })}
                            defaultColor={guildColors[ch.guildId!] || '#313338'}
                          />
                          <span className="text-sm text-discord-text flex-1 truncate">
                            {ch.guildName ? `${ch.guildName} / ` : ''}{ch.channelName ?? ch.channelId}
                          </span>
                          <span
                            className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded ${
                              channelColors[ch.channelId]
                                ? 'bg-discord-blurple/20 text-discord-blurple'
                                : 'bg-discord-dark text-discord-text-muted'
                            }`}
                          >
                            {channelColors[ch.channelId] ? 'CUSTOM' : 'GUILD COLOR'}
                          </span>
                          {channelColors[ch.channelId] && (
                            <button
                              onClick={() => {
                                const { [ch.channelId]: _, ...rest } = channelColors;
                                updateConfig({ channelColors: rest });
                              }}
                              className="text-discord-text-muted hover:text-white shrink-0"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* DM message colors */}
              {(() => {
                const roomDmChannelIds = selectedChannels.filter((c) => !c.guildId && c.source !== 'telegram').map((c) => c.channelId);
                if (roomDmChannelIds.length === 0) return null;
                const dmColors = config?.dmColors ?? {};
                return (
                  <div className="mb-4 border border-discord-divider rounded p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted mb-2 flex items-center gap-1.5">
                      <Palette size={12} />
                      DM Message Colors
                    </div>
                    <p className="text-xs text-discord-text-muted mb-2">
                      Color-code messages by DM. Changes apply globally.
                    </p>
                    <div className="space-y-1.5">
                      {roomDmChannelIds.map((channelId) => {
                        const dm = dmChannels.find((d) => d.id === channelId);
                        const dmName = dm
                          ? dm.recipients.map((r) => r.global_name || r.username).join(', ')
                          : selectedChannels.find((c) => c.channelId === channelId)?.channelName ?? channelId;
                        return (
                          <div key={channelId} className="flex items-center gap-2.5 px-2 py-1.5 rounded bg-discord-dark/50">
                            <ColorPickerWithAlpha
                              value={dmColors[channelId] || '#313338'}
                              onChange={(c) => updateConfig({ dmColors: { ...dmColors, [channelId]: c } })}
                              defaultColor="#313338"
                            />
                            <span className="text-sm text-discord-text flex-1 truncate">{dmName}</span>
                            {dmColors[channelId] && (
                              <button
                                onClick={() => {
                                  const { [channelId]: _, ...rest } = dmColors;
                                  updateConfig({ dmColors: rest });
                                }}
                                className="text-discord-text-muted hover:text-white shrink-0"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Telegram chat colors */}
              {(() => {
                const roomTgChannelIds = [...new Set(
                  selectedChannels.filter((c) => c.source === 'telegram').map((c) => c.channelId)
                )];
                if (roomTgChannelIds.length === 0) return null;
                const telegramColors = config?.telegramColors ?? {};
                return (
                  <div className="mb-4 border border-discord-divider rounded p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted mb-2 flex items-center gap-1.5">
                      <Send size={12} className="text-[#2AABEE]" />
                      Telegram Chat Colors
                    </div>
                    <p className="text-xs text-discord-text-muted mb-2">
                      Color-code messages by Telegram chat. Changes apply globally.
                    </p>
                    <div className="space-y-1.5">
                      {roomTgChannelIds.map((channelId) => {
                        const chatName = selectedChannels.find((c) => c.channelId === channelId)?.channelName ?? channelId;
                        return (
                          <div key={channelId} className="flex items-center gap-2.5 px-2 py-1.5 rounded bg-discord-dark/50">
                            <ColorPickerWithAlpha
                              value={telegramColors[channelId] || '#313338'}
                              onChange={(c) => updateConfig({ telegramColors: { ...telegramColors, [channelId]: c } })}
                              defaultColor="#313338"
                            />
                            <span className="text-sm text-discord-text flex-1 truncate">{chatName}</span>
                            {telegramColors[channelId] && (
                              <button
                                onClick={() => {
                                  const { [channelId]: _, ...rest } = telegramColors;
                                  updateConfig({ telegramColors: rest });
                                }}
                                className="text-discord-text-muted hover:text-white shrink-0"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Platform toggle */}
              {(authStatus?.telegramConnected || authStatus?.telegramConfigured || telegramChats.length > 0) && (
                <div className="flex rounded-lg bg-discord-dark p-0.5 mb-3">
                  <button
                    onClick={() => setPlatformTab('discord')}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                      platformTab === 'discord'
                        ? 'bg-discord-blurple text-white'
                        : 'text-discord-text-muted hover:text-discord-text'
                    }`}
                  >
                    <Hash size={12} />
                    Discord
                  </button>
                  <button
                    onClick={() => setPlatformTab('telegram')}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                      platformTab === 'telegram'
                        ? 'bg-[#2AABEE] text-white'
                        : 'text-discord-text-muted hover:text-discord-text'
                    }`}
                  >
                    <Send size={12} />
                    Telegram
                  </button>
                </div>
              )}

              {/* Search */}
              <div className="relative mb-4">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-discord-text-muted" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={platformTab === 'telegram' ? 'Search Telegram chats...' : 'Search Discord channels...'}
                  className="w-full bg-discord-dark border-none rounded px-3 py-2 pl-9 text-sm text-discord-text outline-none focus:ring-2 focus:ring-discord-blurple"
                />
              </div>

              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {/* Discord section */}
                {platformTab === 'discord' && (
                  <>
                    {(filteredGuilds.length > 0 || filteredDMs.length > 0) ? (
                      <div className="space-y-3">
                        {filteredGuilds.map((guild) => (
                          <div key={guild.id}>
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted mb-1 flex items-center gap-1.5">
                              <Users size={12} />
                              {guild.name}
                            </div>
                            <div className="space-y-2 ml-2">
                              {guild.groups.map((group) => {
                                const category = group.category;
                                const imported = category
                                  ? selectedCategories.find((c) => c.categoryId === category.id)
                                  : undefined;
                                return (
                                  <div key={category?.id ?? 'uncategorized'}>
                                    {category && (
                                      <div className="flex items-center gap-1.5 mb-0.5">
                                        <span className="text-[10px] font-semibold uppercase tracking-wide text-discord-text-muted truncate">
                                          {category.name}
                                        </span>
                                        <button
                                          onClick={() => toggleCategory(guild, category)}
                                          title={
                                            imported
                                              ? 'Stop following this category'
                                              : 'Add every channel in this category, including ones added later'
                                          }
                                          className={`ml-auto shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                                            imported
                                              ? 'bg-discord-blurple/20 text-discord-blurple hover:bg-discord-blurple/30'
                                              : 'text-discord-text-muted hover:bg-discord-hover/50 hover:text-discord-text'
                                          }`}
                                        >
                                          {imported ? <FolderCheck size={11} /> : <FolderPlus size={11} />}
                                          {imported ? 'FOLLOWING' : 'ADD CATEGORY'}
                                        </button>
                                      </div>
                                    )}
                                    <div className="space-y-0.5">
                                      {group.channels.map((ch) => {
                                        const picked = isChannelSelected(ch.id);
                                        const excluded = !!imported && (imported.excludedChannelIds ?? []).includes(ch.id);
                                        const fromCategory = !!imported && !excluded && !picked;
                                        return (
                                          <button
                                            key={ch.id}
                                            onClick={() => {
                                              // Inside a followed category the click switches the
                                              // channel off or back on; elsewhere it is a plain pick.
                                              if (imported) {
                                                setCategoryChannelEnabled(imported.categoryId, ch.id, excluded);
                                              } else {
                                                toggleChannel({
                                                  guildId: guild.id,
                                                  channelId: ch.id,
                                                  guildName: guild.name,
                                                  channelName: ch.name,
                                                });
                                              }
                                            }}
                                            className={`w-full flex items-center gap-2 px-2 py-1 rounded text-sm text-left transition-colors ${
                                              picked || fromCategory
                                                ? 'bg-discord-blurple/20 text-discord-blurple'
                                                : excluded
                                                  ? 'text-discord-text-muted/60 line-through hover:bg-discord-hover/50'
                                                  : 'text-discord-channel-icon hover:bg-discord-hover/50 hover:text-discord-text'
                                            }`}
                                          >
                                            <Hash size={14} />
                                            <span className="truncate">{ch.name}</span>
                                            {picked ? (
                                              <span className="ml-auto text-[10px]">ADDED</span>
                                            ) : fromCategory ? (
                                              <span className="ml-auto text-[10px]">CATEGORY</span>
                                            ) : excluded ? (
                                              <span className="ml-auto text-[10px]">OFF</span>
                                            ) : null}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}

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
                      </div>
                    ) : (
                      <p className="text-sm text-discord-text-muted text-center py-4">
                        {guilds.length === 0 ? 'Loading Discord channels...' : 'No Discord channels match your search.'}
                      </p>
                    )}
                  </>
                )}

                {/* Telegram section */}
                {platformTab === 'telegram' && (
                  <>
                    {filteredTelegramChats.length > 0 ? (
                      <div className="space-y-0.5">
                        {filteredTelegramChats.map((chat) => {
                          const selected = isChannelSelected(chat.id);
                          const typeLabel = chat.isBot
                            ? 'BOT'
                            : chat.type === 'channel'
                              ? 'CH'
                              : chat.type === 'supergroup'
                                ? 'SG'
                                : chat.type === 'group'
                                  ? 'GP'
                                  : '';
                          return (
                            <button
                              key={chat.id}
                              onClick={() =>
                                toggleChannel({
                                  source: 'telegram',
                                  guildId: null,
                                  channelId: chat.id,
                                  guildName: chat.type !== 'user' ? chat.title : undefined,
                                  channelName: chat.title,
                                })
                              }
                              className={`w-full flex items-center gap-2 px-2 py-1 rounded text-sm text-left transition-colors ${
                                selected
                                  ? 'bg-[#2AABEE]/20 text-[#2AABEE]'
                                  : 'text-discord-channel-icon hover:bg-discord-hover/50 hover:text-discord-text'
                              }`}
                            >
                              <Send size={14} />
                              <span className="truncate">{chat.title}</span>
                              {typeLabel && (
                                <span className="text-[9px] px-1 py-0.5 rounded bg-discord-dark/50 text-discord-text-muted shrink-0">{typeLabel}</span>
                              )}
                              {selected && <span className="ml-auto text-[10px]">ADDED</span>}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-discord-text-muted text-center py-4">
                        {telegramChats.length === 0 ? 'No Telegram chats available. Connect Telegram in Settings.' : 'No Telegram chats match your search.'}
                      </p>
                    )}
                  </>
                )}
              </div>
            </>
          )}

          {tab === 'users' && (
            <>
              <p className="text-sm text-discord-text-muted mb-4">
                Add user IDs or Telegram @usernames to highlight in this room. Their messages will be
                visually highlighted and you'll get alerts when they send messages.
              </p>

              <div className="mb-4">
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted mb-2">
                  Highlight Style
                </label>
                <div className="flex rounded overflow-hidden border border-discord-divider">
                  <button
                    onClick={() => setHighlightMode('background')}
                    className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                      highlightMode === 'background'
                        ? 'bg-discord-blurple text-white'
                        : 'bg-discord-dark text-discord-text-muted hover:text-discord-text'
                    }`}
                  >
                    Background
                  </button>
                  <button
                    onClick={() => setHighlightMode('username')}
                    className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                      highlightMode === 'username'
                        ? 'bg-discord-blurple text-white'
                        : 'bg-discord-dark text-discord-text-muted hover:text-discord-text'
                    }`}
                  >
                    Username Color
                  </button>
                </div>
                <p className="text-xs text-discord-text-muted mt-1.5">
                  {highlightMode === 'background'
                    ? 'Highlighted messages get a colored background and left border.'
                    : 'Only the username is colored (like a Discord role) — no background change.'}
                </p>
              </div>

              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addHighlightedUser()}
                  placeholder="Discord User ID or @telegram_username"
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
                {highlightedUsers.map((uid) => {
                  const isTgUser = uid.startsWith('@');
                  return (
                  <div
                    key={uid}
                    className="flex flex-wrap items-center justify-between gap-y-2.5 px-3 py-2 compact:py-3 bg-discord-dark rounded"
                  >
                    {/* On phones the color/opacity controls wrap onto their own
                        full-width line — inline they overlap the username. */}
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {isTgUser && <Send size={12} className="text-[#2AABEE] shrink-0" />}
                      <span className={`text-sm ${isTgUser ? 'text-[#2AABEE]' : 'font-mono'} truncate`} style={isTgUser ? undefined : { color: highlightedUserColors[uid] || '#f2f3f5' }}>{uid}</span>
                      {!isTgUser && userNameMap.has(uid) && (
                        <span className="text-[11px] compact:text-xs text-discord-text-muted truncate">{userNameMap.get(uid)}</span>
                      )}
                    </div>
                    <button
                      onClick={() => removeHighlightedUser(uid)}
                      className="text-discord-text-muted hover:text-discord-red shrink-0 order-2 compact:p-1.5 compact:-m-1.5 ml-2"
                    >
                      <Trash2 size={14} className="compact:w-4 compact:h-4" />
                    </button>
                    <div className="flex items-center gap-2 shrink-0 order-1 compact:order-3 compact:w-full">
                      <ColorPickerWithAlpha
                        value={highlightedUserColors[uid] || '#5865f2'}
                        onChange={(c) => setHighlightedUserColors((prev) => ({ ...prev, [uid]: c }))}
                        defaultColor="#5865f2"
                        className="compact:flex-1"
                      />
                      {highlightedUserColors[uid] && (
                        <button
                          onClick={() => setHighlightedUserColors((prev) => { const next = { ...prev }; delete next[uid]; return next; })}
                          className="text-[10px] compact:text-xs text-discord-text-muted hover:text-discord-text shrink-0"
                          title="Reset to default"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            </>
          )}

          {tab === 'roles' && (
            <>
              <p className="text-sm text-discord-text-muted mb-4">
                Highlight or mute entire server roles. Highlighting works like highlighted
                users — messages from anyone holding the role light up and alert (saved with
                the room). Muting hides everyone with the role and applies server-wide,
                immediately.
              </p>

              {roleGuildIds.length === 0 ? (
                <p className="text-sm text-discord-text-muted text-center py-6">
                  Add Discord channels to this room first — roles are listed per server.
                </p>
              ) : (
                <>
                  {highlightedRoles.length > 0 && (
                    <div className="mb-4">
                      <label className="block text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted mb-2">
                        Highlighted Roles
                      </label>
                      <div className="space-y-1">
                        {highlightedRoles.map((hr) => (
                          <div
                            key={hr.roleId}
                            className="flex flex-wrap items-center justify-between gap-y-2.5 px-3 py-2 compact:py-3 bg-discord-dark rounded"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <Star size={12} className="shrink-0 text-discord-yellow" />
                              <span className="text-sm truncate" style={{ color: hr.color || '#f2f3f5' }}>{hr.roleName}</span>
                              <span className="text-[11px] text-discord-text-muted truncate">{guildNameOf(hr.guildId)}</span>
                            </div>
                            <button
                              onClick={() => setHighlightedRoles((prev) => prev.filter((r) => r.roleId !== hr.roleId))}
                              className="text-discord-text-muted hover:text-discord-red shrink-0 order-2 compact:p-1.5 compact:-m-1.5 ml-2"
                            >
                              <Trash2 size={14} className="compact:w-4 compact:h-4" />
                            </button>
                            <div className="flex items-center gap-2 shrink-0 order-1 compact:order-3 compact:w-full">
                              <ColorPickerWithAlpha
                                value={hr.color || '#5865f2'}
                                onChange={(c) => setHighlightedRoles((prev) => prev.map((r) => r.roleId === hr.roleId ? { ...r, color: c } : r))}
                                defaultColor="#5865f2"
                                className="compact:flex-1"
                              />
                              {hr.color && (
                                <button
                                  onClick={() => setHighlightedRoles((prev) => prev.map((r) => r.roleId === hr.roleId ? { ...r, color: undefined } : r))}
                                  className="text-[10px] compact:text-xs text-discord-text-muted hover:text-discord-text shrink-0"
                                  title="Reset to default"
                                >
                                  Reset
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {roleGuildIds.some((gId) => (hiddenRolesCfg[gId] ?? []).length > 0) && (
                    <div className="mb-4">
                      <label className="block text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted mb-2">
                        Muted Roles (server-wide)
                      </label>
                      <div className="space-y-1">
                        {roleGuildIds.flatMap((gId) =>
                          (hiddenRolesCfg[gId] ?? []).map((entry) => (
                            <div
                              key={`${gId}:${entry.roleId}`}
                              className="flex items-center justify-between gap-2 px-3 py-2 bg-discord-dark rounded"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <EyeOff size={12} className="shrink-0 text-discord-red/70" />
                                <span className="text-sm text-white truncate">{entry.roleName}</span>
                                <span className="text-[11px] text-discord-text-muted truncate">{guildNameOf(gId)}</span>
                              </div>
                              <button
                                onClick={() => unhideRole(gId, entry.roleId)}
                                className="text-discord-text-muted hover:text-discord-red shrink-0"
                                title="Unmute role"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-discord-text-muted mb-2">
                    Server Roles
                  </label>
                  <div className="relative mb-3">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-discord-text-muted" />
                    <input
                      type="text"
                      value={roleSearch}
                      onChange={(e) => setRoleSearch(e.target.value)}
                      placeholder="Search roles..."
                      className="w-full bg-discord-dark border-none rounded pl-8 pr-3 py-2 text-sm text-discord-text outline-none focus:ring-2 focus:ring-discord-blurple"
                      autoComplete="off"
                      data-1p-ignore
                      data-lpignore="true"
                      data-form-type="other"
                    />
                  </div>
                  {roleGuildIds.map((gId) => {
                    const roles = (guildRoles[gId] ?? []).filter(
                      (r) => !roleSearch || r.name.toLowerCase().includes(roleSearch.toLowerCase())
                    );
                    return (
                      <div key={gId} className="mb-3">
                        {roleGuildIds.length > 1 && (
                          <div className="text-xs font-semibold text-discord-text-muted mb-1.5">{guildNameOf(gId)}</div>
                        )}
                        {roles.length === 0 ? (
                          <p className="text-sm text-discord-text-muted py-2">
                            {(guildRoles[gId] ?? []).length === 0
                              ? 'No roles available for this server yet.'
                              : 'No roles match your search.'}
                          </p>
                        ) : (
                          <div className="space-y-0.5 max-h-[260px] overflow-y-auto pr-1">
                            {roles.map((role) => {
                              const isHl = highlightedRoles.some((r) => r.roleId === role.id);
                              const isMuted = (hiddenRolesCfg[gId] ?? []).some((r) => r.roleId === role.id);
                              return (
                                <div
                                  key={role.id}
                                  className="flex items-center justify-between gap-2 px-3 py-1.5 rounded hover:bg-discord-dark/60"
                                >
                                  <span className="text-sm truncate" style={{ color: role.color ?? '#f2f3f5' }}>{role.name}</span>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      onClick={() =>
                                        isHl
                                          ? setHighlightedRoles((prev) => prev.filter((r) => r.roleId !== role.id))
                                          : setHighlightedRoles((prev) => [...prev, { roleId: role.id, roleName: role.name, guildId: gId }])
                                      }
                                      className={`p-1.5 rounded transition-colors ${isHl ? 'text-discord-yellow bg-discord-yellow/10' : 'text-discord-text-muted hover:text-discord-yellow'}`}
                                      title={isHl ? 'Remove highlight' : 'Highlight role'}
                                    >
                                      <Star size={14} />
                                    </button>
                                    <button
                                      onClick={() => (isMuted ? unhideRole(gId, role.id) : hideRole(gId, role.id, role.name))}
                                      className={`p-1.5 rounded transition-colors ${isMuted ? 'text-discord-red bg-discord-red/10' : 'text-discord-text-muted hover:text-discord-red'}`}
                                      title={isMuted ? 'Unmute role' : 'Mute role (server-wide)'}
                                    >
                                      <EyeOff size={14} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
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
              {/* Global keyword alerts toggle */}
              <div className={`mb-4 rounded-lg p-3 ${config?.keywordAlertsEnabled ? 'bg-discord-dark/50' : 'bg-discord-red/10 border border-discord-red/20'}`}>
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${
                      config?.keywordAlertsEnabled ? 'bg-discord-green' : 'bg-discord-input'
                    }`}
                    onClick={async () => {
                      await updateConfig({ keywordAlertsEnabled: !(config?.keywordAlertsEnabled ?? true) });
                    }}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                        config?.keywordAlertsEnabled ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </div>
                  <span className="text-sm text-discord-text">
                    Keyword alerts {config?.keywordAlertsEnabled ? 'enabled' : 'disabled'}
                  </span>
                </label>
                {!config?.keywordAlertsEnabled && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-discord-red">
                    <AlertTriangle size={12} />
                    <span>Keyword matching is disabled globally. Room keywords won't trigger until enabled.</span>
                  </div>
                )}
              </div>

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
        <div className="flex items-center justify-end gap-3 px-4 sm:px-6 py-3 sm:py-4 border-t border-discord-divider shrink-0 compact:pb-[calc(0.75rem+var(--safe-bottom))]">
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
