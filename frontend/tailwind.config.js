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
        // Core ETRAI dark surfaces
        surface: {
          DEFAULT: '#050810',
          card: '#0c1427',
          cardHover: '#101a33',
          border: '#17233f',
          elevated: '#131f38'
        },
        // Compatible paper / card tokens mapped to dark theme
        paper: {
          DEFAULT: '#070b14',
          2: '#090f1e',
        },
        card: {
          DEFAULT: '#0c1427',
          2: '#101a33',
        },
        ink: {
          DEFAULT: '#ffffff',
          2: '#94a3b8',
          3: '#64748b',
          slab: '#ffffff',
        },
        // Primary brand & actions
        clay: {
          DEFAULT: '#6366f1',
          deep: '#8b5cf6',
          wash: 'rgba(99, 102, 241, 0.15)',
        },
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#1e1b4b',
        },
        // Status Washes
        moss: {
          DEFAULT: '#10b981',
          wash: 'rgba(16, 185, 129, 0.12)',
          text: '#10b981',
          border: 'rgba(16, 185, 129, 0.3)',
        },
        ochre: {
          DEFAULT: '#f59e0b',
          wash: 'rgba(245, 158, 11, 0.12)',
          text: '#f59e0b',
          border: 'rgba(245, 158, 11, 0.3)',
        },
        brick: {
          DEFAULT: '#ef4444',
          wash: 'rgba(239, 68, 68, 0.12)',
          text: '#ef4444',
          border: 'rgba(239, 68, 68, 0.3)',
        },
        slateWash: {
          DEFAULT: '#94a3b8',
          wash: 'rgba(30, 41, 59, 0.6)',
          text: '#94a3b8',
          border: 'rgba(51, 65, 85, 0.6)',
        },
        // Topbar Dark Theme
        bar: {
          DEFAULT: '#050810',
          2: '#0c1427',
          accent: '#22d3ee',
          gold: '#f59e0b',
          ink: '#ffffff',
          ink2: '#94a3b8',
          line: '#1e293b',
          hover: 'rgba(255, 255, 255, 0.05)',
          on: '#131f38',
          cta: '#6366f1',
          ctaHover: '#8b5cf6',
        },
        slateDark: {
          800: '#17233f',
          900: '#0c1427',
          950: '#070b14',
        },
        status: {
          verified: '#10b981',
          suspicious: '#f59e0b',
          false: '#ef4444',
        }
      },
      fontFamily: {
        sans: ['Inter', 'Roboto', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"Roboto Mono"', 'ui-monospace', 'monospace'],
        serif: ['Inter', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
