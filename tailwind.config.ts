import type { Config } from 'tailwindcss';

/**
 * Over Exposure Productions — "cinematic dark" design system.
 *
 * The name is the brief: a blown-out highlight against deep shadow. Every
 * surface is a step on a warm-tinted ink ramp, the single hero accent is an
 * exposure amber, and the logo maroon carries destructive/brand emphasis.
 *
 * Contrast: every text token below is checked against `ink.950` (the page
 * ground) and clears WCAG AA 4.5:1 at body sizes. `brand.DEFAULT` is a surface
 * colour only — `brand.bright` is the text-safe maroon.
 */
const config: Config = {
  darkMode: 'class',
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Warm-tinted neutral ramp. 950 is the page, 900/850 are surfaces,
        // 800/700/600 are borders, 400 is the lowest text-safe grey.
        ink: {
          950: '#0a0a0b',
          900: '#111113',
          850: '#161619',
          800: '#1a1a1d',
          700: '#26262b',
          600: '#3a3a42',
          500: '#55555f',
          400: '#8b8b96', // 5.8:1 on ink-950 — the floor for placeholder text
        },
        exposure: {
          DEFAULT: '#e8b04b', // warm amber accent — 9.3:1 on ink-950
          soft: '#f2c876',
          deep: '#c8902f',
          dim: '#8a6520',
        },
        // Over Exposure Productions logo maroon (the "X" mark).
        brand: {
          DEFAULT: '#8e1f3f', // surfaces/fills only — 2.3:1, never text on dark
          soft: '#a83251',
          deep: '#6f172f',
          bright: '#e05572', // text-safe maroon — 5.4:1 on ink-950
        },
        // Semantic status tokens, all text-safe on ink-950/900.
        ok: { DEFAULT: '#4ade80', dim: '#16643a' },
        warn: { DEFAULT: '#fbbf24', dim: '#7a5312' },
        danger: { DEFAULT: '#f87171', dim: '#7f1d1d' },
        info: { DEFAULT: '#60a5fa', dim: '#1e40af' },
        paper: '#f6f5f2', // off-white for light-mode surfaces & primary text
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        arabic: ['var(--font-arabic)', 'Tahoma', 'sans-serif'],
      },
      borderRadius: {
        xl: '0.9rem',
        '2xl': '1.25rem',
        '3xl': '1.75rem',
      },
      letterSpacing: {
        display: '-0.03em',
      },
      boxShadow: {
        // A single elevation ramp so surfaces read as layered, not outlined.
        soft: '0 1px 2px rgba(0,0,0,0.35), 0 2px 8px -2px rgba(0,0,0,0.4)',
        lift: '0 2px 4px rgba(0,0,0,0.4), 0 12px 28px -8px rgba(0,0,0,0.55)',
        float: '0 8px 16px rgba(0,0,0,0.45), 0 32px 64px -16px rgba(0,0,0,0.7)',
        // The "exposure flare" — an amber bloom for the primary action.
        flare: '0 6px 20px -6px rgba(232,176,75,0.5)',
        'flare-lg': '0 10px 36px -8px rgba(232,176,75,0.55)',
      },
      backgroundImage: {
        'exposure-gradient': 'linear-gradient(135deg, #f2c876 0%, #e8b04b 45%, #c8902f 100%)',
        'brand-gradient': 'linear-gradient(135deg, #e8b04b 0%, #a83251 100%)',
      },
      transitionTimingFunction: {
        // Slight overshoot for entrances; sharp for exits.
        entrance: 'cubic-bezier(0.16, 1, 0.3, 1)',
        exit: 'cubic-bezier(0.4, 0, 1, 1)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'rise-in': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'sheet-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-ring': {
          '0%': { opacity: '0.55', transform: 'scale(0.9)' },
          '70%, 100%': { opacity: '0', transform: 'scale(1.7)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'rise-in': 'rise-in 280ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'scale-in': 'scale-in 220ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'sheet-up': 'sheet-up 260ms cubic-bezier(0.16, 1, 0.3, 1) both',
        shimmer: 'shimmer 1.6s infinite',
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};

export default config;
