/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
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
  plugins: [],
};
