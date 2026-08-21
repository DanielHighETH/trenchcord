import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Hash, AtSign, Tag, Crosshair, BellRing, FileText, Settings, Plus, Search,
  ChevronDown, Send, HelpCircle, LayoutGrid,
} from 'lucide-react';

type Chain = 'SOL' | 'EVM';

interface Author {
  id: string;
  name: string;
  /** avatar circle background */
  color: string;
  /** Discord role color for the name */
  roleColor?: string;
}

interface Msg {
  id: string;
  a: Author;
  time: string;
  text: string;
  /** Discord source badge: [server, #channel] */
  src?: [string, string];
  /** Telegram message (source chip becomes TG-blue) */
  tg?: boolean;
  /** detected contract address, rendered as a colored clickable pill */
  ca?: { text: string; chain: Chain };
  /** matched keyword badge */
  keyword?: string;
  /** reply preview: [author, text] */
  reply?: [string, string];
  /** inline link rendered Discord-blue after the text */
  link?: { text: string; href: string };
}

const alander: Author = { id: 'alander', name: 'alander', color: '#0f766e', roleColor: '#2dd4bf' };
const kite: Author = { id: 'kite', name: 'kite', color: '#1d4ed8', roleColor: '#60a5fa' };
const helikopter: Author = { id: 'helikopter', name: 'Helikopter', color: '#be185d', roleColor: '#f472b6' };
const mana: Author = { id: 'mana', name: 'Mana', color: '#7c3aed' };
const whale: Author = { id: 'whale', name: 'whale_tracker', color: '#5865f2', roleColor: '#5865f2' };
const sniper: Author = { id: 'sniper', name: 'alpha_sniper', color: '#23a559', roleColor: '#4ade80' };
const carl: Author = { id: 'carl', name: 'degen_carl', color: '#b45309', roleColor: '#fbbf24' };
const bigliq: Author = { id: 'bigliq', name: 'big_liq', color: '#6d28d9', roleColor: '#a78bfa' };
const david: Author = { id: 'david', name: 'David', color: '#2AABEE', roleColor: '#2AABEE' };
const daniW: Author = { id: 'daniw', name: 'DaniWorldwide', color: '#c2410c', roleColor: '#fb923c' };
const owari: Author = { id: 'owari', name: 'Owari', color: '#a21caf', roleColor: '#e879f9' };
const lunarfang: Author = { id: 'lunarfang', name: 'lunarfang', color: '#0369a1', roleColor: '#38bdf8' };
const pepc: Author = { id: 'pepc', name: 'PepcRuddy', color: '#b91c1c', roleColor: '#f87171' };
const niczzy: Author = { id: 'niczzy', name: 'Niczzy', color: '#047857', roleColor: '#34d399' };
const nocommas: Author = { id: 'nocommas', name: 'nocommas', color: '#4b5563' };
const yau: Author = { id: 'yau', name: 'yau', color: '#a16207', roleColor: '#facc15' };
const daniel: Author = { id: 'daniel', name: 'Daniel', color: '#7e22ce', roleColor: '#c084fc' };

const MAIN_START: Msg[] = [
  { id: 'm1', a: alander, time: 'Today at 12:17 AM', src: ['WAGMI DAO', 'wagmi-general'], keyword: 'mushu', text: 'he was saying that change bought mushu when hes has 1k txs on the chart' },
  { id: 'm2', a: pepc, time: 'Today at 12:17 AM', src: ['WAGMI DAO', 'wagmi-general'], text: 'who bought the dip say gm' },
  { id: 'm3', a: kite, time: 'Today at 12:17 AM', src: ['WAGMI DAO', 'wagmi-general'], text: 'bro i forgot ts went 25mm' },
  { id: 'm4', a: daniW, time: 'Today at 12:18 AM', src: ['Prosperity DAO', 'alpha'], text: 'insiders been loading this all week' },
  { id: 'm5', a: helikopter, time: 'Today at 12:18 AM', src: ['Prosperity DAO', 'alpha'], reply: ['Bogdanoff', 'im on yau’s side'], text: 'should just flip their roles' },
  { id: 'm6', a: yau, time: 'Today at 12:18 AM', src: ['WAGMI DAO', 'wagmi-general'], text: 'flip my role then, i still called it first' },
  { id: 'm7', a: mana, time: 'Today at 12:18 AM', src: ['Prosperity DAO', 'alpha'], text: 'the uni dev deployed it' },
  { id: 'm8', a: owari, time: 'Today at 12:19 AM', src: ['Prosperity DAO', 'alpha'], text: 'someone timestamp this call' },
  { id: 'm9', a: niczzy, time: 'Today at 12:19 AM', src: ['WAGMI DAO', 'wagmi-general'], text: 'entry was clean ngl' },
  { id: 'm10', a: daniel, time: 'Today at 12:19 AM', src: ['WAGMI DAO', 'wagmi-general'], text: 'sniped it straight from the feed lol' },
  { id: 'm11', a: whale, time: 'Today at 12:19 AM', src: ['Degen Central', 'calls'], text: 'lp burned, dev sold nothing — sending it', ca: { text: '4k2P…pump', chain: 'SOL' } },
];

