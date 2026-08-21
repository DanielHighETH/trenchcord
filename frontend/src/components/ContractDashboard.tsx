import { useEffect, useState, useMemo } from 'react';
import { Search, ExternalLink, Copy, Check, Trash2, LayoutGrid, List, X, MessageSquare, PanelLeftOpen, BellRing } from 'lucide-react';
import { isHostedMode } from '../lib/supabase';
import { useAppStore } from '../stores/appStore';
import { buildContractUrl } from '../utils/contractUrl';
import ConfirmModal from './ConfirmModal';
import { getAvatarUrl, AppTag } from './Message';
import type { ContractEntry, ContractTokenInfo } from '../types';
import { colorWithExtraAlpha } from './ColorPickerWithAlpha';
import { isIOSApp } from '../utils/platform';

const EVM_CHAIN_LABELS: Record<string, string> = {
  eth: 'ETH', bsc: 'BNB', base: 'BASE', arb: 'ARB',
  blast: 'BLAST', polygon: 'POLY', avax: 'AVAX', fantom: 'FTM',
  linea: 'LINEA', mantle: 'MANTLE', scroll: 'SCROLL', zksync: 'ZKSYNC',
  sonic: 'SONIC', abstract: 'ABS', berachain: 'BERA',
  pulsechain: 'PLS', tron: 'TRON', hyperliquid: 'HL',
  robinhood: 'HOOD',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

// getAvatarUrl derives the default-avatar index from BigInt(userId); guard
// against entries whose author id isn't numeric (defensive for old data).
function safeAvatarUrl(userId: string, avatar: string | null): string {
  try {
    return getAvatarUrl(userId, avatar);
  } catch {
    return 'https://cdn.discordapp.com/embed/avatars/0.png';
  }
}

function formatUsd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(value < 1 ? 4 : 2)}`;
}

/**
 * Token metadata chip. Renders nothing until an entry carries `tokenInfo` —
 * populated by the upcoming Trenchcord Cloud token-info service (premium),
 * so the feed layout is already prepared for it.
 */
function TokenInfoChip({ info }: { info?: ContractTokenInfo }) {
  if (!info || (!info.name && !info.symbol && info.marketCapUsd == null)) return null;
  return (
    <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-discord-blurple/15 text-[11px] text-discord-text shrink-0 min-w-0">
      {info.imageUrl && (
        <img src={info.imageUrl} alt="" loading="lazy" decoding="async" className="w-3.5 h-3.5 rounded-full shrink-0" />
      )}
      {(info.symbol || info.name) && (
        <span className="font-semibold truncate">{info.symbol ?? info.name}</span>
      )}
      {info.marketCapUsd != null && (
        <span className="text-discord-text-muted whitespace-nowrap">MC {formatUsd(info.marketCapUsd)}</span>
      )}
      {info.liquidityUsd != null && (
        <span className="text-discord-text-muted whitespace-nowrap hidden lg:inline">LP {formatUsd(info.liquidityUsd)}</span>
      )}
    </span>
  );
}

type ViewMode = 'table' | 'cards';

export default function ContractDashboard() {
  const contracts = useAppStore((s) => s.contracts);
  const fetchContracts = useAppStore((s) => s.fetchContracts);
  const deleteContract = useAppStore((s) => s.deleteContract);
  const deleteAllContracts = useAppStore((s) => s.deleteAllContracts);
  const config = useAppStore((s) => s.config);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const setAlertPrefill = useAppStore((s) => s.setAlertPrefill);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const setActiveRoom = useAppStore((s) => s.setActiveRoom);
  const subscriptionStatus = useAppStore((s) => s.subscriptionStatus);
  const showAlertButton = !isHostedMode && (subscriptionStatus?.active ?? false);
  const [search, setSearch] = useState('');
  const [chainFilter, setChainFilter] = useState<'all' | 'evm' | 'sol'>('all');
  const [copiedAddr, setCopiedAddr] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [showDeleteAll, setShowDeleteAll] = useState(false);

  useEffect(() => {
    fetchContracts();
  }, [fetchContracts]);

  const filtered = useMemo(() => {
    let result = contracts;
    if (chainFilter !== 'all') {
      result = result.filter((c) => c.chain === chainFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.address.toLowerCase().includes(q) ||
          c.authorName.toLowerCase().includes(q) ||
          c.channelName.toLowerCase().includes(q) ||
          (c.guildName?.toLowerCase().includes(q) ?? false) ||
          (c.content?.toLowerCase().includes(q) ?? false) ||
          (c.tokenInfo?.name?.toLowerCase().includes(q) ?? false) ||
          (c.tokenInfo?.symbol?.toLowerCase().includes(q) ?? false),
      );
    }
    return result;
  }, [contracts, chainFilter, search]);

  const handleCopy = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopiedAddr(addr);
    setTimeout(() => setCopiedAddr(null), 1500);
  };

  const handleOpen = (addr: string, evmChain?: string) => {
    if (!config) return;
    const url = buildContractUrl(addr, config.contractLinkTemplates, evmChain);
    window.open(url, '_blank');
  };

  const handleOpenDiscord = (entry: ContractEntry) => {
    const path = `discord.com/channels/${entry.guildId ?? '@me'}/${entry.channelId}/${entry.messageId}`;
    // iOS always prefers the native app — the web target is useless there.
    const useApp = (config?.openInDiscordApp ?? true) || isIOSApp();
    const url = useApp ? `discord://${path}` : `https://${path}`;
    window.open(url, useApp ? '_self' : '_blank');
  };

  const handleDelete = (entry: ContractEntry) => {
    deleteContract(entry.messageId, entry.address);
  };

  // Prefill a DEX price alert from this contract and open it on the Alerts page.
  const handleAlert = (entry: ContractEntry) => {
    setAlertPrefill({
      chain: entry.chain === 'sol' ? 'sol' : entry.evmChain ?? 'eth',
      contract: entry.address,
    });
    setActiveRoom('alerts');
    setActiveView('chat');
  };

  const handleDeleteAll = () => {
    setShowDeleteAll(true);
  };

  const showFull = config?.showFullContractAddress ?? false;
  const evmColor = config?.evmAddressColor ?? '#fee75c';
  const solColor = config?.solAddressColor ?? '#14f195';

  return (
    <div className="flex-1 flex flex-col bg-discord-bg overflow-hidden">
      {/* Header */}
      <div className="border-b border-discord-border shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3">
          {sidebarCollapsed && (
            <button
              onClick={toggleSidebar}
              className="p-1.5 rounded text-discord-channel-icon hover:text-discord-header-primary hover:bg-discord-hover transition-colors shrink-0"
              title="Show sidebar"
            >
              <PanelLeftOpen size={18} />
            </button>
          )}
          <h2 className="text-white font-semibold text-base sm:text-lg">Contract Feed</h2>
          <span className="text-discord-text-muted text-xs sm:text-sm">{filtered.length}</span>
          <div className="flex-1" />
          {contracts.length > 0 && (
            <button
              onClick={handleDeleteAll}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs text-discord-red hover:bg-discord-red/10 transition-colors border border-discord-red/30 hover:border-discord-red/60 shrink-0"
              title="Delete all contracts"
            >
              <Trash2 size={12} />
              <span className="hidden sm:inline">Clear All</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 px-3 sm:px-4 pb-3 overflow-x-auto scrollbar-none">
          <div className="flex rounded overflow-hidden border border-discord-border text-xs shrink-0">
            <button
              onClick={() => setViewMode('table')}
              className={`px-2 py-1 transition-colors ${
                viewMode === 'table'
                  ? 'bg-discord-blurple text-white'
                  : 'bg-discord-dark text-discord-text-muted hover:text-white'
              }`}
              title="Table view"
            >
              <List size={14} />
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`px-2 py-1 transition-colors ${
                viewMode === 'cards'
                  ? 'bg-discord-blurple text-white'
                  : 'bg-discord-dark text-discord-text-muted hover:text-white'
              }`}
              title="Card view"
            >
              <LayoutGrid size={14} />
            </button>
          </div>

          <div className="flex rounded overflow-hidden border border-discord-border text-xs shrink-0">
            {(['all', 'evm', 'sol'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setChainFilter(f)}
                className={`px-2.5 py-1 transition-colors ${
                  chainFilter === f
                    ? 'bg-discord-blurple text-white'
                    : 'bg-discord-dark text-discord-text-muted hover:text-white'
                }`}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[120px]">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-discord-text-muted" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-discord-dark border border-discord-border rounded pl-7 pr-3 py-1 text-sm text-white placeholder-discord-text-muted w-full focus:outline-none focus:border-discord-blurple"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-discord-text-muted text-sm">
            {contracts.length === 0 ? 'No contracts detected yet' : 'No contracts match your filters'}
          </div>
        ) : viewMode === 'table' ? (
          <div className="divide-y divide-discord-border/50">
            {filtered.map((entry, i) => (
              <ContractRow
                key={`${entry.messageId}-${entry.address}-${i}`}
                entry={entry}
                evmColor={evmColor}
                solColor={solColor}
                showFull={showFull}
                isCopied={copiedAddr === entry.address}
                onCopy={handleCopy}
                onOpen={handleOpen}
                onOpenDiscord={handleOpenDiscord}
                onDelete={handleDelete}
                onAlert={showAlertButton ? handleAlert : undefined}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3 p-3 sm:p-4">
            {filtered.map((entry, i) => (
              <ContractCard
                key={`${entry.messageId}-${entry.address}-${i}`}
                entry={entry}
                evmColor={evmColor}
                solColor={solColor}
                isCopied={copiedAddr === entry.address}
                onCopy={handleCopy}
                onOpen={handleOpen}
                onOpenDiscord={handleOpenDiscord}
                onDelete={handleDelete}
                onAlert={showAlertButton ? handleAlert : undefined}
              />
            ))}
          </div>
        )}
      </div>

      <ConfirmModal
        open={showDeleteAll}
        title="Delete All Contracts"
        message="This will permanently delete all contracts. This cannot be undone."
        confirmLabel="Delete All"
        onConfirm={() => {
          setShowDeleteAll(false);
          deleteAllContracts();
        }}
        onCancel={() => setShowDeleteAll(false)}
      />
    </div>
  );
}

interface ContractItemProps {
  entry: ContractEntry;
  evmColor: string;
  solColor: string;
  showFull?: boolean;
  isCopied: boolean;
  onCopy: (addr: string) => void;
  onOpen: (addr: string, evmChain?: string) => void;
  onOpenDiscord: (entry: ContractEntry) => void;
  onDelete: (entry: ContractEntry) => void;
  /** Absent when premium alerts are unavailable (hosted mode / no subscription). */
  onAlert?: (entry: ContractEntry) => void;
}

function ContractRow({
  entry,
  evmColor,
  solColor,
  showFull = false,
  isCopied,
  onCopy,
  onOpen,
  onOpenDiscord,
  onDelete,
  onAlert,
}: ContractItemProps) {
  const color = entry.chain === 'evm' ? evmColor : solColor;
  const chainLabel = entry.chain === 'evm' && entry.evmChain
    ? (EVM_CHAIN_LABELS[entry.evmChain] ?? entry.evmChain.toUpperCase())
    : entry.chain.toUpperCase();

  const isNew = entry.firstSeen !== false;

  return (
    <div className="px-3 sm:px-4 py-2.5 hover:bg-discord-hover/30 transition-colors group">
      <div className="flex items-center gap-2 sm:gap-3">
        <span
          className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 uppercase"
          style={{ backgroundColor: colorWithExtraAlpha(color, 0.125), color }}
        >
          {chainLabel}
        </span>

        <span
          className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 uppercase hidden sm:inline ${
            isNew
              ? 'bg-green-500/20 text-green-400'
              : 'bg-orange-500/20 text-orange-400'
          }`}
        >
          {isNew ? 'NEW' : 'RESCAN'}
        </span>

        <span
          className={`font-mono text-sm cursor-pointer hover:underline ${showFull ? 'min-w-0 break-all' : 'shrink-0'}`}
          style={{ color }}
          title={entry.address}
          onClick={() => onCopy(entry.address)}
        >
          {showFull ? entry.address : `${entry.address.slice(0, 6)}...${entry.address.slice(-4)}`}
        </span>

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => onCopy(entry.address)}
            className="p-1 rounded hover:bg-discord-dark/60 text-discord-text-muted hover:text-white transition-colors"
            title="Copy CA"
          >
            {isCopied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
          </button>
          <button
            onClick={() => onOpen(entry.address, entry.evmChain)}
            className="p-1 rounded hover:bg-discord-dark/60 text-discord-text-muted hover:text-white transition-colors"
            title="Open chart"
          >
            <ExternalLink size={13} />
          </button>
          {onAlert && (
            <button
              onClick={() => onAlert(entry)}
              className="p-1 rounded hover:bg-discord-dark/60 text-discord-text-muted hover:text-white transition-colors"
              title="Create price alert"
            >
              <BellRing size={13} />
            </button>
          )}
          {entry.source !== 'telegram' && (
            <button
              onClick={() => onOpenDiscord(entry)}
              className="p-1 rounded hover:bg-discord-dark/60 text-discord-text-muted hover:text-white transition-colors hidden sm:block"
              title="Open in Discord"
            >
              <MessageSquare size={13} />
            </button>
          )}
        </div>

        <TokenInfoChip info={entry.tokenInfo} />

        <span className="text-xs text-discord-text-muted shrink-0 ml-auto">
          {timeAgo(entry.timestamp)}
        </span>

        <button
          onClick={() => onDelete(entry)}
          className="p-1 rounded sm:opacity-0 sm:group-hover:opacity-100 hover:bg-discord-red/20 text-discord-text-muted hover:text-discord-red transition-all shrink-0"
          title="Delete"
        >
          <X size={13} />
        </button>
      </div>

      {/* Who posted it + the message itself */}
      <div className="flex items-center gap-2 mt-1.5 min-w-0">
        <img
          src={safeAvatarUrl(entry.authorId, entry.authorAvatar ?? null)}
          alt=""
          loading="lazy"
          decoding="async"
          className="w-5 h-5 rounded-full shrink-0"
        />
        <span className="text-sm text-white font-medium truncate max-w-[120px] sm:max-w-[160px] shrink-0">{entry.authorName}</span>
        {entry.authorIsBot && <AppTag dense />}
        <span className="text-xs text-discord-text-muted truncate max-w-[180px] shrink-0 hidden md:inline">
          {entry.guildName ? `${entry.guildName} / ` : ''}#{entry.channelName}
        </span>
        {entry.content && (
          <span className="text-sm text-discord-text-muted truncate min-w-0" title={entry.content}>
            {entry.content}
          </span>
        )}
      </div>
    </div>
  );
}

function ContractCard({
  entry,
  evmColor,
  solColor,
  isCopied,
  onCopy,
  onOpen,
  onOpenDiscord,
  onDelete,
  onAlert,
}: ContractItemProps) {
  const color = entry.chain === 'evm' ? evmColor : solColor;
  const chainLabel = entry.chain === 'evm' && entry.evmChain
    ? (EVM_CHAIN_LABELS[entry.evmChain] ?? entry.evmChain.toUpperCase())
    : entry.chain.toUpperCase();

  const isNew = entry.firstSeen !== false;

  return (
    <div className="bg-discord-dark rounded-lg border border-discord-border p-3 flex flex-col gap-2.5 hover:border-discord-border/80 transition-colors group relative">
      <button
        onClick={() => onDelete(entry)}
        className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-discord-red/20 text-discord-text-muted hover:text-discord-red transition-all"
        title="Delete"
      >
        <X size={13} />
      </button>

      <div className="flex items-center gap-2">
        <span
          className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase"
          style={{ backgroundColor: colorWithExtraAlpha(color, 0.125), color }}
        >
          {chainLabel}
        </span>
        <span
          className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
            isNew
              ? 'bg-green-500/20 text-green-400'
              : 'bg-orange-500/20 text-orange-400'
          }`}
        >
          {isNew ? 'NEW' : 'RESCAN'}
        </span>
        <span className="text-xs text-discord-text-muted ml-auto pr-5">{timeAgo(entry.timestamp)}</span>
      </div>

      <div
        className="font-mono text-sm cursor-pointer hover:underline truncate"
        style={{ color }}
        title={entry.address}
        onClick={() => onCopy(entry.address)}
      >
        {entry.address}
      </div>

      <TokenInfoChip info={entry.tokenInfo} />

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onCopy(entry.address)}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-discord-bg hover:bg-discord-hover transition-colors text-discord-text-muted hover:text-white"
          title="Copy CA"
        >
          {isCopied ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
          <span>{isCopied ? 'Copied' : 'Copy CA'}</span>
        </button>
        <button
          onClick={() => onOpen(entry.address, entry.evmChain)}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-discord-bg hover:bg-discord-hover transition-colors text-discord-text-muted hover:text-white"
          title="Open chart"
        >
          <ExternalLink size={11} />
          <span>Chart</span>
        </button>
        {onAlert && (
          <button
            onClick={() => onAlert(entry)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-discord-bg hover:bg-discord-hover transition-colors text-discord-text-muted hover:text-white"
            title="Create price alert"
          >
            <BellRing size={11} />
            <span>Alert</span>
          </button>
        )}
        {entry.source !== 'telegram' && (
          <button
            onClick={() => onOpenDiscord(entry)}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-discord-bg hover:bg-discord-hover transition-colors text-discord-text-muted hover:text-white"
            title="Open in Discord"
          >
            <MessageSquare size={11} />
            <span>Discord</span>
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs">
        <img
          src={safeAvatarUrl(entry.authorId, entry.authorAvatar ?? null)}
          alt=""
          loading="lazy"
          decoding="async"
          className="w-4 h-4 rounded-full shrink-0"
        />
        <span className="text-white truncate">{entry.authorName}</span>
        {entry.authorIsBot && <AppTag dense />}
        <span className="text-discord-text-muted truncate">
          {entry.guildName ? `${entry.guildName} / ` : ''}#{entry.channelName}
        </span>
      </div>

      {entry.content && (
        <p className="text-xs text-discord-text-muted line-clamp-2 break-words" title={entry.content}>
          {entry.content}
        </p>
      )}
    </div>
  );
}
