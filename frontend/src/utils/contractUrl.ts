import type { ContractLinkTemplates } from '../types';

const REFERRALS = { axiom: 'danielref', padre: 'daniel_dev', gmgn: 'danieldev', bloom: 'daniel' };

export const DEFAULT_LINK_TEMPLATES: ContractLinkTemplates = {
  evm: 'https://gmgn.ai/base/token/{address}',
  sol: 'https://axiom.trade/t/{address}?chain=sol',
  solPlatform: 'axiom',
  evmPlatform: 'gmgn',
};

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
