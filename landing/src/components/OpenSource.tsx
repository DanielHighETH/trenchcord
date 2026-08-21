import { Github, GitFork, Star, Scale } from 'lucide-react';
import { AnimatedSection } from './AnimatedSection';

export function OpenSource() {
  return (
    <section id="open-source" className="relative py-20 px-6 scroll-mt-14">
      <div className="mx-auto max-w-6xl">
        <AnimatedSection className="text-center mb-8">
          <h2 className="text-2xl sm:text-4xl font-bold text-white">
            Source-Available
          </h2>
          <p className="mt-3 text-dc-text-muted max-w-xl mx-auto text-sm">
            Trenchcord's full source code is <span className="text-dc-text">public</span>. You're
            trusting it with your accounts — so don't trust it blindly: read the code, build it
            yourself, and verify exactly what it does.
          </p>
        </AnimatedSection>

        <AnimatedSection delay={0.15}>
          <div className="bg-dc-sidebar rounded-lg border border-dc-divider p-8 sm:p-10 max-w-2xl mx-auto text-center">
            <div className="flex justify-center gap-10 mb-6">
              <div className="flex flex-col items-center gap-2">
                <div className="w-11 h-11 rounded-lg bg-dc-dark flex items-center justify-center text-dc-text">
                  <GitFork size={20} />
                </div>
                <span className="text-xs text-dc-text-muted">Read it</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-11 h-11 rounded-lg bg-dc-dark flex items-center justify-center text-dc-text">
                  <Star size={20} />
                </div>
                <span className="text-xs text-dc-text-muted">Star it</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="w-11 h-11 rounded-lg bg-dc-dark flex items-center justify-center text-dc-text">
                  <Github size={20} />
                </div>
                <span className="text-xs text-dc-text-muted">Audit it</span>
              </div>
            </div>

            <p className="text-sm text-dc-text-muted leading-relaxed mb-3">
              Every request the app makes off your machine is documented, and the code that makes
              it is right there to check — nothing to take on faith.
            </p>

            <p className="text-xs text-dc-text-faint leading-relaxed mb-8 max-w-md mx-auto">
              The license in plain English: read, build, and verify the code freely — using
              Trenchcord day-to-day requires an active subscription, and redistribution isn't
              permitted. Releases before this change remain under the AGPL-3.0.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <a
                href="https://github.com/DanielHighETH/trenchcord"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded bg-dc-dark border border-dc-divider text-dc-text font-medium text-sm hover:bg-dc-hover hover:border-dc-text-faint transition-colors"
              >
                <Github size={16} />
                View on GitHub
              </a>
              <a
                href="https://github.com/DanielHighETH/trenchcord/blob/main/LICENSE"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded bg-dc-dark border border-dc-divider text-dc-text font-medium text-sm hover:bg-dc-hover hover:border-dc-text-faint transition-colors"
              >
                <Scale size={16} />
                Read the License
              </a>
            </div>
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
