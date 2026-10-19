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
      transitionTimingFunction: {
        out: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
      keyframes: {
        blink: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.25' } },
        rise: { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
        'rise-lg': { from: { opacity: '0', transform: 'translateY(18px)' }, to: { opacity: '1', transform: 'none' } },
        fade: { from: { opacity: '0' }, to: { opacity: '1' } },
        reveal: { from: { transform: 'translateY(105%)' }, to: { transform: 'none' } },
        pop: {
          '0%': { opacity: '0', transform: 'scale(0.6)' },
          '60%': { opacity: '1', transform: 'scale(1.06)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'slide-in': { from: { opacity: '0', transform: 'translateX(28px)' }, to: { opacity: '1', transform: 'none' } },
        'sheet-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'none' } },
        'grow-y': { from: { transform: 'scaleY(0)' }, to: { transform: 'scaleY(1)' } },
        'grow-x': { from: { transform: 'scaleX(0)' }, to: { transform: 'scaleX(1)' } },
        ring: { '0%': { opacity: '0.7', transform: 'scale(1)' }, '100%': { opacity: '0', transform: 'scale(2.6)' } },
        stride: { '0%, 100%': { transform: 'scaleY(0.35)' }, '50%': { transform: 'scaleY(1)' } },
        sweep: { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(100%)' } },
        shimmer: { from: { backgroundPosition: '200% 0' }, to: { backgroundPosition: '-200% 0' } },
      },
      animation: {
        blink: 'blink 1.4s ease-in-out infinite',
        rise: 'rise 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'rise-lg': 'rise-lg 560ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        fade: 'fade 400ms ease-out both',
        reveal: 'reveal 720ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        pop: 'pop 420ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'slide-in': 'slide-in 600ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'sheet-up': 'sheet-up 320ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'grow-y': 'grow-y 700ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'grow-x': 'grow-x 800ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        ring: 'ring 1.6s cubic-bezier(0.2, 0.8, 0.2, 1) infinite',
        stride: 'stride 900ms ease-in-out infinite',
        sweep: 'sweep 1.8s linear infinite',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
