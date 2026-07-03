/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'shapes-void': 'var(--shapes-bg-void)',
        'shapes-surface': 'var(--shapes-bg-surface)',
        'shapes-surface-raised': 'var(--shapes-bg-surface-raised)',
        'shapes-hover': 'var(--shapes-bg-hover)',
        'shapes-violet': {
          100: 'var(--shapes-violet-100)',
          300: 'var(--shapes-violet-300)',
          500: 'var(--shapes-violet-500)',
          700: 'var(--shapes-violet-700)',
          900: 'var(--shapes-violet-900)',
        },
        'shapes-cyan-400': 'var(--shapes-cyan-400)',
        'shapes-success': 'var(--shapes-success)',
        'shapes-warning': 'var(--shapes-warning)',
        'shapes-danger': 'var(--shapes-danger)',
        'shapes-text-primary': 'var(--shapes-text-primary)',
        'shapes-text-secondary': 'var(--shapes-text-secondary)',
        'shapes-text-muted': 'var(--shapes-text-muted)',
      },
      borderRadius: {
        'shapes-sm': 'var(--shapes-radius-sm)',
        'shapes-md': 'var(--shapes-radius-md)',
        'shapes-lg': 'var(--shapes-radius-lg)',
      },
      boxShadow: {
        'shapes-glow': 'var(--shapes-glow)',
      }
    },
  },
  plugins: [],
}
