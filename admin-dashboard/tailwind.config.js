/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Space Grotesk', 'sans-serif'],
        display: ['Syncopate', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        surface2: 'var(--surface2)',
        border: 'var(--border-color)',
        borderBright: 'var(--border-bright)',
        alpha: {
          DEFAULT: 'var(--alpha-neon)',
          dim: 'var(--alpha-dim)'
        },
        beta: {
          DEFAULT: 'var(--beta-neon)',
          dim: 'var(--beta-dim)'
        },
        gold: {
          DEFAULT: 'var(--gold)',
          dim: 'var(--gold-dim)'
        },
        green: 'var(--green)',
        text: 'var(--text)',
        textMuted: 'var(--text-muted)',
        textDim: 'var(--text-dim)'
      }
    },
  },
  plugins: [],
}
