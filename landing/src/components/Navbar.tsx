import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Github, Hash, ExternalLink } from 'lucide-react';

const navLinks: { label: string; href: string; external?: boolean }[] = [
  { label: 'Download', href: '#download' },
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Security', href: '#security' },
  { label: 'Setup', href: '#setup' },
  { label: 'Changelog', href: '#changelog' },
  { label: 'Account', href: 'https://dashboard.trenchcord.app', external: true },
];

export function Navbar() {
  const [activeSection, setActiveSection] = useState('');
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);

      const els = navLinks
        .filter((l) => !l.external)
        .map((l) => document.getElementById(l.href.slice(1)))
        .filter((el): el is HTMLElement => el !== null);

      const nearBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 300;
      if (nearBottom && els.length) {
        const last = els.reduce((a, b) => (a.offsetTop > b.offsetTop ? a : b));
        setActiveSection(last.id);
        return;
      }

      // Active = the section whose top most recently crossed the 120px line,
      // independent of nav-link ordering vs. DOM ordering.
      let current = '';
      let currentTop = -Infinity;
      for (const el of els) {
        const top = el.getBoundingClientRect().top;
        if (top <= 120 && top > currentTop) {
          currentTop = top;
          current = el.id;
        }
      }
      setActiveSection(current);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    setMobileOpen(false);
    window.history.pushState(null, '', href);
    const el = document.querySelector(href);
    el?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <motion.nav
      initial={{ y: -80 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.4, 0.25, 1] }}
      className={`fixed top-0 left-0 right-0 z-50 transition-colors duration-200 ${
        scrolled || mobileOpen
          ? 'bg-dc-sidebar shadow-md shadow-black/20'
          : 'bg-dc-sidebar/80'
      }`}
    >
      <div className="mx-auto max-w-6xl h-12 px-4 flex items-center justify-between">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setMobileOpen(false);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="flex items-center gap-2 text-base font-bold text-dc-text hover:text-white transition-colors"
        >
          <img src="/trenchcord.png" alt="Trenchcord" className="w-6 h-6 rounded" />
          Trenchcord
        </a>

        <div className="hidden sm:flex items-center gap-1">
          {navLinks.map((link) => {
            const isActive = !link.external && activeSection === link.href.slice(1);
            return (
              <a
                key={link.href}
                href={link.href}
                {...(link.external
                  ? { target: '_blank', rel: 'noopener noreferrer' }
                  : { onClick: (e: React.MouseEvent<HTMLAnchorElement>) => handleClick(e, link.href) }
                )}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
                  isActive
                    ? 'bg-dc-hover text-white'
                    : 'text-dc-text-muted hover:text-dc-text hover:bg-dc-hover/50'
                }`}
              >
                {link.external ? (
                  <ExternalLink size={14} className="text-dc-channel-icon" />
                ) : (
                  <Hash size={14} className="text-dc-channel-icon" />
                )}
                {link.label.toLowerCase()}
              </a>
            );
          })}
          <div className="w-px h-5 bg-dc-divider mx-2" />
          <a
            href="https://discord.gg/cDhrRVZ9xg"
            target="_blank"
            rel="noopener noreferrer"
            className="text-dc-text-muted hover:text-dc-text transition-colors p-1.5 rounded hover:bg-dc-hover/50"
            aria-label="Discord"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" /></svg>
          </a>
          <a
            href="https://x.com/trenchcordapp"
            target="_blank"
            rel="noopener noreferrer"
            className="text-dc-text-muted hover:text-dc-text transition-colors p-1.5 rounded hover:bg-dc-hover/50"
            aria-label="X / Twitter"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
          </a>
          <a
            href="https://github.com/DanielHighETH/trenchcord"
            target="_blank"
            rel="noopener noreferrer"
            className="text-dc-text-muted hover:text-dc-text transition-colors p-1.5 rounded hover:bg-dc-hover/50"
          >
            <Github size={18} />
          </a>
        </div>

        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="sm:hidden text-dc-text-muted hover:text-dc-text transition-colors"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="sm:hidden overflow-hidden border-t border-dc-divider bg-dc-sidebar"
          >
            <div className="px-4 py-3 flex flex-col gap-1">
              {navLinks.map((link) => {
                const isActive = !link.external && activeSection === link.href.slice(1);
                return (
                  <a
                    key={link.href}
                    href={link.href}
                    {...(link.external
                      ? { target: '_blank', rel: 'noopener noreferrer' }
                      : { onClick: (e: React.MouseEvent<HTMLAnchorElement>) => handleClick(e, link.href) }
                    )}
                    className={`flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
                      isActive
                        ? 'bg-dc-hover text-white'
                        : 'text-dc-text-muted hover:text-dc-text hover:bg-dc-hover/50'
                    }`}
                  >
                    {link.external ? (
                      <ExternalLink size={14} className="text-dc-channel-icon" />
                    ) : (
                      <Hash size={14} className="text-dc-channel-icon" />
                    )}
                    {link.label.toLowerCase()}
                  </a>
                );
              })}
              <a
                href="https://discord.gg/cDhrRVZ9xg"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 rounded text-sm text-dc-text-muted hover:text-dc-text hover:bg-dc-hover/50 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" /></svg>
                Discord
              </a>
              <a
                href="https://x.com/trenchcordapp"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 rounded text-sm text-dc-text-muted hover:text-dc-text hover:bg-dc-hover/50 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                Twitter / X
              </a>
              <a
                href="https://github.com/DanielHighETH/trenchcord"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 rounded text-sm text-dc-text-muted hover:text-dc-text hover:bg-dc-hover/50 transition-colors"
              >
                <Github size={14} />
                GitHub
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
