import { motion } from 'framer-motion';
import { AnimatedSection } from './AnimatedSection';

const floatingCards = [
  {
    title: '#sol-calls',
    messages: ['New CA detected', 'pump.fun/...x7f2'],
    rotate: -6,
  },
  {
    title: '#eth-alpha',
    messages: ['Contract: 0x1a2...f3d', '+340% in 2h'],
    rotate: 4,
  },
  {
    title: 'DMs · whale_tracker',
    messages: ['Just aped into this', 'Check $TRENCHCORD'],
    rotate: -2,
  },
];

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
      <div className="absolute inset-0 particle-grid opacity-50" />

      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] sm:w-[600px] h-[300px] sm:h-[600px] rounded-full bg-accent-blurple/10 blur-[120px]" />
      <div className="absolute bottom-1/4 right-1/4 w-[200px] sm:w-[400px] h-[200px] sm:h-[400px] rounded-full bg-accent-purple/10 blur-[100px]" />

      <div className="relative z-10 mx-auto max-w-6xl px-6 text-center">
        <AnimatedSection delay={0.1}>
          <h1 className="text-5xl sm:text-7xl lg:text-8xl font-extrabold tracking-tight gradient-text pb-2">
            Trenchcord
          </h1>
        </AnimatedSection>

        <AnimatedSection delay={0.25}>
          <p className="mt-6 text-lg sm:text-xl text-white/60 max-w-2xl mx-auto leading-relaxed">
            Your Discord, Supercharged for Trenching
          </p>
        </AnimatedSection>

        <AnimatedSection delay={0.4}>
          <p className="mt-4 text-sm sm:text-base text-white/40 max-w-xl mx-auto">
            Aggregate channels, track key users, auto-detect contracts,
            and trade in one click — all from a single dashboard.
          </p>
        </AnimatedSection>

        <AnimatedSection delay={0.55}>
          <a
            href="#tutorial"
            onClick={(e) => {
              e.preventDefault();
              document.querySelector('#tutorial')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="mt-10 inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-gradient-to-r from-accent-blurple to-accent-purple text-white font-semibold text-sm shadow-lg shadow-accent-blurple/25 hover:shadow-accent-blurple/40 hover:scale-105 transition-all duration-300"
          >
            Get Started
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-px">
              <path d="M8 3L13 8L8 13M13 8H3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </AnimatedSection>

        <div className="mt-16 sm:mt-20 relative">
          <div className="flex flex-col sm:flex-row flex-wrap justify-center items-center gap-4 sm:gap-6 max-w-3xl mx-auto">
            {floatingCards.map((card, i) => (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0, rotate: card.rotate }}
                transition={{
                  duration: 0.8,
                  delay: 0.7 + i * 0.15,
                  ease: [0.25, 0.4, 0.25, 1],
                }}
                whileHover={{ scale: 1.05, rotate: 0 }}
                className="glass-card rounded-xl p-4 w-full sm:w-52 text-left"
              >
                <div className="text-xs font-semibold text-accent-blurple mb-2">
                  {card.title}
                </div>
                {card.messages.map((msg) => (
                  <div key={msg} className="text-xs text-white/50 py-0.5 truncate">
                    {msg}
                  </div>
                ))}
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
