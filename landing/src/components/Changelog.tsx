import { AnimatedSection, StaggerContainer, fadeUpVariant } from './AnimatedSection';
import { motion } from 'framer-motion';

interface ChangelogEntry {
  date: string;
  added?: string[];
  fixed?: string[];
}

const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-03-06',
    added: [
      '**Mobile responsivity** — improved mobile-friendly layouts and touch interactions across the app',
    ],
    fixed: [
      'Backend environment configuration',
    ],
  },
  {
    date: '2026-03-05',
    added: [
      '**Hosted web app mode** — Trenchcord can now run as a multi-user web app, no installation required',
      '**User authentication** — sign up and log in with Email/Password or Discord OAuth',
      '**Encrypted token storage** — Discord tokens encrypted at rest with AES-256-GCM',
      '**Per-user Discord gateways** — each user gets their own gateway connection with idle management',
      '**Profile page** — view account info, login method, and sign out',
      '**Security hardening** — helmet headers, rate limiting, CORS, JWT WebSockets, error sanitization',
      '**In-memory caching** — server-side cache to minimize database round-trips',
      '**Role colors** — usernames now display their highest Discord role color',
      '**Compact mode** — denser message layout for power users',
      '**Custom DM colors** — personalize DM channel name colors',
      '**DM profile pictures** — avatars now show in DM conversations',
      '**Background opacity control** — adjust chat background transparency',
      '**Sound alerts** — configurable notification sounds per channel',
      '**Chat UI enhancements** — polished message rendering and layout',
    ],
  },
  {
    date: '2026-03-04',
    added: [
      '**Sending messages** — reply and send messages directly from Trenchcord',
      '**Self-host pill** — visual indicator for self-hosted instances',
    ],
  },
  {
    date: '2026-03-03',
    added: [
      '**Pushover notifications** — push alerts via Pushover integration',
      '**Sound settings** — granular control over notification sounds',
      '**Responsive design** — improved layout for smaller screens',
      '**Favicon and logo** — custom branding assets',
      '**Landing page anchors** — smooth scroll navigation on the landing page',
    ],
    fixed: [
      'Build issues resolved',
      'Mobile gate for demo mode',
    ],
  },
  {
    date: '2026-03-01',
    added: [
      '**Quick menu user highlighting** — highlight users directly from the right-click menu',
    ],
  },
  {
    date: '2026-02-28',
    added: [
      '**Onboarding wizard** — guided setup flow for new users',
    ],
    fixed: [
      'Highlight mode behavior',
      'Highlighting users on click',
    ],
  },
  {
    date: '2026-02-27',
    added: [
      '**Search bar** — search through messages',
      '**Demo mode** — try Trenchcord without connecting a token',
      '**Live demo on landing page** — embedded demo for visitors',
      '**CA feed & embeds** — contract address detection and rich embed rendering',
      '**Global settings** — centralized configuration panel',
      '**Custom confirm modals** — styled confirmation dialogs',
      '**Keyword & sound settings** — keyword-based alerts with sound configuration',
      '**Landing page rework** — redesigned landing page',
    ],
    fixed: [
      'Desktop notifications reliability',
      'Multiple embed messages rendering in a row',
      'Autocomplete behavior',
      'Unknown channel handling',
      'Netlify demo build',
    ],
  },
  {
    date: '2026-02-26',
    added: [
      '**Initial release** — core Discord gateway, multi-account support, real-time message streaming',
      '**Landing page** — project homepage with installation guide',
      '**Config via JSON** — switched from .env to config.json for easier setup',
      '**Open-source section** — added to landing page',
    ],
    fixed: [
      'Setup guide first step flow',
    ],
  },
];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function renderBold(text: string) {
  const parts = text.split(/\*\*(.+?)\*\*/);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="text-white font-semibold">{part}</strong> : part
  );
}

export function Changelog() {
  return (
    <section id="changelog" className="relative py-20 px-6 scroll-mt-14 bg-dc-sidebar">
      <div className="mx-auto max-w-3xl">
        <AnimatedSection className="text-center mb-12">
          <h2 className="text-2xl sm:text-4xl font-bold text-white">
            Changelog
          </h2>
          <p className="mt-3 text-dc-text-muted max-w-xl mx-auto text-sm">
            Latest updates and improvements to Trenchcord.
          </p>
        </AnimatedSection>

        <StaggerContainer className="relative" staggerDelay={0.08}>
          {/* Timeline line */}
          <div className="absolute left-[7px] sm:left-[9px] top-2 bottom-2 w-px bg-dc-divider" />

          {CHANGELOG.map((entry, idx) => (
            <motion.div
              key={entry.date}
              variants={fadeUpVariant}
              className={`relative pl-8 sm:pl-10 ${idx < CHANGELOG.length - 1 ? 'pb-10' : 'pb-0'}`}
            >
              {/* Timeline dot */}
              <div className="absolute left-0 top-1.5 w-[15px] h-[15px] sm:w-[19px] sm:h-[19px] rounded-full border-2 border-dc-blurple bg-dc-main" />

              <div className="bg-dc-sidebar rounded-lg border border-dc-divider p-5 sm:p-6">
                <time className="text-xs font-medium text-dc-blurple tracking-wide uppercase">
                  {formatDate(entry.date)}
                </time>

                {entry.added && entry.added.length > 0 && (
                  <div className="mt-3">
                    <span className="inline-block text-[11px] font-semibold uppercase tracking-wider text-green-400 bg-green-400/10 px-2 py-0.5 rounded mb-2">
                      Added
                    </span>
                    <ul className="space-y-1.5">
                      {entry.added.map((item, i) => (
                        <li key={i} className="text-sm text-dc-text-muted leading-relaxed flex gap-2">
                          <span className="text-green-400 shrink-0 mt-0.5">+</span>
                          <span>{renderBold(item)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {entry.fixed && entry.fixed.length > 0 && (
                  <div className="mt-3">
                    <span className="inline-block text-[11px] font-semibold uppercase tracking-wider text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded mb-2">
                      Fixed
                    </span>
                    <ul className="space-y-1.5">
                      {entry.fixed.map((item, i) => (
                        <li key={i} className="text-sm text-dc-text-muted leading-relaxed flex gap-2">
                          <span className="text-amber-400 shrink-0 mt-0.5">~</span>
                          <span>{renderBold(item)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </StaggerContainer>
      </div>
    </section>
  );
}
