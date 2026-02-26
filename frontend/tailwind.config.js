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
          hover: '#35373c',
          blurple: '#5865f2',
          'blurple-hover': '#4752c4',
          green: '#23a559',
          red: '#f23f43',
          yellow: '#fee75c',
          text: '#dbdee1',
          'text-muted': '#949ba4',
          'text-link': '#00a8fc',
          'channel-icon': '#80848e',
          divider: '#3f4147',
          highlight: '#5865f21a',
          'mention-bg': '#5865f20d',
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
