import { Github, ExternalLink } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t border-dc-divider bg-dc-sidebar py-8 px-6">
      <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <span className="text-sm font-semibold text-dc-text">Trenchcord</span>
        <p className="text-[11px] text-dc-text-faint text-center max-w-md leading-relaxed">
          Trenchcord is an independent project and is not affiliated with Discord Inc. Using
          self-bots is against Discord's Terms of Service. This tool is for personal and
          educational use only. Use at your own risk.
        </p>
        <div className="flex items-center gap-3">
          <a
            href="https://demo.trenchcord.app"
            target="_blank"
            rel="noopener noreferrer"
            className="text-dc-text-muted hover:text-dc-text transition-colors flex items-center gap-1.5 text-xs"
          >
            <ExternalLink size={14} />
            Demo
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
