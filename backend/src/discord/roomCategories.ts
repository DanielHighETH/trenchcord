import type { ChannelRef, GuildInfo, Room } from './types.js';

/**
 * Rooms can watch a whole Discord category instead of listing its channels.
 * Nothing is materialised: the channel list is resolved from the gateway's
 * live guild data every time it is read, so a channel created, deleted or
 * moved in Discord shows up in the room without any stored state changing.
 * Only the user's own opt-outs (CategoryRef.excludedChannelIds) persist.
 */

/**
 * Where an incoming message sits, for matching against watched categories.
 * `channelId` is what the exclusion list is keyed by -- for a thread that is
 * its parent channel, since categories hold channels, not threads.
 */
export interface CategoryMatch {
  categoryId: string;
  channelId: string;
}

export function roomWatchesChannel(
  room: Room,
  channelId: string,
  category?: CategoryMatch | null,
): boolean {
  if (room.channels.some((c) => c.channelId === channelId)) return true;
  if (!category) return false;
  return (room.categories ?? []).some(
    (cat) =>
      cat.categoryId === category.categoryId &&
      !(cat.excludedChannelIds ?? []).includes(category.channelId),
  );
}

/**
 * The channels a room's watched categories currently resolve to. Channels the
 * room already picks individually are left out -- an explicit pick carries its
 * own settings (embeds, colors) and wins.
 */
export function resolveCategoryChannels(room: Room, guilds: GuildInfo[]): ChannelRef[] {
  const categories = room.categories ?? [];
  if (categories.length === 0 || guilds.length === 0) return [];

  const explicit = new Set(room.channels.map((c) => c.channelId));
  const guildById = new Map(guilds.map((g) => [g.id, g]));
  const seen = new Set<string>();
  const derived: ChannelRef[] = [];

  for (const cat of categories) {
    const guild = guildById.get(cat.guildId);
    if (!guild) continue;
    const excluded = new Set(cat.excludedChannelIds ?? []);
    for (const ch of guild.channels) {
      if (ch.parentId !== cat.categoryId) continue;
      if (excluded.has(ch.id) || explicit.has(ch.id) || seen.has(ch.id)) continue;
      seen.add(ch.id);
      derived.push({
        source: 'discord',
        guildId: guild.id,
        channelId: ch.id,
        guildName: guild.name,
        channelName: ch.name,
        categoryId: cat.categoryId,
      });
    }
  }
  return derived;
}

/** A copy of the room with its category channels folded into `channels`. */
export function expandRoomChannels(room: Room, guilds: GuildInfo[]): Room {
  const derived = resolveCategoryChannels(room, guilds);
  if (derived.length === 0) return room;
  return { ...room, channels: [...room.channels, ...derived] };
}

/**
 * Drop category-derived refs before storing. Clients get rooms with their
 * category channels folded in, and would otherwise hand them straight back as
 * individual picks on the next save -- freezing the list they were meant to
 * follow.
 */
export function stripDerivedChannels(channels: ChannelRef[]): ChannelRef[] {
  return channels.filter((c) => !c.categoryId);
}