const LIVE_POOL: Omit<Msg, 'id' | 'time'>[] = [
  { a: helikopter, src: ['Prosperity DAO', 'alpha'], text: 'yau for mod' },
  { a: sniper, src: ['Degen Central', 'calls'], text: 'new CA just dropped on pump.fun', ca: { text: '7xKQ…pump', chain: 'SOL' } },
  { a: nocommas, src: ['WAGMI DAO', 'wagmi-general'], text: 'ok adding this to the watchlist' },
  { a: lunarfang, src: ['Prosperity DAO', 'alpha'], text: 'dev wallet just moved, watch close' },
  { a: kite, src: ['WAGMI DAO', 'wagmi-general'], text: 'chart looks ready for round 2' },
  { a: carl, src: ['ETH Bunker', 'eth-calls'], text: 'up 340% in 2h and still cooking', ca: { text: '0x1a2b…f3d4', chain: 'EVM' } },
  { a: pepc, src: ['WAGMI DAO', 'wagmi-general'], text: 'lfg candle just went vertical' },
  { a: whale, src: ['Degen Central', 'calls'], text: 'adding more, this is the play' },
  { a: daniW, src: ['Prosperity DAO', 'alpha'], text: 'not selling till 100m' },
  { a: mana, src: ['Prosperity DAO', 'alpha'], text: 'volume picking up again' },
  { a: yau, src: ['WAGMI DAO', 'wagmi-general'], text: 'mod material, told you' },
  { a: daniel, src: ['WAGMI DAO', 'wagmi-general'], text: 'one click and im in' },
];

const ROOM_FEEDS: Record<string, Msg[]> = {
  'sol-calls': [
    { id: 's1', a: sniper, time: 'Today at 2:14 PM', src: ['Degen Central', 'calls'], text: 'New CA just dropped on pump.fun', ca: { text: '7xKQ…pump', chain: 'SOL' } },
    { id: 's2', a: whale, time: 'Today at 2:14 PM', src: ['Pump Radar', 'launches'], text: 'dev doxxed, lp burned — sending it', ca: { text: '9xKP…x7f2', chain: 'SOL' } },
    { id: 's3', a: mana, time: 'Today at 2:16 PM', src: ['Pump Radar', 'launches'], text: '0% tax, looks clean' },
  ],
  'eth-alpha': [
    { id: 'e1', a: carl, time: 'Today at 1:52 PM', src: ['ETH Bunker', 'eth-calls'], text: 'up 340% in 2h', ca: { text: '0x1a2b…f3d4', chain: 'EVM' } },
    { id: 'e2', a: bigliq, time: 'Today at 1:55 PM', src: ['ETH Bunker', 'eth-calls'], text: 'adding to my bag here' },
  ],
  'tg-david': [
    { id: 'd1', a: david, time: 'Today at 3:02 PM', tg: true, text: 'yo check this before it runs' },
    { id: 'd2', a: david, time: 'Today at 3:02 PM', tg: true, text: 'insiders loading since yesterday', ca: { text: 'B4tR…moon', chain: 'SOL' } },
    { id: 'd3', a: david, time: 'Today at 3:04 PM', tg: true, text: 'look at this solana bot bro its the fastest fills ive seen', link: { text: 'slotshark.xyz', href: 'https://slotshark.xyz/?ref=1q79wsl2' } },
    { id: 'd4', a: david, time: 'Today at 3:04 PM', tg: true, text: 'one click buys straight from the feed, stop tabbing out to a browser' },
    { id: 'd5', a: david, time: 'Today at 3:05 PM', tg: true, text: 'dont fade this one' },
  ],
};

const ROOMS = [
  { id: 'main', name: 'main', channels: 4 },
  { id: 'sol-calls', name: 'sol-calls', channels: 3 },
  { id: 'eth-alpha', name: 'eth-alpha', channels: 2 },
];

