import { motion } from 'framer-motion';
import {
  LayoutGrid,
  UserCheck,
  ScanSearch,
  MousePointerClick,
  Bell,
  Focus,
  Radio,
  MessageCircle,
  Volume2,
  Palette,
  Zap,
  Link2,
} from 'lucide-react';
import { StaggerContainer, fadeUpVariant } from './AnimatedSection';
import { AnimatedSection } from './AnimatedSection';

const features = [
  {
    icon: LayoutGrid,
    title: 'Custom Rooms',
    desc: 'Aggregate channels from multiple servers into unified rooms.',
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
    desc: 'Auto-detect Solana and EVM contract addresses in messages.',
    accent: 'solana' as const,
    span: '',
  },
  {
    icon: MousePointerClick,
    title: 'One-Click Trading',
    desc: 'Click contracts to open Axiom, GMGN, Bloom, Padre and more.',
    span: 'md:col-span-2',
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
    icon: Radio,
    title: 'Real-time Streaming',
    desc: 'Live message updates via Discord Gateway.',
    span: '',
  },
  {
    icon: MessageCircle,
    title: 'DM Support',
    desc: 'Monitor DMs alongside guild channels.',
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
    icon: Zap,
    title: 'Auto-Open Contracts',
    desc: 'Automatically open links when highlighted users post contracts.',
    accent: 'evm' as const,
    span: 'md:col-span-2',
  },
  {
    icon: Link2,
    title: 'Custom Link Templates',
    desc: 'Configure which trading platform links generate for contracts.',
    span: '',
  },
];

const accentColors = {
  solana: 'text-dc-solana',
  evm: 'text-dc-evm',
};

export function Features() {
  return (
    <section id="features" className="relative py-20 px-6 bg-dc-sidebar">
      <div className="mx-auto max-w-6xl">
        <AnimatedSection className="text-center mb-12">
          <h2 className="text-2xl sm:text-4xl font-bold text-white">
            Everything You Need
          </h2>
          <p className="mt-3 text-dc-text-muted max-w-xl mx-auto text-sm">
            A complete toolkit for monitoring Discord alpha and trading crypto — all in one place.
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
              : 'text-dc-blurple';

            return (
              <motion.div
                key={f.title}
                variants={fadeUpVariant}
                className={`bg-dc-dark rounded-lg p-5 flex flex-col gap-3 border border-dc-divider/50 hover:border-dc-divider transition-colors ${f.span}`}
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
      </div>
    </section>
  );
}
