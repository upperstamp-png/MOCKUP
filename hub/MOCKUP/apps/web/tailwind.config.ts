import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './features/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        wise: {
          'primary': 'rgb(var(--wise-primary, 49 91 222) / <alpha-value>)',
          'on-primary': 'rgb(var(--wise-on-primary, 12 35 64) / <alpha-value>)',
          'primary-active': 'rgb(var(--wise-primary-active, 64 105 235) / <alpha-value>)',
          'primary-neutral': 'rgb(var(--wise-primary-neutral, 147 197 253) / <alpha-value>)',
          'primary-pale': 'rgb(var(--wise-primary-pale, 224 242 254) / <alpha-value>)',
          'ink': 'rgb(var(--wise-ink, 248 248 248) / <alpha-value>)',
          'ink-deep': 'rgb(var(--wise-ink-deep, 7 89 133) / <alpha-value>)',
          'body': 'rgb(var(--wise-body, 199 199 199) / <alpha-value>)',
          'mute': 'rgb(var(--wise-mute, 162 162 162) / <alpha-value>)',
          'canvas': 'rgb(var(--wise-canvas, 24 24 24) / <alpha-value>)',
          'canvas-soft': 'rgb(var(--wise-canvas-soft, 12 12 12) / <alpha-value>)',
          'border': 'rgb(var(--wise-border, 62 62 62) / <alpha-value>)',
          'border-subtle': 'rgb(var(--wise-border-subtle, 41 41 41) / <alpha-value>)',
          positive: '#2ead4b',
          'positive-deep': '#054d28',
          warning: '#ffd11a',
          'warning-deep': '#b86700',
          negative: '#d03238',
          'negative-deep': '#a72027',
          'accent-orange': '#ffc091',
          'accent-cyan': '#38c8ff',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '20px',
        '3xl': '24px',
        '4xl': '32px',
      },
      opacity: {
        '4': '0.04',
        '6': '0.06',
        '8': '0.08',
        '12': '0.12',
        '14': '0.14',
        '16': '0.16',
        '18': '0.18',
        '22': '0.22',
        '24': '0.24',
      },
      boxShadow: {
        wise: '0 4px 20px -2px rgba(22, 22, 22, 0.06)',
        'wise-lg': '0 12px 36px -4px rgba(22, 22, 22, 0.1)',
      },
    },
  },
  plugins: [],
};
export default config;
