import plugin from 'tailwindcss/plugin';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  // Compile every hover: utility inside @media (hover:hover) — on touch
  // screens iOS otherwise applies hover styles on tap and they STICK until
  // the next tap, the classic sloppy-webview artifact. Desktop is unaffected.
  future: {
    hoverOnlyWhenSupported: true,
  },
  theme: {
    extend: {
      colors: {
        discord: {
          dark: '#1e1f22',
          darker: '#111214',
          sidebar: '#2b2d31',
          main: '#313338',
          input: '#383a40',
          hover: '#2e3035',
          'hover-light': '#35373c',
          blurple: '#5865f2',
          'blurple-hover': '#4752c4',
          green: '#23a559',
          red: '#f23f43',
          yellow: '#fee75c',
          text: '#dbdee1',
          'text-normal': '#dbdee1',
          'text-muted': '#949ba4',
          'text-link': '#00a8fc',
          'header-primary': '#f2f3f5',
          'header-secondary': '#b5bac1',
          'channel-icon': '#80848e',
          divider: '#3f4147',
          'embed-bg': '#2b2d31',
          highlight: '#5865f21a',
          'mention-bg': '#5865f20d',
          'scrollbar-thin-track': '#2b2d31',
          'scrollbar-thin-thumb': '#1a1b1e',
        },
      },
      // Entry animations for overlays. Durations follow iOS conventions:
      // menus snap in fast, sheets travel further so they get longer, and the
      // sheet curve is the UIKit sheet-presentation bezier.
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'pop-in': {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'sheet-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        'page-in': {
          from: { opacity: '0', transform: 'translateX(32px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'page-back': {
          from: { opacity: '0', transform: 'translateX(-32px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'pop-in': 'pop-in 120ms ease-out',
        'sheet-up': 'sheet-up 280ms cubic-bezier(0.32, 0.72, 0, 1)',
        'page-in': 'page-in 200ms ease-out',
        'page-back': 'page-back 200ms ease-out',
      },
      fontFamily: {
        discord: [
          'gg sans',
          'Noto Sans',
          'Helvetica Neue',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [
    // Phone-layout variants. `compact` = iOS app or any <768px viewport
    // (class set by the inline script in index.html before first paint);
    // `ios` = the iOS shell specifically. Desktop never has either class,
    // so compact:/ios: utilities are inert there.
    plugin(({ addVariant }) => {
      addVariant('compact', 'html.compact &');
      addVariant('ios', 'html.platform-ios &');
    }),
  ],
};
