import type { FrontendMessage, MessageComponent } from '../types';

const EVM_ADDR_RE = /\b0x[a-fA-F0-9]{40}\b/g;
const SOL_ADDR_RE = /(?<![1-9A-HJ-NP-Za-km-z])[1-9A-HJ-NP-Za-km-z]{40,48}(?![1-9A-HJ-NP-Za-km-z])/g;
const URL_RE = /https?:\/\/[^\s<>)\]"']+/g;
const MD_LINK_RE = /\[([^\]\n]{1,120})\]\((https?:\/\/[^)\s]+)\)/g;

// URL paths that name a person, a transaction or a block rather than a token:
// pump.fun/profile/<wallet>, solscan.io/account/<wallet>, .../tx/<sig>. Caller
// bots link these beside the token they are posting about, so mining every URL
// without this would grow buy buttons under the wallets that called a coin.
const NON_TOKEN_PATH_RE = /\/(?:profile|profiles|user|users|account|accounts|wallet|wallets|holder|holders|trader|traders|portfolio|tx|txs|transaction|transactions|block|blocks|validator|stake)\//i;

/** Link texts that name the destination, not a token: "[Chart](...)". */
const NON_TOKEN_LABELS = new Set([
  'chart', 'charts', 'buy', 'sell', 'trade', 'swap', 'dex', 'dexscreener', 'dextools',
  'pump', 'pumpfun', 'birdeye', 'solscan', 'photon', 'bullx', 'axiom', 'gmgn', 'jup',
  'jupiter', 'trojan', 'bonkbot', 'maestro', 'nova', 'website', 'site', 'web', 'twitter',
  'x', 'tg', 'telegram', 'discord', 'link', 'links', 'here', 'click', 'open', 'view',
  'more', 'info', 'details', 'refresh', 'ca', 'contract', 'address', 'mint', 'profile',
  'wallet', 'holders', 'bubblemaps', 'rugcheck', 'tweetscout', 'snipe', 'sniper', 'copy',
  'source', 'chartlink', 'quickbuy', 'pf',
]);

/** Longest link text still readable as a token name in a buy row. */
const MAX_LABEL_LEN = 24;

/** Addresses in a blob of text, taking it exactly as given. */
function scanAddresses(text: string): string[] {
  const addrs: string[] = [];
  const evm = text.match(EVM_ADDR_RE);
  if (evm) addrs.push(...evm);
  const sol = text.match(SOL_ADDR_RE);
  if (sol) {
    for (const m of sol) {
      if (!addrs.includes(m) && /\d/.test(m) && /[a-z]/.test(m) && /[A-Z]/.test(m)) {
        addrs.push(m);
      }
    }
  }
  return addrs;
}

/**
 * Find contract addresses in a blob of text.
 *
 * Mirrors the backend detector in utils/contract.ts, but runs client-side so it
 * can also cover text the backend never scans (embeds).
 */
