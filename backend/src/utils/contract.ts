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
};

export const EVM_CHAIN_LABELS: Record<string, string> = {
  eth: 'ETH', bsc: 'BNB', base: 'BASE', arb: 'ARB',
  blast: 'BLAST', polygon: 'POLY', avax: 'AVAX', fantom: 'FTM',
  linea: 'LINEA', mantle: 'MANTLE', scroll: 'SCROLL', zksync: 'ZKSYNC',
  sonic: 'SONIC', abstract: 'ABS', berachain: 'BERA',
  pulsechain: 'PLS', tron: 'TRON', hyperliquid: 'HL',
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

const REFERRALS = { axiom: 'danielref', padre: 'daniel_dev', gmgn: 'danieldev', bloom: 'daniel' };

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
