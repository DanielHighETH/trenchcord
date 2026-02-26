import { useEffect, useState, useMemo } from 'react';
import { Search, ExternalLink, Copy, Check } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { buildContractUrl } from '../utils/contractUrl';
import type { ContractEntry } from '../types';

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

export default function ContractDashboard() {
  const contracts = useAppStore((s) => s.contracts);
  const fetchContracts = useAppStore((s) => s.fetchContracts);
  const config = useAppStore((s) => s.config);
  const [search, setSearch] = useState('');
  const [chainFilter, setChainFilter] = useState<'all' | 'evm' | 'sol'>('all');
  const [copiedAddr, setCopiedAddr] = useState<string | null>(null);

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

  const handleOpen = (addr: string) => {
    if (!config) return;
    const url = buildContractUrl(addr, config.contractLinkTemplates);
    window.open(url, '_blank');
  };

  const evmColor = config?.evmAddressColor ?? '#fee75c';
  const solColor = config?.solAddressColor ?? '#14f195';

  return (
    <div className="flex-1 flex flex-col bg-discord-bg overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-discord-border shrink-0">
        <h2 className="text-white font-semibold text-lg">Contract Feed</h2>
        <span className="text-discord-text-muted text-sm">{filtered.length} contracts</span>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
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

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-discord-text-muted text-sm">
            {contracts.length === 0 ? 'No contracts detected yet' : 'No contracts match your filters'}
          </div>
        ) : (
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
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ContractRow({
  entry,
  evmColor,
  solColor,
  isCopied,
  onCopy,
  onOpen,
}: {
  entry: ContractEntry;
  evmColor: string;
  solColor: string;
  isCopied: boolean;
  onCopy: (addr: string) => void;
  onOpen: (addr: string) => void;
}) {
  const color = entry.chain === 'evm' ? evmColor : solColor;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-discord-hover/30 transition-colors group">
      <span
        className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 uppercase"
        style={{ backgroundColor: `${color}20`, color }}
      >
        {entry.chain}
      </span>

      <span
        className="font-mono text-sm cursor-pointer hover:underline shrink-0"
        style={{ color }}
        title={entry.address}
        onClick={() => onCopy(entry.address)}
      >
        {entry.address.slice(0, 6)}...{entry.address.slice(-4)}
      </span>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={() => onCopy(entry.address)}
          className="p-1 rounded hover:bg-discord-dark/60 text-discord-text-muted hover:text-white transition-colors"
          title="Copy address"
        >
          {isCopied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
        </button>
        <button
          onClick={() => onOpen(entry.address)}
          className="p-1 rounded hover:bg-discord-dark/60 text-discord-text-muted hover:text-white transition-colors"
          title="Open in explorer"
        >
          <ExternalLink size={13} />
        </button>
      </div>

      <span className="text-sm text-white truncate">{entry.authorName}</span>

      <span className="text-xs text-discord-text-muted truncate">
        {entry.guildName ? `${entry.guildName} / ` : ''}#{entry.channelName}
      </span>

      <span className="text-xs text-discord-text-muted shrink-0 ml-auto">
        {timeAgo(entry.timestamp)}
      </span>
    </div>
  );
}
