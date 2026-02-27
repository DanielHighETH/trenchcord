import { useEffect, useState, useMemo } from 'react';
import { Search, ExternalLink, Copy, Check, Trash2, LayoutGrid, List, X, MessageSquare } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { buildContractUrl } from '../utils/contractUrl';
import ConfirmModal from './ConfirmModal';
import type { ContractEntry } from '../types';

const EVM_CHAIN_LABELS: Record<string, string> = {
  eth: 'ETH', bsc: 'BNB', base: 'BASE', arb: 'ARB',
  blast: 'BLAST', polygon: 'POLY', avax: 'AVAX', fantom: 'FTM',
  linea: 'LINEA', mantle: 'MANTLE', scroll: 'SCROLL', zksync: 'ZKSYNC',
  sonic: 'SONIC', abstract: 'ABS', berachain: 'BERA',
  pulsechain: 'PLS', tron: 'TRON', hyperliquid: 'HL',
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

type ViewMode = 'table' | 'cards';

export default function ContractDashboard() {
  const contracts = useAppStore((s) => s.contracts);
  const fetchContracts = useAppStore((s) => s.fetchContracts);
  const deleteContract = useAppStore((s) => s.deleteContract);
  const deleteAllContracts = useAppStore((s) => s.deleteAllContracts);
  const config = useAppStore((s) => s.config);
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
          (c.guildName?.toLowerCase().includes(q) ?? false),
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
    const useApp = config?.openInDiscordApp ?? false;
    const url = useApp ? `discord://${path}` : `https://${path}`;
    window.open(url, useApp ? '_self' : '_blank');
  };

  const handleDelete = (entry: ContractEntry) => {
    deleteContract(entry.messageId, entry.address);
  };

  const handleDeleteAll = () => {
    setShowDeleteAll(true);
  };

  const evmColor = config?.evmAddressColor ?? '#fee75c';
  const solColor = config?.solAddressColor ?? '#14f195';

  return (
    <div className="flex-1 flex flex-col bg-discord-bg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-discord-border shrink-0">
        <h2 className="text-white font-semibold text-lg">Contract Feed</h2>
        <span className="text-discord-text-muted text-sm">{filtered.length} contracts</span>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          {contracts.length > 0 && (
            <button
              onClick={handleDeleteAll}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs text-discord-red hover:bg-discord-red/10 transition-colors border border-discord-red/30 hover:border-discord-red/60"
              title="Delete all contracts"
            >
              <Trash2 size={12} />
              Clear All
            </button>
          )}

          <div className="flex rounded overflow-hidden border border-discord-border text-xs">
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

          <div className="flex rounded overflow-hidden border border-discord-border text-xs">
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

          <div className="relative">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-discord-text-muted" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-discord-dark border border-discord-border rounded pl-7 pr-3 py-1 text-sm text-white placeholder-discord-text-muted w-48 focus:outline-none focus:border-discord-blurple"
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
                isCopied={copiedAddr === entry.address}
                onCopy={handleCopy}
                onOpen={handleOpen}
                onOpenDiscord={handleOpenDiscord}
                onDelete={handleDelete}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 p-4">
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
  isCopied: boolean;
  onCopy: (addr: string) => void;
  onOpen: (addr: string, evmChain?: string) => void;
  onOpenDiscord: (entry: ContractEntry) => void;
  onDelete: (entry: ContractEntry) => void;
}

function ContractRow({
  entry,
  evmColor,
  solColor,
  isCopied,
  onCopy,
  onOpen,
  onOpenDiscord,
  onDelete,
}: ContractItemProps) {
  const color = entry.chain === 'evm' ? evmColor : solColor;
  const chainLabel = entry.chain === 'evm' && entry.evmChain
    ? (EVM_CHAIN_LABELS[entry.evmChain] ?? entry.evmChain.toUpperCase())
    : entry.chain.toUpperCase();

  const isNew = entry.firstSeen !== false;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-discord-hover/30 transition-colors group">
      <span
        className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 uppercase"
        style={{ backgroundColor: `${color}20`, color }}
      >
        {chainLabel}
      </span>

      <span
        className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 uppercase ${
          isNew
            ? 'bg-green-500/20 text-green-400'
            : 'bg-orange-500/20 text-orange-400'
        }`}
      >
        {isNew ? 'NEW' : 'RESCAN'}
      </span>

      <span
        className="font-mono text-sm cursor-pointer hover:underline shrink-0"
        style={{ color }}
        title={entry.address}
        onClick={() => onCopy(entry.address)}
      >
        {entry.address.slice(0, 6)}...{entry.address.slice(-4)}
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
        <button
          onClick={() => onOpenDiscord(entry)}
          className="p-1 rounded hover:bg-discord-dark/60 text-discord-text-muted hover:text-white transition-colors"
          title="Open in Discord"
        >
          <MessageSquare size={13} />
        </button>
      </div>

      <span className="text-sm text-white truncate max-w-[120px]">{entry.authorName}</span>

      <span className="text-xs text-discord-text-muted truncate max-w-[180px]">
        {entry.guildName ? `${entry.guildName} / ` : ''}#{entry.channelName}
      </span>

      <span className="text-xs text-discord-text-muted shrink-0 ml-auto">
        {timeAgo(entry.timestamp)}
      </span>

      <button
        onClick={() => onDelete(entry)}
        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-discord-red/20 text-discord-text-muted hover:text-discord-red transition-all shrink-0"
        title="Delete"
      >
        <X size={13} />
      </button>
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
          style={{ backgroundColor: `${color}20`, color }}
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
        <button
          onClick={() => onOpenDiscord(entry)}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-discord-bg hover:bg-discord-hover transition-colors text-discord-text-muted hover:text-white"
          title="Open in Discord"
        >
          <MessageSquare size={11} />
          <span>Discord</span>
        </button>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="text-white truncate">{entry.authorName}</span>
        <span className="text-discord-text-muted truncate">
          {entry.guildName ? `${entry.guildName} / ` : ''}#{entry.channelName}
        </span>
      </div>
    </div>
  );
}
