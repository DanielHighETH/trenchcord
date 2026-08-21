import { ShieldCheck, ExternalLink, HardDrive, Laptop, Package, Workflow, FileCode2, Server } from 'lucide-react';
import { AnimatedSection } from './AnimatedSection';

const REPO_URL = 'https://github.com/DanielHighETH/trenchcord';
const WORKFLOW_FILE_URL = `${REPO_URL}/blob/main/.github/workflows/desktop-release.yml`;
const WORKFLOW_RUNS_URL = `${REPO_URL}/actions/workflows/desktop-release.yml`;
const TRANSPARENCY_URL = `${REPO_URL}#what-leaves-your-pc--full-network-transparency`;

export function Security() {
  return (
    <section id="security" className="relative py-20 px-6 bg-dc-sidebar scroll-mt-14">
      <div className="mx-auto max-w-4xl">
        <AnimatedSection className="text-center mb-12">
          <h2 className="text-2xl sm:text-4xl font-bold text-white">
            Your Tokens Are Safe
          </h2>
          <p className="mt-3 text-dc-text-muted max-w-xl mx-auto text-sm">
            Your Discord tokens, Telegram sessions, messages, and settings never leave your PC.
            The one server Trenchcord talks to is our subscription API — and what it sends there
            is listed below, in full.
          </p>
        </AnimatedSection>

        <AnimatedSection delay={0.1}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-dc-main rounded-lg border border-dc-divider/50 p-6 flex flex-col gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                <HardDrive size={20} />
              </div>
              <h3 className="font-semibold text-white text-sm">No Cloud Copy of Your Data</h3>
              <p className="text-xs text-dc-text-muted leading-relaxed">
                Everything Trenchcord knows — tokens, sessions, rooms, messages, settings — lives
                in a local file on your machine. Our server stores only your account: subscription
                status, linked devices, and — only if you use cloud Alerts — the watchlists you
                ask it to watch.
              </p>
            </div>

            <div className="bg-dc-main rounded-lg border border-dc-divider/50 p-6 flex flex-col gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                <Laptop size={20} />
              </div>
              <h3 className="font-semibold text-white text-sm">Everything Runs on Your Machine</h3>
              <p className="text-xs text-dc-text-muted leading-relaxed">
                The app is a local server on your own PC. Your credentials and messages travel
                directly between your machine and Discord or Telegram — our servers are never in
                that path and never see them.
              </p>
            </div>

            <div className="bg-dc-main rounded-lg border border-dc-divider/50 p-6 flex flex-col gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                <Package size={20} />
              </div>
              <h3 className="font-semibold text-white text-sm">The Download Is Self-Hosted Too</h3>
              <p className="text-xs text-dc-text-muted leading-relaxed">
                The desktop app is the exact same public code, packaged so you can skip Node
                and the terminal. Whether you download the installer or run from the repo, your
                machine is the host — the architecture is identical.
              </p>
            </div>

            <div className="bg-dc-main rounded-lg border border-dc-divider/50 p-6 flex flex-col gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                <FileCode2 size={20} />
              </div>
              <h3 className="font-semibold text-white text-sm">Source-Available &amp; Auditable</h3>
              <p className="text-xs text-dc-text-muted leading-relaxed">
                Don't just trust it — verify it. The full source code is public. Inspect exactly
                what touches your tokens, line by line.
              </p>
            </div>
          </div>
        </AnimatedSection>

        <AnimatedSection delay={0.15} className="mt-4">
          <div className="bg-dc-main rounded-lg border border-dc-divider/50 p-6 flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-dc-blurple/10 flex items-center justify-center text-dc-blurple shrink-0">
              <Server size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">
                What the app sends to api.trenchcord.app
              </h3>
              <ul className="text-xs text-dc-text-muted leading-relaxed mt-2 space-y-1.5 list-disc pl-4">
                <li>
                  <span className="text-dc-text">Subscription check</span> (startup, then every 6
                  hours): a device token — a random ID with no personal data in it. Back comes a
                  signed receipt saying "active until this date". That's the entire request.
                </li>
                <li>
                  <span className="text-dc-text">Linking a device</span> (once): a device name like
                  "Desktop" and the platform, exchanged for a pairing code you approve on the
                  dashboard.
                </li>
                <li>
                  <span className="text-dc-text">Cloud Alerts — only if you create them</span>: the
                  watchlists you define (token symbols or contract addresses, X handles, public
                  Telegram channel names, and the alert keywords you type) are stored so alerts can
                  fire while your PC is off. Delete an alert and its definition is deleted with it.
                </li>
                <li>
                  <span className="text-dc-text">Never sent</span>: your Discord token, Telegram
                  session, messages, rooms, room &amp; message keywords, or any other settings.
                </li>
              </ul>
              <p className="text-xs text-dc-text-muted leading-relaxed mt-2">
                The README documents{' '}
                <a
                  href={TRANSPARENCY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-dc-blurple hover:underline"
                >
                  every request the app makes, field by field
                </a>{' '}
                — and the code that makes them is public.
              </p>
            </div>
          </div>
        </AnimatedSection>

        <AnimatedSection delay={0.15} className="mt-4">
          <div className="bg-dc-main rounded-lg border border-dc-divider/50 p-6 flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-dc-blurple/10 flex items-center justify-center text-dc-blurple shrink-0">
              <Workflow size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">How the .dmg and .exe are made</h3>
              <p className="text-xs text-dc-text-muted leading-relaxed mt-1">
                Every release is built in public by{' '}
                <a href={WORKFLOW_RUNS_URL} target="_blank" rel="noopener noreferrer" className="text-dc-blurple hover:underline">
                  GitHub Actions
                </a>
                , on GitHub's own macOS and Windows machines: the workflow checks out the tagged
                source, builds it, and publishes the installers straight to GitHub Releases. No
                hand-made binaries, no hidden steps — the{' '}
                <a href={WORKFLOW_FILE_URL} target="_blank" rel="noopener noreferrer" className="text-dc-blurple hover:underline">
                  build script
                </a>{' '}
                is 60 lines of YAML you can read, and every run's logs are public.
              </p>
            </div>
          </div>
        </AnimatedSection>

        <AnimatedSection delay={0.2} className="mt-8 text-center">
          <p className="text-sm text-dc-text-muted">
            Don't just take Trenchcord's word for it — read the source and watch the builds that
            produced every download.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded bg-dc-dark border border-dc-divider text-dc-text font-medium text-sm hover:bg-dc-hover hover:border-dc-text-faint transition-colors"
            >
              <ExternalLink size={15} />
              View Source Code
            </a>
            <a
              href={WORKFLOW_RUNS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded bg-dc-dark border border-dc-divider text-dc-text font-medium text-sm hover:bg-dc-hover hover:border-dc-text-faint transition-colors"
            >
              <ShieldCheck size={15} />
              Watch the Release Builds
            </a>
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
