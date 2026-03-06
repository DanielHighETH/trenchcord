import { Github, ExternalLink } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t border-dc-divider bg-dc-sidebar py-8 px-6">
      <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <span className="flex items-center gap-2 text-sm font-semibold text-dc-text">
          <img src="/trenchcord.png" alt="Trenchcord" className="w-5 h-5 rounded" />
          Trenchcord
        </span>
        <p className="text-[11px] text-dc-text-faint text-center max-w-md leading-relaxed">
          Trenchcord is an independent project and is not affiliated with Discord Inc. Using
          self-bots is against Discord's Terms of Service. This tool is for personal and
          educational use only. Use at your own risk.
        </p>
        <div className="flex items-center gap-3">
          <a
            href="https://app.trenchcord.app"
            target="_blank"
            rel="noopener noreferrer"
            className="text-dc-text-muted hover:text-dc-text transition-colors flex items-center gap-1.5 text-xs"
          >
            <ExternalLink size={14} />
            Launch App
          </a>
          <a
            href="https://x.com/trenchcordapp"
            target="_blank"
            rel="noopener noreferrer"
            className="text-dc-text-muted hover:text-dc-text transition-colors"
            aria-label="X / Twitter"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
          </a>
          <a
            href="https://github.com/DanielHighETH/trenchcord"
            target="_blank"
            rel="noopener noreferrer"
            className="text-dc-text-muted hover:text-dc-text transition-colors"
          >
            <Github size={18} />
          </a>
        </div>
      </div>
    </footer>
  );
}
