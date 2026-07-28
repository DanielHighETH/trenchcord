import type { FrontendMessage } from '../types';

const EVM_ADDR_RE = /\b0x[a-fA-F0-9]{40}\b/g;
const SOL_ADDR_RE = /(?<![1-9A-HJ-NP-Za-km-z])[1-9A-HJ-NP-Za-km-z]{40,48}(?![1-9A-HJ-NP-Za-km-z])/g;

/**
 * Find contract addresses in a blob of text.
 *
 * Mirrors the backend detector in utils/contract.ts, but runs client-side so it
 * can also cover text the backend never scans (embeds).
 */
export function detectAddresses(text: string): string[] {
  // Strip URLs so we don't detect addresses embedded in links
  const stripped = text
    .replace(/https?:\/\/[^\s<>)]+/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  const addrs: string[] = [];
  const evm = stripped.match(EVM_ADDR_RE);
  if (evm) addrs.push(...evm);
  const sol = stripped.match(SOL_ADDR_RE);
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
 * Every Solana address a message points at, including ones only present in its
 * embeds.
 *
 * The backend only scans `content` (utils/contract.ts), so caller bots that put
 * the contract exclusively in an embed -- Rick being the common case -- produce
 * an empty `message.contractAddresses`. Backend hits come first so the ordering
 * matches the pills rendered in the message body.
 */
export function collectSolAddresses(message: FrontendMessage): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const add = (addr: string) => {
    if (addr.startsWith('0x') || seen.has(addr)) return;
    seen.add(addr);
    out.push(addr);
  };

  for (const addr of message.contractAddresses ?? []) add(addr);

  for (const embed of message.embeds ?? []) {
    const parts: string[] = [];
    if (embed.title) parts.push(embed.title);
    if (embed.description) parts.push(embed.description);
    if (embed.author?.name) parts.push(embed.author.name);
    if (embed.footer?.text) parts.push(embed.footer.text);
    for (const field of embed.fields ?? []) {
      parts.push(field.name);
      parts.push(field.value);
    }
    if (parts.length > 0) detectAddresses(parts.join(' ')).forEach(add);
  }

  return out;
}
