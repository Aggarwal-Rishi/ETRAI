/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // DeepTrust Paper tokens
        paper: {
          DEFAULT: 'var(--paper, #FFF6E3)',
          2: 'var(--paper-2, #EFEEE9)',
        },
        // DeepTrust Card tokens
        card: {
          DEFAULT: 'var(--card, #FFFFFF)',
          2: 'var(--card-2, #F8F8F6)',
        },
        // DeepTrust Ink tokens (text)
        ink: {
          DEFAULT: 'var(--ink, #0B5CD5)',
          2: 'var(--ink-2, #2C4E86)',
          3: 'var(--ink-3, #7386A8)',
          slab: 'var(--slab, #0E2E63)',
        },
        // DeepTrust Accent / Action (Clay)
        clay: {
          DEFAULT: 'var(--clay, #D97757)',
          deep: 'var(--clay-deep, #B0512F)',
          wash: 'var(--clay-wash, #F6E7DF)',
        },
        // DeepTrust Status Washes
        moss: {
          DEFAULT: '#3E7A55',
          wash: 'var(--moss-wash, #E4EFE7)',
          text: '#2C5B3E',
          border: '#C6DFCF',
        },
        ochre: {
          DEFAULT: '#B98520',
          wash: 'var(--ochre-wash, #F7EEDA)',
          text: '#8A6212',
          border: '#EBD9AE',
        },
        brick: {
          DEFAULT: '#B23F35',
          wash: 'var(--brick-wash, #F7E3E0)',
          text: '#8E2F27',
          border: '#EBC7C2',
        },
        slateWash: {
          DEFAULT: '#697788',
          wash: 'var(--slate-wash, #E9ECF0)',
          text: '#4C596A',
          border: '#D3D9E1',
        },
        // DeepTrust Topbar Navy & Accents
        bar: {
          DEFAULT: 'var(--bar, #000D59)',
          2: '#031246',
          accent: 'var(--bar-accent, #E88F6B)',
          gold: 'var(--bar-gold, #F2C46B)',
          ink: '#F0EDE9',
          ink2: '#A7B0D4',
          line: 'rgba(240, 237, 233, 0.16)',
          hover: 'rgba(240, 237, 233, 0.10)',
          on: 'rgba(240, 237, 233, 0.15)',
          cta: '#0033C4',
          ctaHover: '#0A45E4',
        },
        // Preserved platform tokens for existing views
        brand: {
          50: '#f0f4ff',
          100: '#e0e9ff',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          900: '#1e1b4b',
        },
        slateDark: {
          800: '#0f172a',
          900: '#0b0f19',
          950: '#060911',
        },
        status: {
          verified: '#10b981',
          suspicious: '#f59e0b',
          false: '#ef4444',
        }
      },
      fontFamily: {
        sans: ['Roboto', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"Roboto Mono"', 'ui-monospace', 'monospace'],
        serif: ['Roboto', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}
