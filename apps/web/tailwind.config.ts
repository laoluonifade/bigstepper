import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F2EFE8',
        card: '#FBFAF6',
        ink: {
          DEFAULT: '#121212',
          2: '#55524B',
          3: '#8A857B',
        },
        line: {
          DEFAULT: '#DCD7CC',
          strong: '#121212',
        },
        track: {
          DEFAULT: '#FF4D12',
          deep: '#C23500',
          wash: '#FFE4D8',
        },
        volt: '#E4FF3A',
        ok: { DEFAULT: '#12805C', wash: '#DDF1E8' },
        warn: { DEFAULT: '#9A6200', wash: '#FBEBC8' },
        bad: { DEFAULT: '#C2261B', wash: '#FADCD8' },
        medal: {
          gold: '#E3B23C',
          silver: '#B4B6B1',
          bronze: '#C77B3B',
        },
      },
      fontFamily: {
        sans: ['Archivo', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '4px',
        md: '6px',
      },
      boxShadow: {
        hard: '3px 3px 0 0 #121212',
        'hard-sm': '2px 2px 0 0 #121212',
      },
      keyframes: {
        blink: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.25' } },
        rise: { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: {
        blink: 'blink 1.4s ease-in-out infinite',
        rise: 'rise 240ms ease-out both',
      },
    },
  },
  plugins: [],
} satisfies Config;
