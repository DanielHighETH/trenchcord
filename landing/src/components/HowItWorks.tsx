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
    <section id="how-it-works" className="relative py-20 px-6 bg-dc-sidebar">
      <div className="mx-auto max-w-6xl">
        <AnimatedSection className="text-center mb-12">
          <h2 className="text-2xl sm:text-4xl font-bold text-white">
            How It Works
          </h2>
          <p className="mt-3 text-dc-text-muted max-w-md mx-auto text-sm">
            Get up and running in minutes.
          </p>
        </AnimatedSection>

        <StaggerContainer
          className="relative grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-4"
          staggerDelay={0.1}
        >
          {/* Connecting line */}
          <div className="hidden md:block absolute top-8 left-[12.5%] right-[12.5%] h-px bg-dc-divider" />

          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.num}
                variants={fadeUpVariant}
                className="relative flex flex-col items-center text-center"
              >
                <div className="relative z-10 w-12 h-12 rounded-lg bg-dc-dark border border-dc-divider flex items-center justify-center mb-4">
                  <Icon size={20} className="text-dc-text" />
                </div>
                <span className="text-[10px] font-bold tracking-widest text-dc-text-faint uppercase mb-1.5">
                  Step {step.num}
                </span>
                <h3 className="font-semibold text-dc-text mb-1 text-sm">{step.title}</h3>
                <p className="text-xs text-dc-text-muted max-w-[180px]">{step.desc}</p>
              </motion.div>
            );
          })}
        </StaggerContainer>
      </div>
    </section>
  );
}
