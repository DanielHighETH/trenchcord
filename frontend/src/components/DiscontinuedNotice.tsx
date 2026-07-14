import { Download, ArrowRight } from 'lucide-react';

const DOWNLOAD_URL = 'https://github.com/DanielHighETH/trenchcord/releases/latest';
const DISCORD_URL = 'https://discord.gg/cDhrRVZ9xg';

export default function DiscontinuedNotice() {
  return (
    <div className="flex items-center justify-center min-h-full w-full bg-discord-dark px-6 py-12">
      <div className="w-full max-w-lg text-center">
        <img
          src="/trenchcord.png"
          alt="Trenchcord"
          className="w-16 h-16 rounded-2xl mx-auto mb-6"
        />

        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-3">
          The web app has moved to desktop
        </h1>

        <p className="text-discord-text-muted text-sm sm:text-base leading-relaxed mb-8">
          The hosted web version of Trenchcord is no longer maintained. Trenchcord now
          runs as a desktop app for Windows and macOS &mdash; it's faster, more
          reliable, and keeps your token and data entirely on your own machine.
        </p>

        <div className="flex flex-col sm:flex-row items-stretch justify-center gap-3">
          <a
            href={DOWNLOAD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-sm font-semibold text-white bg-discord-blurple hover:bg-discord-blurple-hover transition-colors"
          >
            <Download size={18} />
            Download for Desktop
          </a>
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-sm font-semibold text-white bg-discord-darker hover:bg-discord-dark border border-discord-dark transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 127.14 96.36" fill="currentColor" aria-hidden="true">
              <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z" />
            </svg>
            Join our Discord
          </a>
        </div>

        <a
          href="https://demo.trenchcord.app"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 mt-8 text-xs text-discord-channel-icon hover:text-discord-text transition-colors"
        >
          Try the live demo first
          <ArrowRight size={14} />
        </a>
      </div>
    </div>
  );
}
