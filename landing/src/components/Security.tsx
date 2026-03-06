import { ShieldCheck, Lock, EyeOff, ExternalLink, Shield, HardDrive } from 'lucide-react';
import { AnimatedSection } from './AnimatedSection';

const ENCRYPTION_SOURCE_URL =
  'https://github.com/DanielHighETH/trenchcord/blob/main/backend/src/auth/encryption.ts';

export function Security() {
  return (
    <section id="security" className="relative py-20 px-6 scroll-mt-14">
      <div className="mx-auto max-w-4xl">
        <AnimatedSection className="text-center mb-12">
          <h2 className="text-2xl sm:text-4xl font-bold text-white">
            Your Tokens Are Safe
          </h2>
          <p className="mt-3 text-dc-text-muted max-w-xl mx-auto text-sm">
            Trenchcord takes token security seriously. Your Discord credentials are encrypted
            and never stored in plain text.
          </p>
        </AnimatedSection>

        <AnimatedSection delay={0.1}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-dc-sidebar rounded-lg border border-dc-divider p-6 flex flex-col gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                <Lock size={20} />
              </div>
              <h3 className="font-semibold text-white text-sm">AES-256-GCM Encryption</h3>
              <p className="text-xs text-dc-text-muted leading-relaxed">
                Every Discord token is encrypted at rest using AES-256-GCM — the same standard used by banks and governments.
              </p>
            </div>

            <div className="bg-dc-sidebar rounded-lg border border-dc-divider p-6 flex flex-col gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                <EyeOff size={20} />
              </div>
              <h3 className="font-semibold text-white text-sm">Never Stored in Plain Text</h3>
              <p className="text-xs text-dc-text-muted leading-relaxed">
                Tokens are encrypted before they reach the database. They are never stored, logged, or transmitted in plain text.
              </p>
            </div>

            <div className="bg-dc-sidebar rounded-lg border border-dc-divider p-6 flex flex-col gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                <Shield size={20} />
              </div>
              <h3 className="font-semibold text-white text-sm">Server Hardening</h3>
              <p className="text-xs text-dc-text-muted leading-relaxed">
                Helmet security headers, API rate limiting, strict CORS policies, and JWT-authenticated WebSockets protect every request.
              </p>
            </div>

            <div className="bg-dc-sidebar rounded-lg border border-dc-divider p-6 flex flex-col gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                <ShieldCheck size={20} />
              </div>
              <h3 className="font-semibold text-white text-sm">Open Source & Auditable</h3>
              <p className="text-xs text-dc-text-muted leading-relaxed">
                Don't just trust it — verify it. The entire encryption implementation is open source. Inspect every line yourself.
              </p>
            </div>
          </div>
        </AnimatedSection>

        <AnimatedSection delay={0.15} className="mt-4">
          <div className="bg-dc-sidebar rounded-lg border border-dc-divider p-6 flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-dc-blurple/10 flex items-center justify-center text-dc-blurple shrink-0">
              <HardDrive size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">Self-hosting? Even simpler.</h3>
              <p className="text-xs text-dc-text-muted leading-relaxed mt-1">
                When you self-host Trenchcord, there is no database at all. Your tokens and all configuration
                are stored locally on your machine in a simple JSON file — nothing ever leaves your PC.
              </p>
            </div>
          </div>
        </AnimatedSection>

        <AnimatedSection delay={0.2} className="mt-8 text-center">
          <p className="text-sm text-dc-text-muted">
            Don't just take Trenchcord's word for it — the full encryption source code is public on GitHub.
          </p>
          <a
            href={ENCRYPTION_SOURCE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 rounded bg-dc-sidebar border border-dc-divider text-dc-text font-medium text-sm hover:bg-dc-hover hover:border-dc-text-faint transition-colors"
          >
            <ExternalLink size={15} />
            View Encryption Source Code
          </a>
        </AnimatedSection>
      </div>
    </section>
  );
}
