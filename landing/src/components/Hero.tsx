import { AnimatedSection } from './AnimatedSection';
import { HeroMockup } from './HeroMockup';
import { Globe, ShieldCheck, Code2 } from 'lucide-react';

export function Hero() {
  return (
    <section className="relative flex flex-col items-center pt-24 pb-16 sm:pt-28 sm:pb-20 overflow-hidden">
      <div className="relative z-10 mx-auto max-w-4xl px-6 text-center">
        <AnimatedSection delay={0.05}>
          <img src="/trenchcord.png" alt="Trenchcord" className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl mx-auto shadow-lg shadow-black/30" />
        </AnimatedSection>

        <AnimatedSection delay={0.15}>
          <h1 className="mt-5 text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white pb-2">
            Trenchcord
          </h1>
        </AnimatedSection>

        <AnimatedSection delay={0.2}>
          <p className="mt-4 text-lg sm:text-xl text-dc-text-muted max-w-2xl mx-auto leading-relaxed">
            Your Discord and Telegram, Supercharged for Trenching
          </p>
        </AnimatedSection>

        <AnimatedSection delay={0.25}>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
              <Globe size={12} />
              Desktop App · macOS &amp; Windows
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/10 border border-amber-400/20 text-amber-400 text-xs font-semibold">
              <ShieldCheck size={12} />
              100% Local · No Cloud Database
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-dc-blurple/10 border border-dc-blurple/20 text-dc-blurple text-xs font-semibold">
              <Code2 size={12} />
              Source-Available
            </span>
          </div>
        </AnimatedSection>

        <AnimatedSection delay={0.3}>
          <p className="mt-4 text-sm text-dc-text-faint max-w-xl mx-auto">
            Desktop app for macOS and Windows, or run it straight from the source code — both are
            fully self-hosted, with no online version and no cloud database. Aggregate Discord and
            Telegram channels, track key users, auto-detect contracts, and trade in one click —
            while your tokens and data never leave your machine.
          </p>
        </AnimatedSection>

        <AnimatedSection delay={0.4}>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href="#download"
              onClick={(e) => {
                e.preventDefault();
                document.querySelector('#download')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded bg-dc-blurple text-white font-medium text-sm hover:bg-dc-blurple-hover transition-colors"
            >
              Download
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-px">
                <path d="M8 3v8M8 11 4.5 7.5M8 11l3.5-3.5M3 13h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <a
              href="#setup"
              onClick={(e) => {
                e.preventDefault();
                document.querySelector('#setup')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded bg-dc-dark border border-dc-divider text-dc-text font-medium text-sm hover:bg-dc-hover hover:border-dc-text-faint transition-colors"
            >
              Run from Source
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-px">
                <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <a
              href="https://demo.trenchcord.app"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded bg-dc-dark border border-dc-divider text-dc-text font-medium text-sm hover:bg-dc-hover hover:border-dc-text-faint transition-colors"
            >
              Try Demo
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-px">
                <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          </div>
        </AnimatedSection>
      </div>

      {/* Interactive app preview */}
      <AnimatedSection delay={0.5} className="w-full max-w-4xl mx-auto mt-12 px-6">
        <HeroMockup />
      </AnimatedSection>
    </section>
  );
}
