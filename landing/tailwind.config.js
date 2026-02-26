/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          deep: '#0f0f1a',
          section: '#1a1a2e',
          card: 'rgba(255, 255, 255, 0.05)',
        },
        accent: {
          blurple: '#5865F2',
          purple: '#7c3aed',
          evm: '#fee75c',
          solana: '#14f195',
        },
      },
      fontFamily: {
        sans: [
          'gg sans',
          'Noto Sans',
          'Helvetica Neue',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
      },
      backgroundImage: {
        'gradient-accent': 'linear-gradient(135deg, #5865F2, #7c3aed)',
      },
    },
  },
  plugins: [],
};
