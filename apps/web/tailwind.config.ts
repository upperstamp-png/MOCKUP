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
          primary: '#7dd3fc', // Azul Bebê Principal (CTA & Accent)
          'on-primary': '#0c2340', // Ink escuro para contraste no Azul Bebê
          'primary-active': '#bae6fd', // Azul Bebê Hover/Active
          'primary-neutral': '#93c5fd', // Azul Bebê Neutro
          'primary-pale': '#e0f2fe', // Azul Bebê Pálido (Pills, Badges & Fundo Ativo)
          ink: '#0e1726', // Tipografia preto suave com tom nórdico
          'ink-deep': '#075985', // Azul profundo para texto em badges claros
          body: '#475569', // Texto secundário
          mute: '#94a3b8', // Texto muted / legendas
          canvas: '#ffffff', // Branco puro dos cartões
          'canvas-soft': '#eaf1f7', // Fundo geral suave
          border: '#d8e2ec', // Bordas sutis
          'border-subtle': '#e5edf5', // Divisores leves
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
      boxShadow: {
        wise: '0 4px 20px -2px rgba(14, 23, 38, 0.06)',
        'wise-lg': '0 12px 36px -4px rgba(14, 23, 38, 0.1)',
      },
    },
  },
  plugins: [],
};
export default config;
