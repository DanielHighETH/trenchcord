import type { ContractLinkTemplates } from '../discord/types.js';

const SOL_ADDRESS_REGEX = /(?<![1-9A-HJ-NP-Za-km-z])[1-9A-HJ-NP-Za-km-z]{32,48}(?![1-9A-HJ-NP-Za-km-z])/g;
const EVM_ADDRESS_REGEX = /\b0x[a-fA-F0-9]{40}\b/g;

const GMGN_EVM_CHAINS = new Set([
  'eth', 'bsc', 'base', 'arb', 'blast', 'polygon', 'avax',
  'fantom', 'linea', 'mantle', 'scroll', 'zksync', 'sonic',
  'abstract', 'berachain', 'pulsechain', 'tron', 'hyperliquid',
]);

const CHAIN_TEXT_MAP: Record<string, string> = {
  bnb: 'bsc', bsc: 'bsc',
  eth: 'eth', ethereum: 'eth',
  base: 'base',
  arb: 'arb', arbitrum: 'arb',
  blast: 'blast',
  polygon: 'polygon', matic: 'polygon',
  avax: 'avax', avalanche: 'avax',
  fantom: 'fantom', ftm: 'fantom',
  linea: 'linea',
  mantle: 'mantle',
  scroll: 'scroll',
  sonic: 'sonic',
  pulsechain: 'pulsechain', pulse: 'pulsechain',
  tron: 'tron',
  zksync: 'zksync',
  abstract: 'abstract',
  berachain: 'berachain', bera: 'berachain',
  hyperliquid: 'hyperliquid', hyperevm: 'hyperliquid',
  robinhood: 'robinhood', hood: 'robinhood',
};

export const EVM_CHAIN_LABELS: Record<string, string> = {
  eth: 'ETH', bsc: 'BNB', base: 'BASE', arb: 'ARB',
  blast: 'BLAST', polygon: 'POLY', avax: 'AVAX', fantom: 'FTM',
  linea: 'LINEA', mantle: 'MANTLE', scroll: 'SCROLL', zksync: 'ZKSYNC',
  sonic: 'SONIC', abstract: 'ABS', berachain: 'BERA',
  pulsechain: 'PLS', tron: 'TRON', hyperliquid: 'HL',
  robinhood: 'HOOD',
};

export interface ContractDetectionResult {
  hasContract: boolean;
  addresses: string[];
}

export function detectContractAddresses(content: string): ContractDetectionResult {
  const addresses: string[] = [];

  // Strip URLs so we don't match addresses embedded in links
  const stripped = content
    .replace(/https?:\/\/[^\s<>)]+/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  const evmMatches = stripped.match(EVM_ADDRESS_REGEX);
  if (evmMatches) {
    addresses.push(...evmMatches);
  }

  const solMatches = stripped.match(SOL_ADDRESS_REGEX);
  if (solMatches) {
    for (const match of solMatches) {
      if (match.length >= 32 && !addresses.includes(match)) {
        const hasNumbers = /\d/.test(match);
        const hasMixedCase = /[a-z]/.test(match) && /[A-Z]/.test(match);
        if (hasNumbers && hasMixedCase && match.length >= 40) {
          addresses.push(match);
        }
      }
    }
  }

  return {
    hasContract: addresses.length > 0,
    addresses,
  };
}

type EmbedLike = { description?: string; fields?: { name: string; value: string }[] };

function collectEmbedText(embeds?: EmbedLike[]): string {
  if (!embeds) return '';
  const parts: string[] = [];
  for (const embed of embeds) {
    if (embed.description) parts.push(embed.description);
    if (embed.fields) {
      for (const f of embed.fields) {
        parts.push(f.name);
        parts.push(f.value);
      }
    }
  }
  return parts.join(' ');
}

export function extractEvmChainFromGmgnLinks(
  content: string,
  embeds?: EmbedLike[],
): { address: string; chain: string }[] {
  const fullText = content + ' ' + collectEmbedText(embeds);
  const regex = /gmgn\.ai\/(\w+)\/token\/(?:\w+_)?(0x[a-fA-F0-9]{40})/g;
  const results: { address: string; chain: string }[] = [];
  let m;
  while ((m = regex.exec(fullText)) !== null) {
    const slug = m[1].toLowerCase();
    if (GMGN_EVM_CHAINS.has(slug)) {
      results.push({ address: m[2], chain: slug });
    }
  }
  return results;
}

