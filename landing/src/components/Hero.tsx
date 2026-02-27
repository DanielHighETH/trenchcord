import { motion } from 'framer-motion';
import { AnimatedSection } from './AnimatedSection';
import { Hash, AtSign } from 'lucide-react';

interface MockMsg {
  author: string;
  avatar: string;
  text: string;
  time: string;
  isContract?: boolean;
  chain?: string;
  isHighlighted?: boolean;
}

interface MockGroup {
  channel: { name: string; type: 'channel' | 'dm' };
  messages: MockMsg[];
}

const mockMessages: MockGroup[] = [
  {
    channel: { name: 'sol-calls', type: 'channel' },
    messages: [
      { author: 'alpha_sniper', avatar: '#23a559', text: 'New CA just dropped on pump.fun', time: 'Today at 2:14 PM' },
      { author: 'whale_tracker', avatar: '#5865f2', text: 'pump.fun/coin/...x7f2', time: 'Today at 2:14 PM', isContract: true, chain: 'SOL' },
    ],
  },
  {
    channel: { name: 'eth-alpha', type: 'channel' },
    messages: [
      { author: 'degen_carl', avatar: '#f23f43', text: '0x1a2b...f3d4 — up 340% in 2h', time: 'Today at 1:52 PM', isContract: true, chain: 'EVM' },
    ],
  },
  {
    channel: { name: 'whale_tracker', type: 'dm' },
    messages: [
      { author: 'whale_tracker', avatar: '#5865f2', text: 'Just aped into this one, check $TRENCHCORD', time: 'Today at 1:30 PM', isHighlighted: true },
    ],
  },
];

export function Hero() {
  return (
    <section className="relative flex flex-col items-center pt-24 pb-16 sm:pt-28 sm:pb-20 overflow-hidden">
      <div className="relative z-10 mx-auto max-w-4xl px-6 text-center">
        <AnimatedSection delay={0.1}>
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white pb-2">
            Trenchcord
          </h1>
        </AnimatedSection>

        <AnimatedSection delay={0.2}>
          <p className="mt-4 text-lg sm:text-xl text-dc-text-muted max-w-2xl mx-auto leading-relaxed">
            Your Discord, Supercharged for Trenching
          </p>
        </AnimatedSection>

        <AnimatedSection delay={0.3}>
          <p className="mt-3 text-sm text-dc-text-faint max-w-xl mx-auto">
            Aggregate channels, track key users, auto-detect contracts,
            and trade in one click — all from a single dashboard.
          </p>
        </AnimatedSection>

        <AnimatedSection delay={0.4}>
          <a
            href="#tutorial"
            onClick={(e) => {
              e.preventDefault();
              document.querySelector('#tutorial')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="mt-8 inline-flex items-center gap-2 px-6 py-2.5 rounded bg-dc-blurple text-white font-medium text-sm hover:bg-dc-blurple-hover transition-colors"
          >
            Get Started
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-px">
              <path d="M8 3L13 8L8 13M13 8H3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </AnimatedSection>
      </div>

      {/* Discord-style message preview */}
      <AnimatedSection delay={0.5} className="w-full max-w-3xl mx-auto mt-12 px-6">
        <div className="rounded-lg overflow-hidden border border-dc-divider bg-dc-dark shadow-xl shadow-black/30">
          {/* Title bar */}
          <div className="h-8 bg-dc-darker flex items-center px-3 gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <div className="w-3 h-3 rounded-full bg-[#28c840]" />
            <span className="ml-3 text-[11px] text-dc-text-faint">Trenchcord</span>
          </div>

          <div className="flex">
            {/* Mini sidebar */}
            <div className="hidden sm:block w-48 bg-dc-sidebar border-r border-dc-divider p-2 shrink-0">
              <div className="text-[10px] font-semibold text-dc-text-faint uppercase tracking-wide px-1.5 mb-1.5">Rooms</div>
              {mockMessages.map((m, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-1.5 px-1.5 py-1 rounded text-[13px] ${
                    i === 0 ? 'bg-dc-hover text-white' : 'text-dc-text-muted'
                  }`}
                >
                  {m.channel.type === 'dm' ? (
                    <AtSign size={14} className="text-dc-channel-icon shrink-0" />
                  ) : (
                    <Hash size={14} className="text-dc-channel-icon shrink-0" />
                  )}
                  <span className="truncate">{m.channel.name}</span>
                </div>
              ))}
            </div>

            {/* Messages area */}
            <div className="flex-1 min-w-0">
              {/* Channel header */}
              <div className="h-10 border-b border-dc-divider flex items-center px-4 gap-2">
                <Hash size={18} className="text-dc-channel-icon shrink-0" />
                <span className="text-[15px] font-semibold text-white">sol-calls</span>
                <span className="text-[13px] text-dc-text-faint hidden sm:inline ml-2">Aggregated from 3 channels</span>
              </div>

              <div className="p-4 space-y-3">
                {mockMessages.flatMap((group) =>
                  group.messages.map((msg, j) => (
                    <motion.div
                      key={`${group.channel.name}-${j}`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.8 + j * 0.15 + mockMessages.indexOf(group) * 0.3 }}
                      className={`flex items-start gap-3 rounded px-2 py-1.5 -mx-2 ${
                        msg.isHighlighted ? 'bg-dc-highlight border-l-2 border-dc-blurple' : ''
                      }`}
                    >
                      <div
                        className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold text-white"
                        style={{ backgroundColor: msg.avatar }}
                      >
                        {msg.author[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className={`text-[13px] font-semibold ${msg.isHighlighted ? 'text-dc-blurple' : 'text-white'}`}>
                            {msg.author}
                          </span>
                          <span className="text-[11px] text-dc-text-faint">{msg.time}</span>
                        </div>
                        <p className="text-[14px] text-dc-text mt-0.5">
                          {msg.text}
                          {msg.isContract && msg.chain && (
                            <span
                              className={`inline-flex items-center ml-2 px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                                msg.chain === 'SOL'
                                  ? 'bg-[#14f195]/10 text-dc-solana'
                                  : 'bg-[#fee75c]/10 text-dc-evm'
                              }`}
                            >
                              {msg.chain}
                            </span>
                          )}
                        </p>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </AnimatedSection>
    </section>
  );
}
