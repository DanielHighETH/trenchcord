import { motion } from 'framer-motion';
import { Key, Settings, UserSearch, Monitor } from 'lucide-react';
import { StaggerContainer, fadeUpVariant } from './AnimatedSection';
import { AnimatedSection } from './AnimatedSection';

const steps = [
  {
    icon: Key,
    title: 'Connect',
    desc: 'Add your Discord token to authenticate.',
    num: '01',
  },
  {
    icon: Settings,
    title: 'Configure',
    desc: 'Set up rooms and aggregate channels.',
    num: '02',
  },
  {
    icon: UserSearch,
    title: 'Highlight',
    desc: 'Mark users you want to track closely.',
    num: '03',
  },
  {
    icon: Monitor,
    title: 'Monitor',
    desc: 'Watch everything in a unified dashboard.',
    num: '04',
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="relative py-28 px-6 bg-bg-section/50">
      <div className="mx-auto max-w-6xl">
        <AnimatedSection className="text-center mb-16">
          <h2 className="text-3xl sm:text-5xl font-bold gradient-text inline-block pb-1">
            How It Works
          </h2>
          <p className="mt-4 text-white/50 max-w-md mx-auto">
            Get up and running in minutes.
          </p>
        </AnimatedSection>

        <StaggerContainer
          className="relative grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-4"
          staggerDelay={0.12}
        >
          {/* Connecting line (desktop only) */}
          <div className="hidden md:block absolute top-16 left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-accent-blurple/40 via-accent-purple/40 to-accent-blurple/40" />

          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.num}
                variants={fadeUpVariant}
                className="relative flex flex-col items-center text-center"
              >
                <div className="relative z-10 w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-blurple/20 to-accent-purple/20 border border-white/10 flex items-center justify-center mb-5">
                  <Icon size={22} className="text-accent-blurple" />
                </div>
                <span className="text-[10px] font-bold tracking-widest text-accent-blurple/60 uppercase mb-2">
                  Step {step.num}
                </span>
                <h3 className="font-semibold text-white mb-1">{step.title}</h3>
                <p className="text-xs text-white/45 max-w-[180px]">{step.desc}</p>
              </motion.div>
            );
          })}
        </StaggerContainer>
      </div>
    </section>
  );
}