export function detectEvmChainFromContent(
  content: string,
  embeds?: EmbedLike[],
): string | null {
  const fullText = content + ' ' + collectEmbedText(embeds);

  const gmgnRegex = /gmgn\.ai\/(\w+)\/token\//g;
  let m;
  while ((m = gmgnRegex.exec(fullText)) !== null) {
    const slug = m[1].toLowerCase();
    if (GMGN_EVM_CHAINS.has(slug)) return slug;
  }

  // Rick-style bots label the chain on its own line, e.g. "🌐 Base @ Uniswap"
  // or "🌐 Robinhood". Non-EVM chains (e.g. Solana) fall through to null.
  const globeMatch = fullText.match(/\u{1F310}\s*(\w+)/u);
  if (globeMatch) {
    const key = globeMatch[1].toLowerCase();
    if (CHAIN_TEXT_MAP[key]) return CHAIN_TEXT_MAP[key];
  }

  const chainAtMatch = fullText.match(
    /\b(\w+)\s*@\s*(?:Uniswap|Pancake|Sushi|TraderJoe|Camelot|Raydium)/i,
  );
  if (chainAtMatch) {
    const key = chainAtMatch[1].toLowerCase();
    if (CHAIN_TEXT_MAP[key]) return CHAIN_TEXT_MAP[key];
  }

  const tipMatch = fullText.match(/top choice for (\w+)/i);
  if (tipMatch) {
    const key = tipMatch[1].toLowerCase();
    if (CHAIN_TEXT_MAP[key]) return CHAIN_TEXT_MAP[key];
  }

  return null;
}

// EVM addresses are chain-agnostic: the same 0x string can be deployed on many
// chains. When the message carries no chain hint, we resolve the "real" chain by
// asking which chain the token actually has liquidity on (DexScreener, with a
// GeckoTerminal fallback for chains DexScreener misses, e.g. newer L2s).

// Maps external API chain ids to the internal slugs used across the app.
const EXTERNAL_CHAIN_ALIASES: Record<string, string> = {
  ethereum: 'eth', eth: 'eth',
  base: 'base',
  bsc: 'bsc',
  arbitrum: 'arb', arb: 'arb', arbitrum_nova: 'arb',
  blast: 'blast',
  polygon: 'polygon', polygon_pos: 'polygon', matic: 'polygon',
  avalanche: 'avax', avax: 'avax',
  fantom: 'fantom', ftm: 'fantom',
  linea: 'linea',
  mantle: 'mantle',
  scroll: 'scroll',
  zksync: 'zksync',
  sonic: 'sonic',
  abstract: 'abstract',
  berachain: 'berachain',
  pulsechain: 'pulsechain',
  tron: 'tron',
  hyperliquid: 'hyperliquid', hyperevm: 'hyperliquid',
  robinhood: 'robinhood',
};

function normalizeExternalChain(id: string): string {
  const key = id.toLowerCase();
  return EXTERNAL_CHAIN_ALIASES[key] ?? key;
}

const API_TIMEOUT_MS = 5000;
// Positive results are cached indefinitely (a token's home chain is stable);
// negative results expire so a token that later gains liquidity can re-resolve.
const NEGATIVE_CACHE_TTL_MS = 10 * 60 * 1000;
const chainResolveCache = new Map<string, { slug: string | null; expires: number }>();

async function fetchDexScreenerChain(address: string): Promise<string | null> {
  const res = await fetch(
    `https://api.dexscreener.com/latest/dex/search?q=${address}`,
    { signal: AbortSignal.timeout(API_TIMEOUT_MS) },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    pairs?: { chainId?: string; baseToken?: { address?: string }; liquidity?: { usd?: number } }[];
  };
  const lower = address.toLowerCase();
  let best: { slug: string; liq: number } | null = null;
  for (const p of data.pairs ?? []) {
    if (!p.chainId || p.baseToken?.address?.toLowerCase() !== lower) continue;
    const liq = p.liquidity?.usd ?? 0;
    if (!best || liq > best.liq) best = { slug: normalizeExternalChain(p.chainId), liq };
  }
  return best?.slug ?? null;
}

async function fetchGeckoTerminalChain(address: string): Promise<string | null> {
  const res = await fetch(
    `https://api.geckoterminal.com/api/v2/search/pools?query=${address}`,
    { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(API_TIMEOUT_MS) },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    data?: {
      attributes?: { reserve_in_usd?: string };
      relationships?: { base_token?: { data?: { id?: string } } };
    }[];
  };
  const lower = address.toLowerCase();
  let best: { slug: string; liq: number } | null = null;
  for (const pool of data.data ?? []) {
    // base_token id is `<network>_<address>`; the address (0x hex) has no
    // underscore, so split on the last underscore to isolate the network.
    const id = pool.relationships?.base_token?.data?.id ?? '';
    const sep = id.lastIndexOf('_');
    if (sep < 0) continue;
    const network = id.slice(0, sep);
    const tokenAddr = id.slice(sep + 1);
    if (tokenAddr.toLowerCase() !== lower) continue;
    const liq = parseFloat(pool.attributes?.reserve_in_usd ?? '0') || 0;
    if (!best || liq > best.liq) best = { slug: normalizeExternalChain(network), liq };
  }
  return best?.slug ?? null;
}