export function detectAddresses(text: string): string[] {
  // Strip URLs so we don't detect addresses embedded in links
  const stripped = text
    .replace(URL_RE, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  return scanAddresses(stripped);
}

/** A token a buy row can be built for, with the name it was linked under. */
export interface TradeTarget {
  address: string;
  /** Link text the address came from ("MomoCoin"), when it reads like a token
   * name rather than "Chart"/"Buy" boilerplate. */
  label?: string;
}

/** The token name a markdown link was written under, or nothing usable. */
function cleanLinkLabel(raw: string): string | undefined {
  const label = raw
    // Custom Discord emoji and the bold/italic/code marks around a ticker.
    .replace(/<a?:\w+:\d+>/g, ' ')
    .replace(/[*_~`|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!label || label.length > MAX_LABEL_LEN) return undefined;
  // A truncated address ("488SaF...pump") says nothing the pill doesn't.
  if (label.includes('…') || label.includes('...')) return undefined;
  if (/[1-9A-HJ-NP-Za-km-z]{20,}/.test(label)) return undefined;
  const key = label.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!key || NON_TOKEN_LABELS.has(key)) return undefined;
  return label;
}

/**
 * Addresses that only exist inside links -- `[MOMO](https://pump.fun/coin/<mint>)`
 * and its bare-URL form.
 *
 * Caller bots and command bots routinely name a token exclusively as a link:
 * Bark's callout lists, for one, put every token behind a pump.fun URL, so a
 * message about six tokens carries no address in its text at all. Person and
 * transaction URLs are skipped (NON_TOKEN_PATH_RE), and anything that slips
 * through is still filtered by the on-chain mint check before a button renders.
 */
function detectLinkedAddresses(text: string): TradeTarget[] {
  const out: TradeTarget[] = [];
  const push = (url: string, label?: string) => {
    if (NON_TOKEN_PATH_RE.test(url)) return;
    // Split on everything base58 can't contain, so a path segment or query
    // value is scanned on its own instead of running into its neighbours.
    for (const addr of scanAddresses(url.replace(/[^1-9A-HJ-NP-Za-km-z]+/g, ' '))) {
      out.push(label ? { address: addr, label } : { address: addr });
    }
  };

  const linked = new Set<string>();
  for (const match of text.matchAll(MD_LINK_RE)) {
    linked.add(match[2]);
    push(match[2], cleanLinkLabel(match[1]));
  }
  for (const url of text.match(URL_RE) ?? []) {
    if (!linked.has(url)) push(url);
  }
  return out;
}

/**
 * Every token a message points at, in the order a buy row should offer them:
 * addresses written out in its text first, then ones that only exist inside a
 * link.
 *
 * The backend only scans `content` (utils/contract.ts), so caller bots that put
 * the contract exclusively in an embed -- Rick being the common case -- produce
 * an empty `message.contractAddresses`. Command bots go one further and name
 * every token only as a link, which is what the second pass is for: a Bark
 * callout list mentions six tokens and writes out none of them. Text hits come
 * first so the leading buy row matches the pills rendered in the message body.
 */
export function collectTradeTargets(message: FrontendMessage): TradeTarget[] {
  const targets = new Map<string, TradeTarget>();

  const add = (addr: string, label?: string) => {
    if (addr.startsWith('0x')) return;
    const existing = targets.get(addr);
    if (existing) {
      if (label && !existing.label) existing.label = label;
      return;
    }
    targets.set(addr, label ? { address: addr, label } : { address: addr });
  };

  // Every place a message can keep text: the body, its embeds, a Components v2
  // tree, and a forwarded snapshot's version of all three. The body is scanned
  // here too rather than trusted to `contractAddresses`, which is empty when
  // contract detection is switched off -- the buy row has always ignored that
  // setting for embeds.
  const blobs: string[] = [];
  const pushEmbeds = (embeds?: FrontendMessage['embeds']) => {
    for (const embed of embeds ?? []) {
      const parts: (string | undefined)[] = [embed.title, embed.description, embed.author?.name, embed.footer?.text];
      for (const field of embed.fields ?? []) parts.push(field.name, field.value);
      const text = parts.filter(Boolean).join('\n');
      if (text) blobs.push(text);
    }
  };

  if (message.content) blobs.push(message.content);
  pushEmbeds(message.embeds);
  const componentText = collectComponentText(message.components);
  if (componentText) blobs.push(componentText);

  // Discord-forwarded body: the outer message is empty, the CA lives in the
  // snapshot's content/embeds/components.
  const fwd = message.forwardedMessage;
  if (fwd) {
    if (fwd.content) blobs.push(fwd.content);
    pushEmbeds(fwd.embeds);
    const fwdComponentText = collectComponentText(fwd.components);
    if (fwdComponentText) blobs.push(fwdComponentText);
  }

  for (const addr of message.contractAddresses ?? []) add(addr);
  for (const blob of blobs) detectAddresses(blob).forEach((addr) => add(addr));

  // Links only get to name a token when nothing in the text did. A scanner bot
  // writes the mint it scanned out in full and then links a handful of *other*
  // tokens beside it -- Rick's "$CLIP · $CCM" row is tokens it compares
  // against, not things to buy -- so once the message has written an address
  // out, the links are read for their labels alone.
  const namedInText = targets.size > 0;
  for (const blob of blobs) {
    for (const target of detectLinkedAddresses(blob)) {
      if (namedInText && !targets.has(target.address)) continue;
      add(target.address, target.label);
    }
  }

  return [...targets.values()];
}

/** Just the addresses -- see collectTradeTargets for what is scanned. */
export function collectSolAddresses(message: FrontendMessage): string[] {
  return collectTradeTargets(message).map((t) => t.address);
}

/**
 * Text to show for a message wherever `content` alone is previewed or
 * searched (toasts, desktop notifications, pane search): falls back to
 * Components v2 text and Discord-forwarded snapshot text, both of which
 * leave `content` empty.
 */
export function messageFallbackText(message: FrontendMessage): string {
  if (message.content) return message.content;
  return [
    collectComponentText(message.components),
    message.forwardedMessage?.content,
    collectComponentText(message.forwardedMessage?.components),
    message.poll ? `📊 ${message.poll.question}` : '',
    !message.poll && message.sticker ? '[Sticker]' : '',
  ].filter(Boolean).join('\n');
}

/**
 * All human-readable text in a Components v2 tree (mirrors the backend's
 * extractComponentText): v2 messages carry their whole body here, with empty
 * content/embeds.
 */
export function collectComponentText(components?: MessageComponent[]): string {
  if (!components || components.length === 0) return '';
  const parts: string[] = [];
  const walk = (c?: MessageComponent) => {
    if (!c || typeof c !== 'object') return;
    if (c.content) parts.push(c.content);
    if (c.label) parts.push(c.label);
    if (c.url) parts.push(c.url);
    if (c.description) parts.push(c.description);
    for (const item of c.items ?? []) {
      if (item?.description) parts.push(item.description);
    }
    walk(c.accessory);
    for (const child of c.components ?? []) walk(child);
  };
  for (const c of components) walk(c);
  return parts.join('\n');
}
