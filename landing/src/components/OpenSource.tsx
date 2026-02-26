import { Github, GitFork, Star } from 'lucide-react';
import { AnimatedSection } from './AnimatedSection';

export function OpenSource() {
  return (
    <section className="relative py-28 px-6">
      <div className="mx-auto max-w-6xl">
        <AnimatedSection className="text-center mb-10">
          <h2 className="text-3xl sm:text-5xl font-bold gradient-text inline-block pb-1">
            Open Source
          </h2>
          <p className="mt-4 text-white/50 max-w-xl mx-auto">
            Trenchcord is fully open source. Inspect the code, build on top of it,
            add your own features, and share with the community.
          </p>
        </AnimatedSection>

        <AnimatedSection delay={0.15}>
          <div className="glass-card rounded-2xl p-8 sm:p-10 max-w-2xl mx-auto text-center">
            <div className="flex justify-center gap-8 mb-6">
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-accent-blurple">
                  <GitFork size={22} />
                </div>
                <span className="text-xs text-white/40">Fork it</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-accent-purple">
                  <Star size={22} />
                </div>
                <span className="text-xs text-white/40">Star it</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-white/60">
                  <Github size={22} />
                </div>
                <span className="text-xs text-white/40">Build on it</span>
              </div>
            </div>

            <p className="text-sm text-white/45 leading-relaxed mb-8">
              Whether you want to add custom integrations, tweak the UI, or build
              entirely new features — the codebase is yours to explore and extend.
            </p>

            <a
              href="https://github.com/DanielHighETH/trenchcord"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 px-7 py-3 rounded-full bg-white/5 border border-white/10 text-white font-semibold text-sm hover:bg-white/10 hover:border-white/20 transition-all duration-300"
            >
              <Github size={18} />
              View on GitHub
            </a>
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