export async function resolveEvmChainFromApi(address: string): Promise<string | null> {
  if (!address.startsWith('0x')) return null;

  const cached = chainResolveCache.get(address);
  if (cached && (cached.slug !== null || cached.expires > Date.now())) {
    return cached.slug;
  }

  let slug: string | null = null;
  try {
    slug = await fetchDexScreenerChain(address);
  } catch (err) {
    console.error('[contract] DexScreener chain lookup failed:', (err as Error).message);
  }
  if (!slug) {
    try {
      slug = await fetchGeckoTerminalChain(address);
    } catch (err) {
      console.error('[contract] GeckoTerminal chain lookup failed:', (err as Error).message);
    }
  }

  chainResolveCache.set(address, { slug, expires: Date.now() + NEGATIVE_CACHE_TTL_MS });
  return slug;
}

const REFERRALS = { axiom: 'danielref', padre: 'daniel_dev', gmgn: 'danieldev', bloom: 'daniel' };

// Rewrite gmgn/axiom referral codes in third-party links (e.g. Rick bot's
// per-terminal buy links) so they carry our referral instead of the sender's.
// Address and chain are preserved; only the referral portion is swapped.
export function rewriteReferralLinks(url: string): string {
  // gmgn.ai/{chain}/token/{ref}_{address}  (ref may be absent)
  const gmgn = url.match(/^(https?:\/\/gmgn\.ai\/[^/]+\/token\/)([^?#]+)(.*)$/i);
  if (gmgn) {
    const rest = gmgn[2];
    const address = rest.includes('_') ? rest.slice(rest.indexOf('_') + 1) : rest;
    return `${gmgn[1]}${REFERRALS.gmgn}_${address}${gmgn[3]}`;
  }
  // axiom.trade/t/{address}/@{ref}
  const axiom = url.match(/^(https?:\/\/axiom\.trade\/t\/[^/]+\/@)[^/?#]+(.*)$/i);
  if (axiom) {
    return `${axiom[1]}${REFERRALS.axiom}${axiom[2]}`;
  }
  return url;
}

function getPresetTemplate(platform: string, chain: 'sol' | 'evm', evmChain?: string): string {
  const evmSlug = evmChain || 'base';
  switch (platform) {
    case 'axiom':
      return `https://axiom.trade/t/{address}/@${REFERRALS.axiom}?chain=sol`;
    case 'padre':
      return `https://trade.padre.gg/trade/solana/{address}?rk=${REFERRALS.padre}`;
    case 'bloom':
      return chain === 'sol'
        ? `https://t.me/BloomSolana_bot?start=ref_${REFERRALS.bloom}_ca_{address}`
        : `https://t.me/BloomEVMbot?start=ref_${REFERRALS.bloom}_ca_{address}`;
    case 'gmgn':
      return chain === 'sol'
        ? `https://gmgn.ai/sol/token/${REFERRALS.gmgn}_{address}`
        : `https://gmgn.ai/${evmSlug}/token/${REFERRALS.gmgn}_{address}`;
    default:
      return chain === 'sol'
        ? 'https://axiom.trade/t/{address}?chain=sol'
        : `https://gmgn.ai/${evmSlug}/token/{address}`;
  }
}

function injectReferralIntoCustomTemplate(template: string): string {
  if (template.includes('axiom.trade')) {
    return template.replace('{address}', `{address}/@${REFERRALS.axiom}`);
  }
  if (template.includes('padre.gg')) {
    const sep = template.includes('?') ? '&' : '?';
    return `${template}${sep}rk=${REFERRALS.padre}`;
  }
  if (template.includes('gmgn.ai')) {
    return template.replace('{address}', `${REFERRALS.gmgn}_{address}`);
  }
  if (template.includes('BloomSolana_bot') || template.includes('BloomEVMbot')) {
    return template.replace('ref__ca_', `ref_${REFERRALS.bloom}_ca_`);
  }
  return template;
}

export function buildContractUrl(
  addr: string,
  config: ContractLinkTemplates,
  evmChain?: string,
): string {
  const isEvm = addr.startsWith('0x');
  const chain: 'sol' | 'evm' = isEvm ? 'evm' : 'sol';
  const platform = isEvm
    ? (config.evmPlatform ?? 'gmgn')
    : (config.solPlatform ?? 'axiom');

  let template: string;
  if (platform === 'custom') {
    let customTpl = isEvm ? config.evm : config.sol;
    if (isEvm && evmChain) {
      customTpl = customTpl.replace(/gmgn\.ai\/\w+\/token/, `gmgn.ai/${evmChain}/token`);
    }
    template = injectReferralIntoCustomTemplate(customTpl);
  } else {
    template = getPresetTemplate(platform, chain, evmChain);
  }

  return template.replace('{address}', addr);
}
