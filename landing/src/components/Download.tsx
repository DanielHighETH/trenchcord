import { useState } from 'react';
import { Apple, Check, Copy, Terminal, ShieldCheck } from 'lucide-react';
import { AnimatedSection } from './AnimatedSection';

const MAC_DOWNLOAD = 'https://github.com/DanielHighETH/trenchcord/releases/download/v1.0.0/Trenchcord-1.0.0-arm64.dmg';
const WIN_DOWNLOAD = 'https://github.com/DanielHighETH/trenchcord/releases/download/v1.0.0/Trenchcord-Setup-1.0.0.exe';
const RELEASES = 'https://github.com/DanielHighETH/trenchcord/releases/latest';

const XATTR_CMD = 'xattr -cr /Applications/Trenchcord.app';

function WindowsIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 5.1 10.4 4v7.3H3V5.1Zm0 13.8 7.4 1v-7.2H3v6.2Zm8.3 1.1L21 21V12.1h-9.7v7.9Zm0-16.1v8h9.7V3l-9.7 1.9Z" />
    </svg>
  );
}

export function Download() {
  const [copied, setCopied] = useState(false);

  const copyCmd = async () => {
    try {
      await navigator.clipboard.writeText(XATTR_CMD);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <section id="download" className="relative py-20 px-6 scroll-mt-14">
      <div className="mx-auto max-w-4xl">
        <AnimatedSection className="text-center mb-10">
          <h2 className="text-2xl sm:text-4xl font-bold text-white">Download Trenchcord</h2>
          <p className="mt-3 text-dc-text-muted max-w-xl mx-auto text-sm">
            Desktop app for macOS and Windows. Your token and data stay entirely on your own
            machine — nothing is ever sent to a server.
          </p>
        </AnimatedSection>

        <AnimatedSection delay={0.1}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* macOS */}
            <div className="flex flex-col rounded-lg border border-dc-divider bg-dc-sidebar p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-lg bg-dc-dark border border-dc-divider flex items-center justify-center">
                  <Apple size={22} className="text-dc-text" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">macOS</h3>
                  <p className="text-xs text-dc-text-faint">Universal · Intel &amp; Apple Silicon</p>
                </div>
              </div>

              <a
                href={MAC_DOWNLOAD}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded bg-dc-blurple text-white font-medium text-sm hover:bg-dc-blurple-hover transition-colors"
              >
                Download for macOS
              </a>

              {/* First-launch xattr note */}
              <div className="mt-4 rounded-lg border border-dc-yellow/30 bg-dc-yellow/5 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Terminal size={14} className="text-dc-yellow shrink-0" />
                  <p className="text-xs font-semibold text-dc-yellow">First launch on macOS</p>
                </div>
                <p className="text-xs text-dc-text-muted leading-relaxed">
                  The app is unsigned, so macOS blocks it the first time. Open{' '}
                  <span className="text-dc-text">Terminal</span> and run this once (drag the app onto
                  the window to fill in the path):
                </p>
                <div className="mt-2 flex items-center gap-2 rounded bg-dc-main border border-dc-divider/50 px-2.5 py-1.5">
                  <code className="flex-1 text-[11px] font-mono text-dc-text truncate">{XATTR_CMD}</code>
                  <button
                    onClick={copyCmd}
                    className="shrink-0 text-dc-text-muted hover:text-white transition-colors"
                    aria-label="Copy command"
                  >
                    {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Windows */}
            <div className="flex flex-col rounded-lg border border-dc-divider bg-dc-sidebar p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-lg bg-dc-dark border border-dc-divider flex items-center justify-center">
                  <span className="text-dc-blurple"><WindowsIcon size={22} /></span>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Windows</h3>
                  <p className="text-xs text-dc-text-faint">Installer · Windows 10 &amp; 11</p>
                </div>
              </div>

              <a
                href={WIN_DOWNLOAD}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded bg-dc-blurple text-white font-medium text-sm hover:bg-dc-blurple-hover transition-colors"
              >
                Download for Windows
              </a>

              <div className="mt-4 rounded-lg border border-dc-blurple/30 bg-dc-blurple/5 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck size={14} className="text-dc-blurple shrink-0" />
                  <p className="text-xs font-semibold text-dc-blurple">First launch on Windows</p>
                </div>
                <p className="text-xs text-dc-text-muted leading-relaxed">
                  SmartScreen may warn about an unknown publisher. Click{' '}
                  <span className="text-dc-text">More info → Run anyway</span> to install.
                </p>
              </div>
            </div>
          </div>
        </AnimatedSection>

        <AnimatedSection delay={0.2}>
          <p className="mt-6 text-center text-xs text-dc-text-faint">
            Looking for a specific version, or the checksums?{' '}
            <a href={RELEASES} target="_blank" rel="noopener noreferrer" className="text-dc-blurple hover:underline">
              Browse all releases
            </a>
            . Prefer to run from source?{' '}
            <a
              href="#setup"
              onClick={(e) => {
                e.preventDefault();
                document.querySelector('#setup')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="text-dc-blurple hover:underline"
            >
              Self-host it instead
            </a>
            .
          </p>
        </AnimatedSection>
      </div>
    </section>
  );
}
