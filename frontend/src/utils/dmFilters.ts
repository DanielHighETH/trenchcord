// Matching for the All DMs exclusion and hidden-conversation lists. Entries
// are user IDs or names — leading @ and case ignored — the same values the
// settings screen takes; mirrors the backend matchers in index.ts. A list is
// checked against several people at once because a conversation has two
// halves: the author covers incoming messages, the conversation partner
// (Discord recipients / the Telegram chat) covers outgoing ones, where the
// author is you rather than the person the entry names.

export interface DmMatchPerson {
  id?: string | null;
  names: (string | null | undefined)[];
}

const entryMatches = (entry: string, person: DmMatchPerson): boolean => {
  const e = entry.trim();
  if (!e) return false;
  if (person.id && e === person.id) return true;
  const wanted = (e.startsWith('@') ? e.slice(1) : e).toLowerCase();
  return person.names.some((n) => !!n && n.toLowerCase() === wanted);
};

export const dmListMatches = (list: string[], people: DmMatchPerson[]): boolean =>
  list.length > 0 && list.some((entry) => people.some((p) => entryMatches(entry, p)));
