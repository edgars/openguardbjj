import type { Config } from 'tailwindcss';

// Cores via variáveis CSS (canais RGB) para o tema claro/escuro: ver app/globals.css.
// No tema claro as escalas são invertidas (50↔950, 100↔900, …), então `text-zinc-100`
// vira texto escuro e `bg-red-950/40` vira um fundo claro, sem duplicar classes.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
const scale = (p: string) => Object.fromEntries(SHADES.map((s) => [s, v(`${p}-${s}`)]));

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        mat: { 950: v('mat-950'), 900: v('mat-900'), 800: v('mat-800'), 700: v('mat-700'), 600: v('mat-600') },
        belt: { DEFAULT: v('belt'), soft: v('belt-soft') },
        ink: '#0b0d10',
        zinc: scale('zinc'),
        red: scale('red'),
        amber: scale('amber'),
        emerald: scale('emerald'),
        sky: scale('sky'),
        teal: scale('teal'),
        orange: scale('orange'),
        indigo: scale('indigo'),
        fuchsia: scale('fuchsia'),
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
