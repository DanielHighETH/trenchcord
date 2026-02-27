import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, Download, KeyRound, Play, AlertTriangle } from 'lucide-react';
import { AnimatedSection } from './AnimatedSection';

const tabs = [
  { id: 'requirements', label: 'Requirements', icon: Package },
  { id: 'installation', label: 'Installation', icon: Download },
  { id: 'token', label: 'Discord Token', icon: KeyRound },
  { id: 'running', label: 'Running', icon: Play },
] as const;

type TabId = (typeof tabs)[number]['id'];

function RequirementsContent() {
  return (
    <div className="space-y-4">
      <p className="text-dc-text-muted text-sm">Make sure you have the following installed:</p>
      <div className="space-y-2">
        {[
          { name: 'Node.js', version: 'v18 or higher', link: 'https://nodejs.org' },
          { name: 'npm', version: 'Comes with Node.js', link: null },
          { name: 'Git', version: 'Any recent version', link: 'https://git-scm.com' },
        ].map((req) => (
          <div key={req.name} className="bg-dc-dark rounded-lg p-4 flex items-center justify-between border border-dc-divider/50">
            <div>
              <span className="text-dc-text font-medium text-sm">{req.name}</span>
              <span className="text-dc-text-faint text-xs ml-2">{req.version}</span>
            </div>
            {req.link && (
              <a
                href={req.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-dc-blurple hover:underline"
              >
                Download
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function InstallationContent() {
  return (
    <div className="space-y-5">
      <p className="text-dc-text-muted text-sm">Get the source code and install dependencies:</p>

      <div className="space-y-4">
        <div>
          <span className="text-[10px] font-bold tracking-widest text-dc-text-faint uppercase">
            Option A &mdash; Download ZIP
          </span>
          <div className="bg-dc-dark rounded-lg p-4 mt-1.5 flex items-center justify-between border border-dc-divider/50">
            <p className="text-sm text-dc-text-muted">
              Download the latest release from GitHub and extract it.
            </p>
            <a
              href="https://github.com/DanielHighETH/trenchcord/archive/refs/heads/main.zip"
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 ml-4 text-xs font-medium text-dc-blurple hover:underline"
            >
              Download ZIP
            </a>
          </div>
        </div>

        <div>
          <span className="text-[10px] font-bold tracking-widest text-dc-text-faint uppercase">
            Option B &mdash; Clone with Git
          </span>
          <div className="code-block mt-1.5">
            git clone https://github.com/DanielHighETH/trenchcord.git
          </div>
          <p className="text-xs text-dc-text-faint mt-1.5">Clones the full repository so you can pull updates later with <span className="font-mono text-dc-text-muted">git pull</span>.</p>
        </div>
      </div>

      <div>
        <span className="text-[10px] font-bold tracking-widest text-dc-text-faint uppercase">
          Install dependencies
        </span>
        <div className="code-block mt-1.5">
          cd trenchcord<br />
          npm install
        </div>
        <p className="text-xs text-dc-text-faint mt-1.5">Navigate into the project folder and install all required packages. That's it — no config files needed.</p>
      </div>
    </div>
  );
}

function TokenContent() {
  const steps = [
    'Open Discord in your browser at discord.com/app',
    'Open Developer Tools (F12 or Ctrl+Shift+I)',
    'Go to the Network tab',
    'Refresh the page (Ctrl+R)',
    'Search for @me in the network filter',
    'Click the request, go to Headers',
    'Find authorization in Request Headers — that\'s your token',
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-lg border border-dc-yellow/30 bg-dc-yellow/5 p-4">
        <AlertTriangle size={18} className="text-dc-yellow shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-dc-yellow">Keep your token safe</p>
          <p className="text-xs text-dc-text-muted mt-1">
            Never share your Discord token with anyone. Using self-bots is against Discord's Terms
            of Service — use at your own risk and for personal use only.
          </p>
        </div>
      </div>

      <div className="space-y-2.5">
        {steps.map((step, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="shrink-0 w-6 h-6 rounded bg-dc-dark border border-dc-divider flex items-center justify-center">
              <span className="text-[11px] font-bold text-dc-blurple">{i + 1}</span>
            </div>
            <div className="pt-0.5">
              <p className="text-sm text-dc-text-muted">{step}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-xs text-dc-text-faint">Once you have your token, paste it into the setup screen on first launch:</p>
        <img
          src="/discord_token.png"
          alt="Trenchcord token setup screen"
          className="rounded-lg border border-dc-divider shadow-lg shadow-black/30"
        />
      </div>
    </div>
  );
}

function RunningContent() {
  return (
    <div className="space-y-4">
      <p className="text-dc-text-muted text-sm">Build and start Trenchcord with a single command:</p>
      <div>
        <span className="text-[10px] font-bold tracking-widest text-dc-text-faint uppercase">
          Build &amp; Start
        </span>
        <div className="code-block mt-1.5">npm start</div>
      </div>
      <p className="text-dc-text-muted text-sm">
        This builds the frontend and backend, then starts the server. Open{' '}
        <span className="text-dc-blurple font-mono text-xs">http://localhost:3001</span>{' '}
        in your browser — you'll be prompted to paste your Discord token on first launch.
      </p>
      <div className="bg-dc-dark rounded-lg p-3 mt-2 border border-dc-divider/50">
        <p className="text-xs text-dc-text-faint">
          For development with hot-reload, use{' '}
          <span className="text-dc-text-muted font-mono">npm run dev</span>{' '}
          instead.
        </p>
      </div>
    </div>
  );
}

const tabContent: Record<TabId, React.FC> = {
  requirements: RequirementsContent,
  installation: InstallationContent,
  token: TokenContent,
  running: RunningContent,
};

export function Tutorial() {
  const [activeTab, setActiveTab] = useState<TabId>('requirements');

  const Content = tabContent[activeTab];

  return (
    <section id="tutorial" className="relative py-20 px-6 scroll-mt-20 pb-28">
      <div className="mx-auto max-w-3xl">
        <AnimatedSection className="text-center mb-10">
          <h2 className="text-2xl sm:text-4xl font-bold text-white">
            Setup Guide
          </h2>
          <p className="mt-3 text-dc-text-muted max-w-md mx-auto text-sm">
            From zero to monitoring in under 5 minutes.
          </p>
        </AnimatedSection>

        <AnimatedSection delay={0.15}>
          <div className="bg-dc-sidebar rounded-lg border border-dc-divider overflow-hidden">
            {/* Tab bar */}
            <div className="flex border-b border-dc-divider">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-xs font-medium transition-colors relative ${
                      isActive
                        ? 'text-white'
                        : 'text-dc-text-muted hover:text-dc-text hover:bg-dc-hover/30'
                    } ${
                      tab.id === 'token' && !isActive
                        ? 'text-dc-yellow/60 hover:text-dc-yellow/80'
                        : ''
                    }`}
                  >
                    <Icon size={14} />
                    <span className="hidden sm:inline">{tab.label}</span>
                    {isActive && (
                      <motion.div
                        layoutId="tab-indicator"
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-dc-blurple"
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="p-6 min-h-[300px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
                >
                  <Content />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