const FEEDS = [
  { icon: FileText, label: 'Contracts', count: '24' },
  { icon: AtSign, label: 'Mentions' },
  { icon: Tag, label: 'Keywords', badge: 1 },
  { icon: Crosshair, label: 'Snipes' },
  { icon: BellRing, label: 'Alerts' },
];

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-dc-blurple text-white text-[10px] font-bold leading-none shrink-0">
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function HeroMockup() {
  const [active, setActive] = useState('main');
  const [mainFeed, setMainFeed] = useState<Msg[]>(MAIN_START);
  const [unreads, setUnreads] = useState<Record<string, number>>({ 'sol-calls': 2, 'eth-alpha': 1, 'tg-david': 3 });
  const [highlighted, setHighlighted] = useState<Set<string>>(() => new Set([whale.id]));
  const [toast, setToast] = useState<{ key: number; text: string } | null>(null);

  const activeRef = useRef(active);
  activeRef.current = active;
  const scrollRef = useRef<HTMLDivElement>(null);
  const toastKey = useRef(0);

  const showToast = (text: string) => setToast({ key: ++toastKey.current, text });

  // Live ticker: new aggregated messages keep landing in #main, bumping its
  // unread counter whenever the visitor is looking at another room.
  useEffect(() => {
    let n = 0;
    const iv = setInterval(() => {
      if (document.hidden) return;
      const tpl = LIVE_POOL[n % LIVE_POOL.length];
      n += 1;
      const time = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      setMainFeed((f) => [...f, { ...tpl, id: `live-${n}`, time: `Today at ${time}` }].slice(-30));
      if (activeRef.current !== 'main') {
        setUnreads((u) => ({ ...u, main: (u.main ?? 0) + 1 }));
      }
    }, 5000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const feed = active === 'main' ? mainFeed : ROOM_FEEDS[active] ?? [];

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [active, feed.length]);

  const selectRoom = (id: string) => {
    setActive(id);
    setUnreads((u) => ({ ...u, [id]: 0 }));
  };

  const toggleHighlight = (a: Author) => {
    setHighlighted((prev) => {
      const next = new Set(prev);
      if (next.has(a.id)) {
        next.delete(a.id);
        showToast(`${a.name} un-highlighted`);
      } else {
        next.add(a.id);
        showToast(`${a.name} highlighted — their messages now stand out in every room`);
      }
      return next;
    });
  };

  const contractToast = () =>
    showToast('In the app, one click opens this on your trading platform — Axiom, Padre, GMGN…');

  const feedToast = () => showToast('Feeds like this live in the full app — open the live demo to explore');

  const room = ROOMS.find((r) => r.id === active);
  const isTg = active === 'tg-david';

  const roomButton = (id: string, name: string, tg = false) => {
    const isActive = active === id;
    return (
      <button
        key={id}
        onClick={() => selectRoom(id)}
        className={`w-full flex items-center gap-1.5 px-2 py-[5px] rounded text-left transition-colors ${
          isActive
            ? 'bg-dc-hover text-dc-header-primary font-medium'
            : 'text-dc-channel-icon hover:bg-dc-hover/60 hover:text-dc-header-secondary'
        }`}
      >
        {tg ? (
          <Send size={14} className="shrink-0 text-[#2AABEE]" />
        ) : (
          <Hash size={15} className="shrink-0 opacity-70" />
        )}
        <span className="text-[13px] leading-5 truncate flex-1">{name}</span>
        <UnreadBadge count={isActive ? 0 : unreads[id] ?? 0} />
      </button>
    );
  };

  return (
    <div>
      <div className="relative rounded-lg overflow-hidden border border-dc-divider bg-dc-main shadow-xl shadow-black/30 text-left">
        {/* Title bar */}
        <div className="h-8 bg-dc-darker flex items-center px-3 gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
          <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
          <div className="w-3 h-3 rounded-full bg-[#28c840]" />
          <span className="ml-3 text-[11px] text-dc-text-faint">Trenchcord</span>
          <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-dc-blurple/15 text-dc-blurple font-semibold">
            Interactive preview
          </span>
        </div>

        <div className="flex h-[476px]">
          {/* Sidebar */}
          <div className="hidden sm:flex w-52 bg-dc-sidebar border-r border-dc-darker/50 shrink-0 flex-col">
            <div className="h-10 px-3 flex items-center gap-2 border-b border-dc-darker/50 shrink-0">
              <img src="/trenchcord.png" alt="" className="w-5 h-5 rounded" />
              <span className="text-[13px] font-semibold text-dc-header-primary">Trenchcord</span>
              <div className="ml-auto flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-dc-green" title="Discord connected" />
                <div className="w-1.5 h-1.5 rounded-full bg-[#2AABEE]" title="Telegram connected" />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-1.5 pt-2.5">
              {FEEDS.map((f) => (
                <button
                  key={f.label}
                  onClick={feedToast}
                  className="w-full flex items-center gap-1.5 px-2 py-[5px] rounded mb-0.5 text-dc-channel-icon hover:bg-dc-hover/60 hover:text-dc-header-secondary transition-colors text-left"
                >
                  <f.icon size={15} className="shrink-0 opacity-70" />
                  <span className="text-[13px] leading-5 truncate flex-1">{f.label}</span>
                  {f.count && <span className="text-[10px] text-dc-text-muted">{f.count}</span>}
                  {f.badge && <UnreadBadge count={f.badge} />}
                </button>
              ))}

              <div className="flex items-center justify-between px-2 mt-2.5 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wide text-dc-channel-icon">Rooms</span>
                <Plus size={13} className="text-dc-text-muted" />
              </div>
              {ROOMS.map((r) => roomButton(r.id, r.name))}

              <div className="px-2 mt-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wide text-[#2AABEE]">Telegram DMs</span>
              </div>
              {roomButton('tg-david', 'David', true)}
            </div>

            <div className="px-2 py-1.5 shrink-0">
              <a
                href="https://discord.gg/cDhrRVZ9xg"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium text-white bg-dc-blurple hover:bg-dc-blurple-hover transition-colors"
              >
                <svg width="13" height="13" viewBox="0 0 127.14 96.36" fill="currentColor" aria-hidden="true">
                  <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z" />
                </svg>
                Join Discord
              </a>
            </div>
            <div className="h-9 px-2 flex items-center gap-1 border-t border-dc-darker/40 shrink-0 text-dc-header-secondary">
              <span className="flex items-center gap-1.5 px-1.5 text-[12px]">
                <Settings size={13} /> Settings
              </span>
              <span className="ml-auto flex items-center gap-2 pr-1">
                <LayoutGrid size={12} className="opacity-70" />
                <HelpCircle size={12} className="opacity-70" />
              </span>
            </div>
          </div>

          {/* Chat column */}
          <div className="flex-1 min-w-0 flex flex-col">
            {/* Mobile room switcher */}
            <div className="sm:hidden flex gap-1 px-2 py-1.5 bg-dc-sidebar border-b border-dc-darker/50 overflow-x-auto">
              {[...ROOMS.map((r) => ({ id: r.id, name: r.name, tg: false })), { id: 'tg-david', name: 'David', tg: true }].map((r) => (
                <button
                  key={r.id}
                  onClick={() => selectRoom(r.id)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded text-[12px] whitespace-nowrap shrink-0 transition-colors ${
                    active === r.id ? 'bg-dc-hover text-white' : 'text-dc-text-muted'
                  }`}
                >
                  {r.tg ? <Send size={11} className="text-[#2AABEE]" /> : <Hash size={12} className="opacity-60" />}
                  {r.name}
                  {active !== r.id && (unreads[r.id] ?? 0) > 0 && <UnreadBadge count={unreads[r.id]} />}
                </button>
              ))}
            </div>

            {/* Channel header */}
            <div className="h-10 border-b border-dc-dark/60 flex items-center px-3 gap-1.5 shrink-0">
              {isTg ? (
                <Send size={16} className="text-[#2AABEE] shrink-0" />
              ) : (
                <Hash size={17} className="text-dc-channel-icon shrink-0" />
              )}
              <span className="text-[14px] font-semibold text-dc-header-primary truncate">
                {isTg ? 'David' : room?.name}
              </span>
              <ChevronDown size={13} className="text-dc-channel-icon shrink-0" />
              {!isTg && room && (
                <span className="text-[12px] text-dc-header-secondary hidden md:inline ml-1">
                  {room.channels} channels
                </span>
              )}
              <div className="ml-auto flex items-center gap-1.5">
                {highlighted.size > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-dc-blurple/20 text-dc-blurple whitespace-nowrap">
                    {highlighted.size} highlighted
                  </span>
                )}
                <Search size={14} className="text-dc-channel-icon hidden sm:block" />
                <Settings size={14} className="text-dc-channel-icon hidden sm:block" />
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto py-2">
              <AnimatePresence initial={false}>
                {feed.map((msg) => {
                  const hl = highlighted.has(msg.a.id);
                  return (
                    <motion.div
                      key={`${active}-${msg.id}`}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25 }}
                      className={`relative flex items-start gap-2.5 px-3 py-[5px] hover:bg-dc-hover/40 transition-colors border-l-2 ${
                        hl ? 'border-dc-blurple bg-dc-highlight' : 'border-transparent'
                      }`}
                    >
                      <div
                        className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold text-white mt-0.5"
                        style={{ backgroundColor: msg.a.color }}
                      >
                        {msg.a.name[0].toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap leading-[18px]">
                          <button
                            onClick={() => toggleHighlight(msg.a)}
                            className="text-[13px] font-semibold hover:underline"
                            style={{ color: hl ? '#5865f2' : msg.a.roleColor ?? '#f2f3f5' }}
                            title={hl ? 'Click to un-highlight' : 'Click to highlight this user'}
                          >
                            {msg.a.name}
                          </button>
                          <span className="text-[10px] text-dc-text-faint">{msg.time}</span>
                          {msg.src && (
                            <span className="text-[10px] px-1.5 py-px rounded bg-dc-sidebar text-dc-text-muted font-medium truncate max-w-[180px]">
                              {msg.src[0]} / #{msg.src[1]}
                            </span>
                          )}
                          {msg.tg && (
                            <span className="text-[10px] px-1.5 py-px rounded bg-[#2AABEE]/10 text-[#2AABEE] font-medium">
                              TG &middot; David
                            </span>
                          )}
                          {msg.ca && (
                            <button
                              onClick={contractToast}
                              className="text-[9px] px-1.5 py-px rounded bg-dc-yellow/20 text-dc-evm font-semibold hover:bg-dc-yellow/30 transition-colors"
                            >
                              CONTRACT
                            </button>
                          )}
                          {msg.keyword && (
                            <span className="text-[9px] px-1.5 py-px rounded bg-orange-400/20 text-orange-400 font-semibold">
                              {msg.keyword}
                            </span>
                          )}
                        </div>
                        {msg.reply && (
                          <div className="flex items-center gap-1.5 text-[11px] text-dc-text-muted mt-0.5 min-w-0">
                            <div className="w-5 h-2 border-l-2 border-t-2 border-dc-text-faint/40 rounded-tl ml-1.5 shrink-0" />
                            <span className="font-medium shrink-0">{msg.reply[0]}</span>
                            <span className="truncate opacity-70">{msg.reply[1]}</span>
                          </div>
                        )}
                        <p className="text-[13px] text-dc-text leading-[18px] mt-px break-words">
                          {msg.text}
                          {msg.link && (
                            <a
                              href={msg.link.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-1.5 text-[#00a8fc] hover:underline"
                            >
                              {msg.link.text}
                            </a>
                          )}
                          {msg.ca && (
                            <button
                              onClick={contractToast}
                              className={`ml-1.5 font-medium hover:underline ${
                                msg.ca.chain === 'SOL' ? 'text-dc-solana' : 'text-dc-evm'
                              }`}
                              title="Open on your trading platform"
                            >
                              {msg.ca.text}
                            </button>
                          )}
                          {msg.ca && (
                            <span
                              className={`inline-flex items-center ml-1.5 px-1 py-px rounded text-[9px] font-semibold align-[1px] ${
                                msg.ca.chain === 'SOL' ? 'bg-[#14f195]/10 text-dc-solana' : 'bg-[#fee75c]/10 text-dc-evm'
                              }`}
                            >
                              {msg.ca.chain}
                            </span>
                          )}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>

            {/* Input bar */}
            <div className="px-3 pb-3 pt-1 shrink-0">
              <div className="flex items-center gap-2 rounded-lg bg-dc-input px-3 py-2">
                <Plus size={15} className="text-dc-text-muted shrink-0" />
                <span className="text-[13px] text-dc-text-faint truncate">
                  {isTg ? 'Message David' : 'Select a channel to message'}
                </span>
                <Hash size={14} className="ml-auto text-dc-text-faint shrink-0" />
                <Send size={14} className="text-dc-text-faint shrink-0" />
              </div>
            </div>
          </div>
        </div>

        {/* Toast */}
        <div className="absolute bottom-16 inset-x-0 z-20 flex justify-center pointer-events-none">
          <AnimatePresence>
            {toast && (
              <motion.div
                key={toast.key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.18 }}
                className="max-w-[85%] px-3 py-1.5 rounded-md bg-dc-darker/95 border border-dc-divider text-[12px] text-dc-text shadow-lg text-center"
              >
                {toast.text}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <p className="mt-3 text-center text-xs text-dc-text-faint">
        This preview is clickable — switch rooms, click a username to highlight them, click a contract.
        New messages keep flowing into <span className="text-dc-text-muted">#main</span>.
      </p>
    </div>
  );
}
