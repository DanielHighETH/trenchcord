import { Github, GitFork, Star } from 'lucide-react';
import { AnimatedSection } from './AnimatedSection';

export function OpenSource() {
  return (
    <section className="relative py-20 px-6">
      <div className="mx-auto max-w-6xl">
        <AnimatedSection className="text-center mb-8">
          <h2 className="text-2xl sm:text-4xl font-bold text-white">
            Open Source
          </h2>
          <p className="mt-3 text-dc-text-muted max-w-xl mx-auto text-sm">
            Trenchcord is fully open source. Inspect the code, build on top of it,
            add your own features, and share with the community.
          </p>
        </AnimatedSection>

        <AnimatedSection delay={0.15}>
          <div className="bg-dc-sidebar rounded-lg border border-dc-divider p-8 sm:p-10 max-w-2xl mx-auto text-center">
            <div className="flex justify-center gap-10 mb-6">
              <div className="flex flex-col items-center gap-2">
                <div className="w-11 h-11 rounded-lg bg-dc-dark flex items-center justify-center text-dc-blurple">
                  <GitFork size={20} />
                </div>
                <span className="text-xs text-dc-text-muted">Fork it</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-11 h-11 rounded-lg bg-dc-dark flex items-center justify-center text-dc-yellow">
                  <Star size={20} />
                </div>
                <span className="text-xs text-dc-text-muted">Star it</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-11 h-11 rounded-lg bg-dc-dark flex items-center justify-center text-dc-text-muted">
                  <Github size={20} />
                </div>
                <span className="text-xs text-dc-text-muted">Build on it</span>
              </div>
            </div>

            <p className="text-sm text-dc-text-muted leading-relaxed mb-8">
              Whether you want to add custom integrations, tweak the UI, or build
              entirely new features — the codebase is yours to explore and extend.
            </p>

            <a
              href="https://github.com/DanielHighETH/trenchcord"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded bg-dc-dark border border-dc-divider text-dc-text font-medium text-sm hover:bg-dc-hover hover:border-dc-text-faint transition-colors"
            >
              <Github size={16} />
              View on GitHub
            </a>
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
