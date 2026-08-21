import { motion } from 'framer-motion';
import {
  LayoutGrid,
  UserCheck,
  ScanSearch,
  MousePointerClick,
  Bell,
  BellRing,
  Focus,
  Volume2,
  Palette,
  Zap,
  Send,
  MessagesSquare,
  Crosshair,
  Rocket,
  Columns2,
  ExternalLink,
  Inbox,
  Keyboard,
  Search,
  Sparkles,
  PlayCircle,
} from 'lucide-react';
import { StaggerContainer, fadeUpVariant } from './AnimatedSection';
import { AnimatedSection } from './AnimatedSection';

const features = [
  {
    icon: LayoutGrid,
    title: 'Custom Rooms',
    desc: 'Aggregate channels and DMs from any number of servers into unified live rooms.',
    span: 'md:col-span-2',
  },
  {
    icon: MessagesSquare,
    title: 'Telegram Integration',
    desc: 'Monitor Telegram groups, channels, bots, and DMs alongside Discord — all in the same rooms.',
    span: 'md:col-span-2',
  },
  {
    icon: Crosshair,
    title: 'Auto-Sniping',
    desc: 'Buy the instant a caller posts — follow specific callers or whole rooms, map keywords to contracts, set market-cap bounds, re-snipe rules, and automatic limit sells.',
    accent: 'solana' as const,
    span: 'md:col-span-2',
  },
  {
    icon: Rocket,
    title: 'In-Chat Buy Buttons',
    desc: 'Solana calls get buy buttons with your own SOL amounts right under the message — fire on one or many Slotshark wallets in a single click.',
    accent: 'solana' as const,
    span: 'md:col-span-2',
  },
  {
    icon: BellRing,
    title: 'Cloud Alerts',
    desc: 'Price, X account, and Telegram channel alerts that fire even while your PC is off — pushed to your phone via Pushover, Telegram, or Discord DM.',
    span: 'md:col-span-2',
  },
  {
    icon: MousePointerClick,
    title: 'One-Click Trading',
    desc: 'Click contracts to open Axiom, GMGN, Bloom, Padre, fomo.family and more — or your own custom link template.',
    span: 'md:col-span-2',
  },
  {
    icon: UserCheck,
    title: 'User Highlighting',
    desc: 'Track key users across all channels with visual alerts.',
    span: '',
  },
  {
    icon: ScanSearch,
    title: 'Contract Detection',
    desc: 'Auto-detect Solana and EVM contracts, with automatic EVM chain resolution.',
    accent: 'solana' as const,
    span: '',
  },
  {
    icon: Columns2,
    title: 'Split-Screen',
    desc: 'Watch up to 4 rooms or feeds side by side — drag, resize, and lock panes.',
    span: '',
  },
  {
    icon: ExternalLink,
    title: 'Pop-Out Windows',
    desc: 'Detach any room, DM, or feed into its own window for a second monitor.',
    span: '',
  },
  {
    icon: Inbox,
    title: 'Built-In Feeds',
    desc: 'Contracts, Mentions, Keywords, and Snipes — every catch collected in its own feed.',
    span: '',
  },
  {
    icon: Keyboard,
    title: 'Hotkeys',
    desc: 'Single-key room and feed switching, plus an OS-wide bring-to-front shortcut.',
    span: '',
  },
  {
    icon: Bell,
    title: 'Push Notifications',
    desc: 'Pushover alerts when highlighted users post contracts.',
    span: '',
  },
  {
    icon: Focus,
    title: 'Focus Mode',
    desc: 'Filter messages to a specific channel within a room.',
    span: '',
  },
  {
    icon: Send,
    title: 'Quick Reply & Chat',
    desc: 'Send messages and files directly from the dashboard with a built-in channel selector.',
    span: '',
  },
  {
    icon: Search,
    title: 'Message Search',
    desc: 'Search any room or feed by text, author, or contract.',
    span: '',
  },
  {
    icon: Volume2,
    title: 'Sound Alerts',
    desc: 'Audio notifications for highlighted messages.',
    span: '',
  },
  {
    icon: Palette,
    title: 'Guild Colors',
    desc: 'Color-code messages by guild for quick visual scanning.',
    span: '',
  },
  {
    icon: Sparkles,
    title: 'Renders Everything',
    desc: 'Threads and forum posts, polls, stickers, GIFs, forwarded messages, and the newest bot panels — plus deleted-message badges and edit history. Nothing shows up blank.',
    span: 'md:col-span-2',
  },
  {
    icon: Zap,
    title: 'Auto-Open Contracts',
    desc: 'Automatically open links when highlighted users post contracts.',
    accent: 'evm' as const,
    span: 'md:col-span-2',
  },
];

const accentColors = {
  solana: 'text-dc-solana',
  evm: 'text-dc-evm',
};

export function Features() {
  return (
    <section id="features" className="relative py-20 px-6 bg-dc-sidebar scroll-mt-14">
      <div className="mx-auto max-w-6xl">
        <AnimatedSection className="text-center mb-12">
          <h2 className="text-2xl sm:text-4xl font-bold text-white">
            Everything You Need
          </h2>
          <p className="mt-3 text-dc-text-muted max-w-xl mx-auto text-sm">
            A complete toolkit for monitoring Discord &amp; Telegram alpha and trading crypto — all in one place.
          </p>
        </AnimatedSection>

        <StaggerContainer
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3"
          staggerDelay={0.04}
        >
          {features.map((f) => {
            const Icon = f.icon;
            const iconColor = f.accent
              ? accentColors[f.accent]
              : 'text-dc-text';

            return (
              <motion.div
                key={f.title}
                variants={fadeUpVariant}
                className={`bg-dc-main rounded-lg p-5 flex flex-col gap-3 border border-dc-divider/50 hover:border-dc-divider transition-colors ${f.span}`}
              >
                <div
                  className={`w-9 h-9 rounded-lg bg-dc-main flex items-center justify-center ${iconColor}`}
                >
                  <Icon size={18} />
                </div>
                <h3 className="font-semibold text-dc-text text-sm">
                  {f.title}
                </h3>
                <p className="text-xs text-dc-text-muted leading-relaxed">
                  {f.desc}
                </p>
              </motion.div>
            );
          })}
        </StaggerContainer>

        {/* The walkthrough video closes the grid as one more (wide) feature
            card, so it reads as part of the set rather than its own section. */}
        <AnimatedSection delay={0.1} className="mt-3">
          <div
            id="walkthrough"
            className="scroll-mt-14 bg-dc-main rounded-lg border border-dc-divider/50 hover:border-dc-divider transition-colors overflow-hidden"
          >
            <div className="p-5 flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-dc-main flex items-center justify-center text-dc-text shrink-0">
                <PlayCircle size={18} />
              </div>
              <div>
                <h3 className="font-semibold text-dc-text text-sm">See It All in Action</h3>
                <p className="text-xs text-dc-text-muted leading-relaxed mt-1">
                  A minute and a half through a real trenching session — rooms, live calls,
                  one-click buys, sniping, split screen, and alerts.
                </p>
              </div>
            </div>
            <video
              controls
              playsInline
              preload="metadata"
              poster="/trenchcord-poster.jpg"
              className="w-full block border-t border-dc-divider/50"
            >
              <source src="/trenchcord.mp4" type="video/mp4" />
            </video>
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
