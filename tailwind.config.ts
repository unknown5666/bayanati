import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Over Exposure Productions — cinematic dark-first palette.
        // "Over Exposure" = light blown out; the accent is a warm exposure amber.
        ink: {
          950: '#0a0a0b',
          900: '#111113',
          800: '#1a1a1d',
          700: '#26262b',
          600: '#3a3a42',
          500: '#55555f',
        },
        exposure: {
          DEFAULT: '#e8b04b', // warm amber accent
          soft: '#f2c876',
          deep: '#c8902f',
        },
        // Over Exposure Productions logo maroon (the "X" mark).
        brand: {
          DEFAULT: '#8e1f3f',
          soft: '#a83251',
          deep: '#6f172f',
        },
        paper: '#f6f5f2', // off-white for light-mode surfaces
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        arabic: ['var(--font-arabic)', 'Tahoma', 'sans-serif'],
      },
      borderRadius: {
        xl: '0.9rem',
        '2xl': '1.25rem',
      },
    },
  },
  plugins: [],
};

export default config;
