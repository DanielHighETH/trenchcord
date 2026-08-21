import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '../stores/appStore';
import { X, Trash2, Plus, Check, AlertTriangle, Pause, Play } from 'lucide-react';
import type {
  SnipeConfig, SnipeTrigger, ResnipeMode, LimitSell, LimitSellType, SnipingConfig,
} from '../types';

const SOL_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EMPTY_SNIPING: SnipingConfig = { enabled: false, configs: [] };

const inputCls =
  'bg-discord-dark text-discord-text text-sm px-3 py-2 rounded outline-none focus:ring-1 focus:ring-discord-blurple';
const primaryBtnCls =
  'flex items-center gap-2 px-3 py-2 bg-discord-blurple hover:bg-discord-blurple-hover rounded text-sm text-white transition-colors disabled:opacity-50';
const subtleBtnCls =
  'flex items-center gap-2 px-3 py-2 bg-discord-dark hover:bg-white/5 rounded text-sm text-discord-text transition-colors disabled:opacity-50';
const chipCls = (active: boolean) =>
  `px-3 py-1.5 rounded text-xs font-medium transition-colors ${
    active ? 'bg-discord-blurple text-white' : 'bg-discord-dark text-discord-text-muted hover:text-white'
  }`;

function MiniToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-9 h-5 rounded-full shrink-0 transition-colors ${value ? 'bg-discord-blurple' : 'bg-white/15'}`}
      role="switch"
      aria-checked={value}
    >
      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${value ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  );
}

function freshConfig(roomId: string): SnipeConfig {
  return {
    id: crypto.randomUUID(),
    name: '',
    enabled: true,
    roomId,
    // Specific-users is the safer default: an empty user list can't fire,
    // while whole-room snipes everything.
    mode: 'users',
    users: [],
    solAmount: 0,
    // Deliberately empty: which wallets an auto-buyer spends from is not a
    // default we pick for the user.
    walletIds: [],
    slippage: null,
    tip: null,
    priorityFee: null,
    minMarketCap: null,
    maxMarketCap: null,
    resnipeMode: 'never',
    resnipeCooldownSec: null,
    resnipeMaxCount: null,
    trigger: 'contract',
    keywordMap: [],
    limitSells: [],
    pushoverOnSnipe: false,
    skipIfBought: false,
  };
}

export default function SnipeConfigModal({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  /** null = create a new config. */
  editing: SnipeConfig | null;
  onClose: () => void;
}) {
  const rooms = useAppStore((s) => s.rooms);
  const config = useAppStore((s) => s.config);
  const allMessages = useAppStore((s) => s.messages);
  const updateConfig = useAppStore((s) => s.updateConfig);
  const tradingStatus = useAppStore((s) => s.tradingStatus);
  const setActiveView = useAppStore((s) => s.setActiveView);

  const [cfg, setCfg] = useState<SnipeConfig>(() => freshConfig(''));
  const [userInput, setUserInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const tradingWallets = config?.trading?.wallets ?? [];
  const tradingSlippage = config?.trading?.slippage ?? 20;
  const tradingTip = config?.trading?.tip ?? null;
  const tradingPriorityFee = config?.trading?.priorityFee ?? null;
  const tradingWalletAmountMode = config?.trading?.walletAmountMode ?? 'per_wallet';
  const pushoverEnabled = config?.pushover?.enabled ?? false;
  const pushoverReady = !!config?.pushover?.appToken?.trim() && !!config?.pushover?.userKey?.trim();

  const userNameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (config?.userNameCache) {
      for (const [id, name] of Object.entries(config.userNameCache)) map.set(id, name);
    }
    for (const msgs of Object.values(allMessages)) {
      for (const msg of msgs) map.set(msg.author.id, msg.author.displayName);
    }
    return map;
  }, [allMessages, config?.userNameCache]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setUserInput('');
    setCfg(editing ? JSON.parse(JSON.stringify(editing)) : freshConfig(rooms[0]?.id ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const patch = (changes: Partial<SnipeConfig>) => {
    setCfg((c) => ({ ...c, ...changes }));
    setError(null);
  };

  const persist = (configs: SnipeConfig[]) => {
    const sniping = config?.sniping ?? EMPTY_SNIPING;
    void updateConfig({ sniping: { ...sniping, configs } });
    onClose();
  };

  const save = (extra?: Partial<SnipeConfig>) => {
    const final = { ...cfg, ...extra };
    if (!final.roomId) {
      setError('Pick a room — snipe configs watch rooms.');
      return;
    }
    const existing = config?.sniping?.configs ?? [];
    const exists = existing.some((x) => x.id === final.id);
    persist(exists ? existing.map((x) => (x.id === final.id ? final : x)) : [...existing, final]);
  };

  const remove = () => {
    const existing = config?.sniping?.configs ?? [];
    persist(existing.filter((x) => x.id !== cfg.id));
  };

  const room = rooms.find((r) => r.id === cfg.roomId);
  const cfgWallets = cfg.walletIds.filter((id) => tradingWallets.some((w) => w.id === id));
  const roundSol = (n: number) => Math.round(n * 10000) / 10000;
  const goSettings = (section: string) => {
    onClose();
    setActiveView('settings', section);
  };

  // Legacy configs stored a minutes cooldown with no mode.
  const rMode: ResnipeMode = cfg.resnipeMode ?? (cfg.resnipeCooldownMin != null ? 'cooldown' : 'never');
  const rCooldownSec = cfg.resnipeCooldownSec ?? (cfg.resnipeCooldownMin != null ? cfg.resnipeCooldownMin * 60 : 60);
  const rMax = cfg.resnipeMaxCount ?? 3;

  const addUser = () => {
    const u = userInput.trim();
    if (!u) return;
    if (!cfg.users.includes(u)) patch({ users: [...cfg.users, u] });
    setUserInput('');
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 pt-[var(--safe-top)] pb-[var(--safe-bottom)] animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-discord-sidebar rounded-lg shadow-2xl w-full max-w-xl mx-4 animate-pop-in max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/5">
          <h3 className="text-base font-semibold text-white">
            {editing ? (editing.name || 'Snipe config') : 'New snipe config'}
          </h3>
          <button onClick={onClose} className="text-discord-text-muted hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {(!config?.trading?.enabled || tradingStatus?.configured !== true) && (
            <p className="text-xs text-discord-yellow flex items-start gap-1.5">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              <span>
                Sniping stays inactive until Trading is enabled
                {tradingStatus?.configured !== true ? ' and a Slotshark API token is saved' : ''} in{' '}
                <button onClick={() => goSettings('trading')} className="underline hover:text-white">
                  Settings → Trading
                </button>.
              </span>
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1">
              <label className="text-[11px] text-discord-text-muted mb-1 block">Name</label>
              <input
                type="text"
                value={cfg.name}
                onChange={(e) => patch({ name: e.target.value.slice(0, 40) })}
                placeholder="e.g. Alpha callers"
                autoFocus={!editing}
                className={`${inputCls} w-full`}
              />
            </div>
            <div className="flex-1">
              <label className="text-[11px] text-discord-text-muted mb-1 block">Room</label>
              <select
                value={room ? cfg.roomId : ''}
                onChange={(e) => patch({ roomId: e.target.value })}
                className={`${inputCls} w-full`}
              >
                {!room && <option value="">Select a room…</option>}
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] text-discord-text-muted mb-1 block">Trigger</label>
            <div className="flex gap-2">
              {([['room', 'Whole room'], ['users', 'Specific users']] as ['room' | 'users', string][]).map(([val, label]) => (
                <button key={val} onClick={() => patch({ mode: val })} className={chipCls(cfg.mode === val)}>
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-discord-text-muted mt-1.5">
              {cfg.mode === 'room'
                ? 'Any matching message posted in the room fires a buy.'
                : 'Only messages from the users below fire a buy.'}
            </p>
          </div>

          {cfg.mode === 'users' && (
            <div>
              <label className="text-[11px] text-discord-text-muted mb-1 block">Users</label>
              {cfg.users.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {cfg.users.map((u) => (
                    <span key={u} className="flex items-center gap-1 px-2 py-1 bg-discord-dark rounded text-xs text-discord-text">
                      {userNameMap.get(u) ?? u}
                      <button
                        onClick={() => patch({ users: cfg.users.filter((x) => x !== u) })}
                        className="text-discord-text-muted hover:text-discord-red"
                        title="Remove user"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addUser(); }}
                  placeholder="User ID or @username"
                  className={`${inputCls} flex-1`}
                />
                <button
                  onClick={addUser}
                  className="px-3 py-2 rounded bg-discord-blurple hover:bg-discord-blurple/80 text-white transition-colors shrink-0 flex items-center justify-center"
                  title="Add user"
                >
                  <Plus size={16} />
                </button>
              </div>
              <p className="text-[11px] text-discord-text-muted mt-1.5">
                Same matching as highlighted users: a raw user ID, or @username (works for Discord and Telegram).
              </p>
            </div>
          )}

          <div>
            <label className="text-[11px] text-discord-text-muted mb-1 block">What To Buy</label>
            <div className="flex gap-2">
              {([['contract', 'Contracts in messages'], ['keyword', 'Keyword → contract map']] as [SnipeTrigger, string][]).map(([val, label]) => (
                <button key={val} onClick={() => patch({ trigger: val })} className={chipCls((cfg.trigger ?? 'contract') === val)}>
                  {label}
                </button>
              ))}
            </div>
            {(cfg.trigger ?? 'contract') === 'contract' ? (
              <p className="text-[11px] text-discord-text-muted mt-1.5">
                Solana contract addresses found in matching messages are bought.
              </p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {(cfg.keywordMap ?? []).map((km, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={km.keyword}
                      onChange={(e) => {
                        const next = [...(cfg.keywordMap ?? [])];
                        next[i] = { ...km, keyword: e.target.value.slice(0, 64) };
                        patch({ keywordMap: next });
                      }}
                      placeholder="Keyword"
                      className={`${inputCls} w-32`}
                    />
                    <span className="text-discord-text-muted text-xs shrink-0">→</span>
                    <input
                      type="text"
                      value={km.mint}
                      onChange={(e) => {
                        const next = [...(cfg.keywordMap ?? [])];
                        next[i] = { ...km, mint: e.target.value.trim() };
                        patch({ keywordMap: next });
                      }}
                      placeholder="Contract address (mint)"
                      className={`flex-1 min-w-0 bg-discord-dark text-discord-text text-sm font-mono px-3 py-2 rounded outline-none focus:ring-1 ${
                        km.mint && !SOL_ADDRESS_RE.test(km.mint)
                          ? 'ring-1 ring-discord-red focus:ring-discord-red'
                          : 'focus:ring-discord-blurple'
                      }`}
                    />
                    <button
                      onClick={() => patch({ keywordMap: (cfg.keywordMap ?? []).filter((_, x) => x !== i) })}
                      className="text-discord-text-muted hover:text-discord-red transition-colors shrink-0"
                      title="Remove mapping"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => patch({ keywordMap: [...(cfg.keywordMap ?? []), { keyword: '', mint: '' }] })}
                  disabled={(cfg.keywordMap ?? []).length >= 50}
                  className="px-3 py-1.5 rounded text-xs font-medium bg-discord-dark text-discord-text-muted hover:text-white disabled:opacity-40 transition-colors flex items-center gap-1.5"
                >
                  <Plus size={12} /> Add keyword
                </button>
                <p className="text-[11px] text-discord-text-muted">
                  When a matching message contains a keyword (whole word, any casing — including in
                  embeds and bot panels), the mapped contract is bought, even though the message
                  itself carries no address. Re-snipe rules below apply per token.
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="text-[11px] text-discord-text-muted mb-1 block">Buy Amount</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={cfg.solAmount || ''}
                onChange={(e) => patch({ solAmount: Number(e.target.value) })}
                className={`${inputCls} w-28`}
              />
              <span className="text-xs text-discord-text-muted">SOL</span>
            </div>
          </div>

          <div>
            <label className="text-[11px] text-discord-text-muted mb-1 block">Wallets</label>
            {tradingWallets.length === 0 ? (
              <p className="text-xs text-discord-yellow flex items-center gap-1.5">
                <AlertTriangle size={12} /> No wallets configured — add one in{' '}
                <button onClick={() => goSettings('trading')} className="underline hover:text-white">Settings → Trading</button> first.
              </p>
            ) : (
              <div className="space-y-1.5">
                {tradingWallets.map((w) => {
                  const ticked = cfg.walletIds.includes(w.id);
                  return (
                    <div key={w.id} className="flex items-center gap-2 px-3 py-2 bg-discord-dark rounded">
                      <button
                        onClick={() => patch({
                          walletIds: ticked ? cfg.walletIds.filter((id) => id !== w.id) : [...cfg.walletIds, w.id],
                        })}
                        className={`w-4 h-4 rounded shrink-0 transition-colors flex items-center justify-center ${
                          ticked ? 'bg-discord-blurple text-white' : 'bg-discord-input hover:bg-discord-text-muted/40'
                        }`}
                        title={ticked ? 'This snipe buys from this wallet' : 'Click to snipe from this wallet'}
                      >
                        {ticked && <Check size={11} strokeWidth={3} />}
                      </button>
                      <span className={`text-sm truncate max-w-[8rem] ${ticked ? 'text-white' : 'text-discord-text-muted'}`}>
                        {w.label || 'Wallet'}
                      </span>
                      <span className="flex-1 min-w-0 font-mono text-xs text-discord-text-muted truncate" title={w.address}>
                        {w.address.slice(0, 6)}…{w.address.slice(-4)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            {tradingWallets.length > 0 && cfgWallets.length === 0 && (
              <p className="text-xs text-discord-yellow mt-1.5 flex items-center gap-1.5">
                <AlertTriangle size={12} /> No wallets ticked — this config can never fire.
              </p>
            )}
            {cfgWallets.length > 1 && (
              <p className="text-[11px] text-discord-text-muted mt-1.5">
                {tradingWalletAmountMode === 'per_wallet'
                  ? `Per-wallet mode (from Trading settings): each ticked wallet buys ${cfg.solAmount || 0} SOL — ${roundSol((cfg.solAmount || 0) * cfgWallets.length)} SOL in total.`
                  : `Split mode (from Trading settings): ${cfg.solAmount || 0} SOL is divided across the ${cfgWallets.length} ticked wallets.`}
              </p>
            )}
          </div>

          <div>
            <label className="text-[11px] text-discord-text-muted mb-1 block">Execution (blank = use Trading defaults)</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="text-[11px] text-discord-text-muted mb-1 block">Slippage %</label>
                <input
                  type="number" min="1" max="10000" step="1" inputMode="numeric"
                  value={cfg.slippage ?? ''}
                  onChange={(e) => patch({ slippage: e.target.value === '' ? null : Number(e.target.value) })}
                  placeholder={String(tradingSlippage)}
                  className={`${inputCls} w-full`}
                />
              </div>
              <div>
                <label className="text-[11px] text-discord-text-muted mb-1 block">Tip (SOL)</label>
                <input
                  type="number" min="0" max="1" step="0.0001" inputMode="decimal"
                  value={cfg.tip ?? ''}
                  onChange={(e) => patch({ tip: e.target.value === '' ? null : Number(e.target.value) })}
                  placeholder={tradingTip !== null ? String(tradingTip) : 'Auto'}
                  className={`${inputCls} w-full`}
                />
              </div>
              <div>
                <label className="text-[11px] text-discord-text-muted mb-1 block">Priority Fee (SOL)</label>
                <input
                  type="number" min="0" max="1" step="0.0001" inputMode="decimal"
                  value={cfg.priorityFee ?? ''}
                  onChange={(e) => patch({ priorityFee: e.target.value === '' ? null : Number(e.target.value) })}
                  placeholder={tradingPriorityFee !== null ? String(tradingPriorityFee) : 'Auto'}
                  className={`${inputCls} w-full`}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-[11px] text-discord-text-muted mb-1 block">Market Cap Bounds (USD, blank = no bound)</label>
            <div className="flex items-center gap-2">
              <input
                type="number" min="0" step="1000" inputMode="decimal"
                value={cfg.minMarketCap ?? ''}
                onChange={(e) => patch({ minMarketCap: e.target.value === '' ? null : Number(e.target.value) })}
                placeholder="Min"
                className={`${inputCls} w-32`}
              />
              <span className="text-xs text-discord-text-muted">to</span>
              <input
                type="number" min="0" step="1000" inputMode="decimal"
                value={cfg.maxMarketCap ?? ''}
                onChange={(e) => patch({ maxMarketCap: e.target.value === '' ? null : Number(e.target.value) })}
                placeholder="Max"
                className={`${inputCls} w-32`}
              />
            </div>
            <p className="text-[11px] text-discord-text-muted mt-1.5">
              Sent with the buy and enforced by Slotshark at execution time.
            </p>
          </div>

          <div>
            <label className="text-[11px] text-discord-text-muted mb-1 block">Re-snipe</label>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex gap-1 flex-wrap">
                {([
                  ['never', 'Never re-snipe'],
                  ['cooldown', 'After cooldown'],
                  ['limit', 'Up to X times'],
                ] as [ResnipeMode, string][]).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => patch({
                      resnipeMode: val,
                      ...(val === 'cooldown' ? { resnipeCooldownSec: rCooldownSec } : {}),
                      ...(val === 'limit' ? { resnipeMaxCount: rMax } : {}),
                    })}
                    className={chipCls(rMode === val)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {rMode === 'cooldown' && (
                <>
                  <input
                    type="number" min="1" step="1" inputMode="numeric"
                    value={rCooldownSec}
                    onChange={(e) => patch({ resnipeMode: 'cooldown', resnipeCooldownSec: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
                    className={`${inputCls} w-24`}
                  />
                  <span className="text-xs text-discord-text-muted">seconds</span>
                </>
              )}
              {rMode === 'limit' && (
                <>
                  <input
                    type="number" min="1" max="100" step="1" inputMode="numeric"
                    value={rMax}
                    onChange={(e) => patch({ resnipeMode: 'limit', resnipeMaxCount: Math.min(100, Math.max(1, Math.round(Number(e.target.value) || 1))) })}
                    className={`${inputCls} w-20`}
                  />
                  <span className="text-xs text-discord-text-muted">snipes per token</span>
                </>
              )}
            </div>
            <p className="text-[11px] text-discord-text-muted mt-1.5">
              {rMode === 'never'
                ? 'A token is only ever sniped once, even if it is reposted.'
                : rMode === 'cooldown'
                  ? 'A reposted token buys again once the cooldown has passed since the last snipe.'
                  : `Each new post of a token buys again, up to ${rMax} time${rMax === 1 ? '' : 's'} total for that token — then it's done.`}
              {' '}The same message never fires twice, whatever the mode.
            </p>
          </div>

          <div>
            <label className="text-[11px] text-discord-text-muted mb-1 block">Skip If Already Bought</label>
            <div className="flex items-center gap-2">
              <MiniToggle value={cfg.skipIfBought ?? false} onChange={(v) => patch({ skipIfBought: v })} />
              <span className="text-sm text-discord-text">Don't buy tokens the wallet already holds</span>
            </div>
            <p className="text-[11px] text-discord-text-muted mt-1.5">
              Checked by Slotshark at execution time, per wallet — if the wallet already holds the
              token (from any snipe, manual buy, or another config), the buy is skipped instead of
              stacking a second position.
            </p>
          </div>

          <div>
            <label className="text-[11px] text-discord-text-muted mb-1 block">Limit Sells</label>
            {cfg.limitSells.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {cfg.limitSells.map((ls, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 bg-discord-dark rounded">
                    <select
                      value={ls.type}
                      onChange={(e) => {
                        const next = [...cfg.limitSells];
                        next[i] = { ...ls, type: e.target.value as LimitSellType };
                        patch({ limitSells: next });
                      }}
                      className="bg-discord-input text-discord-text text-xs px-2 py-1.5 rounded outline-none"
                    >
                      <option value="time">Time after buy</option>
                      <option value="pnl">PnL</option>
                    </select>
                    <input
                      type="number" step="1" inputMode="decimal"
                      value={ls.value}
                      onChange={(e) => {
                        const next = [...cfg.limitSells];
                        next[i] = { ...ls, value: Number(e.target.value) };
                        patch({ limitSells: next });
                      }}
                      className="w-20 bg-discord-input text-discord-text text-xs px-2 py-1.5 rounded outline-none"
                      title={ls.type === 'time' ? 'Seconds after the buy' : 'Profit/loss % (negative = stop loss)'}
                    />
                    <span className="text-[10px] text-discord-text-muted">{ls.type === 'time' ? 'sec' : '%'}</span>
                    <span className="text-[10px] text-discord-text-muted">sell</span>
                    <input
                      type="number" min="1" max="100" step="1" inputMode="numeric"
                      value={ls.sellPercent}
                      onChange={(e) => {
                        const next = [...cfg.limitSells];
                        next[i] = { ...ls, sellPercent: Number(e.target.value) };
                        patch({ limitSells: next });
                      }}
                      className="w-16 bg-discord-input text-discord-text text-xs px-2 py-1.5 rounded outline-none"
                      title="Percent of the position to sell"
                    />
                    <span className="text-[10px] text-discord-text-muted">%</span>
                    <input
                      type="number" min="0" max="1" step="0.0001" inputMode="decimal"
                      value={ls.tip ?? ''}
                      onChange={(e) => {
                        const next = [...cfg.limitSells];
                        next[i] = { ...ls, tip: e.target.value === '' ? null : Number(e.target.value) };
                        patch({ limitSells: next });
                      }}
                      placeholder="Tip"
                      className="w-20 bg-discord-input text-discord-text text-xs px-2 py-1.5 rounded outline-none"
                      title="Tip in SOL — blank = auto"
                    />
                    <input
                      type="number" min="0" max="1" step="0.0001" inputMode="decimal"
                      value={ls.priorityFee ?? ''}
                      onChange={(e) => {
                        const next = [...cfg.limitSells];
                        next[i] = { ...ls, priorityFee: e.target.value === '' ? null : Number(e.target.value) };
                        patch({ limitSells: next });
                      }}
                      placeholder="Prio"
                      className="w-20 bg-discord-input text-discord-text text-xs px-2 py-1.5 rounded outline-none"
                      title="Priority fee in SOL — blank = auto"
                    />
                    <button
                      onClick={() => patch({ limitSells: cfg.limitSells.filter((_, j) => j !== i) })}
                      className="ml-auto text-discord-text-muted hover:text-discord-red transition-colors shrink-0"
                      title="Remove limit sell"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => {
                const row: LimitSell = { type: 'pnl', value: 100, sellPercent: 100, tip: null, priorityFee: null };
                patch({ limitSells: [...cfg.limitSells, row] });
              }}
              disabled={cfg.limitSells.length >= 10}
              className="px-3 py-1.5 rounded text-xs font-medium bg-discord-dark text-discord-text-muted hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
            >
              <Plus size={13} /> Add limit sell
            </button>
            <p className="text-[11px] text-discord-text-muted mt-1.5">
              Sell orders scheduled with the buy. Time fires once after that many seconds; PnL
              triggers at a profit (positive) or loss (negative) percentage. Blank tip/priority fee
              = auto.
            </p>
          </div>

          <div>
            <label className="text-[11px] text-discord-text-muted mb-1 block">Phone Notification</label>
            <div className="flex items-center gap-2">
              <MiniToggle value={cfg.pushoverOnSnipe ?? false} onChange={(v) => patch({ pushoverOnSnipe: v })} />
              <span className="text-sm text-discord-text">Pushover notification when this config snipes</span>
            </div>
            <p className="text-[11px] text-discord-text-muted mt-1.5">
              Sends the result of every snipe this config fires (bought or failed) to your phone,
              using the credentials and sound from Settings → Pushover.
            </p>
            {(cfg.pushoverOnSnipe ?? false) && !pushoverEnabled && (
              <p className="text-xs text-discord-yellow mt-2 flex items-start gap-1.5">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                <span>
                  Pushover is disabled in{' '}
                  <button onClick={() => goSettings('pushover')} className="underline hover:text-white">
                    Settings → Pushover
                  </button>
                  {' '}— enable it there or no snipe notification will be sent.
                </span>
              </p>
            )}
            {(cfg.pushoverOnSnipe ?? false) && pushoverEnabled && !pushoverReady && (
              <p className="text-xs text-discord-yellow mt-2 flex items-start gap-1.5">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                <span>
                  Pushover is missing its Application API Token and/or User Key — add them in{' '}
                  <button onClick={() => goSettings('pushover')} className="underline hover:text-white">
                    Settings → Pushover
                  </button>
                  {' '}or nothing can be sent.
                </span>
              </p>
            )}
          </div>

          {error && <p className="text-xs text-discord-red">{error}</p>}
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-t border-white/5">
          {editing ? (
            <>
              <button onClick={() => save()} className={primaryBtnCls}>Save</button>
              <button onClick={() => save({ enabled: !cfg.enabled })} className={subtleBtnCls}>
                {cfg.enabled ? <Pause size={14} /> : <Play size={14} />} {cfg.enabled ? 'Pause' : 'Resume'}
              </button>
              <button
                onClick={remove}
                className="ml-auto flex items-center gap-2 px-3 py-2 bg-discord-red/15 hover:bg-discord-red/25 rounded text-sm text-discord-red transition-colors"
              >
                <Trash2 size={14} /> Delete
              </button>
            </>
          ) : (
            <button onClick={() => save()} className={primaryBtnCls}>
              <Plus size={14} /> Create config
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
