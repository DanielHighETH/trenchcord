import type { ContractLinkTemplates } from '../discord/types.js';

const SOL_ADDRESS_REGEX = /(?<![1-9A-HJ-NP-Za-km-z])[1-9A-HJ-NP-Za-km-z]{32,48}(?![1-9A-HJ-NP-Za-km-z])/g;
const EVM_ADDRESS_REGEX = /\b0x[a-fA-F0-9]{40}\b/g;

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

const REFERRALS = { axiom: 'danielref', padre: 'daniel_dev', gmgn: 'danieldev', bloom: 'daniel' };

function getPresetTemplate(platform: string, chain: 'sol' | 'evm'): string {
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
        : `https://gmgn.ai/base/token/${REFERRALS.gmgn}_{address}`;
    default:
      return chain === 'sol'
        ? 'https://axiom.trade/t/{address}?chain=sol'
        : 'https://gmgn.ai/base/token/{address}';
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
): string {
  const isEvm = addr.startsWith('0x');
  const chain: 'sol' | 'evm' = isEvm ? 'evm' : 'sol';
  const platform = isEvm
    ? (config.evmPlatform ?? 'gmgn')
    : (config.solPlatform ?? 'axiom');

  let template: string;
  if (platform === 'custom') {
    const customTpl = isEvm ? config.evm : config.sol;
    template = injectReferralIntoCustomTemplate(customTpl);
  } else {
    template = getPresetTemplate(platform, chain);
  }

  return template.replace('{address}', addr);
}
