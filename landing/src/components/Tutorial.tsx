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
      <p className="text-white/60 text-sm">Make sure you have the following installed:</p>
      <div className="space-y-3">
        {[
          { name: 'Node.js', version: 'v18 or higher', link: 'https://nodejs.org' },
          { name: 'npm', version: 'Comes with Node.js', link: null },
          { name: 'Git', version: 'Any recent version', link: 'https://git-scm.com' },
        ].map((req) => (
          <div key={req.name} className="glass-card rounded-lg p-4 flex items-center justify-between">
            <div>
              <span className="text-white font-medium text-sm">{req.name}</span>
              <span className="text-white/40 text-xs ml-2">{req.version}</span>
            </div>
            {req.link && (
              <a
                href={req.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-accent-blurple hover:underline"
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
    <div className="space-y-4">
      <p className="text-white/60 text-sm">Clone the repository and install dependencies:</p>
      <div className="space-y-3">
        <div>
          <span className="text-[10px] font-bold tracking-widest text-accent-blurple/60 uppercase">
            Clone the repo
          </span>
          <div className="code-block mt-1.5 text-white/70">
            git clone https://github.com/DanielHighETH/trenchcord.git
          </div>
        </div>
        <div>
          <span className="text-[10px] font-bold tracking-widest text-accent-blurple/60 uppercase">
            Install dependencies
          </span>
          <div className="code-block mt-1.5 text-white/70">
            cd trenchcord<br />
            npm install
          </div>
        </div>
        <div>
          <span className="text-[10px] font-bold tracking-widest text-accent-blurple/60 uppercase">
            Configure environment
          </span>
          <div className="code-block mt-1.5 text-white/70">
            cp .env.example .env<br />
            <span className="text-white/40"># Edit .env and add your Discord token</span>
          </div>
        </div>
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
      <div className="flex items-start gap-3 rounded-xl border border-accent-evm/30 bg-accent-evm/5 p-4">
        <AlertTriangle size={18} className="text-accent-evm shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-accent-evm">Keep your token safe</p>
          <p className="text-xs text-white/50 mt-1">
            Never share your Discord token with anyone. Using self-bots is against Discord's Terms
            of Service — use at your own risk and for personal use only.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {steps.map((step, i) => (
          <div key={i} className="flex items-start gap-4">
            <div className="shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-accent-blurple/20 to-accent-purple/20 border border-white/10 flex items-center justify-center">
              <span className="text-xs font-bold text-accent-blurple">{i + 1}</span>
            </div>
            <div className="pt-0.5">
              <p className="text-sm text-white/70">{step}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RunningContent() {
  return (
    <div className="space-y-4">
      <p className="text-white/60 text-sm">Build and start Trenchcord with a single command:</p>
      <div>
        <span className="text-[10px] font-bold tracking-widest text-accent-blurple/60 uppercase">
          Build &amp; Start
        </span>
        <div className="code-block mt-1.5 text-white/70">npm start</div>
      </div>
      <p className="text-white/50 text-sm">
        This builds the frontend and backend, then starts the server. Open{' '}
        <span className="text-accent-blurple font-mono text-xs">http://localhost:3001</span>{' '}
        in your browser once it's running.
      </p>
      <div className="glass-card rounded-lg p-3 mt-2">
        <p className="text-xs text-white/40">
          For development with hot-reload, use{' '}
          <span className="text-white/60 font-mono">npm run dev</span>{' '}
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
  const [activeTab, setActiveTab] = useState<TabId>('token');

  const Content = tabContent[activeTab];

  return (
    <section id="tutorial" className="relative py-28 px-6">
      <div className="mx-auto max-w-3xl">
        <AnimatedSection className="text-center mb-12">
          <h2 className="text-3xl sm:text-5xl font-bold gradient-text inline-block pb-1">
            Setup Guide
          </h2>
          <p className="mt-4 text-white/50 max-w-md mx-auto">
            From zero to monitoring in under 5 minutes.
          </p>
        </AnimatedSection>

        <AnimatedSection delay={0.15}>
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="flex border-b border-white/5">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-3.5 text-xs font-medium transition-all relative ${
                      isActive
                        ? 'text-white'
                        : 'text-white/40 hover:text-white/60'
                    } ${
                      tab.id === 'token' && !isActive
                        ? 'text-accent-evm/60 hover:text-accent-evm/80'
                        : ''
                    }`}
                  >
                    <Icon size={14} />
                    <span className="hidden sm:inline">{tab.label}</span>
                    {isActive && (
                      <motion.div
                        layoutId="tab-indicator"
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-accent-blurple to-accent-purple"
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
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
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
