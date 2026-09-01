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
        // DeepTrust warm paper and card design tokens
        paper: {
          DEFAULT: '#FFF6E3',
          2: '#EFEEE9',
        },
        card: {
          DEFAULT: '#FFFFFF',
          2: '#F8F8F6',
        },
        ink: {
          DEFAULT: '#0B5CD5',
          2: '#2C4E86',
          3: '#7386A8',
          slab: '#0E2E63',
        },
        slab: '#0E2E63',
        line: {
          DEFAULT: '#CECECE',
          2: '#AAAAAA',
        },
        // Clay / Terracotta primary brand accent
        clay: {
          DEFAULT: '#D97757',
          deep: '#B0512F',
          wash: '#F6E7DF',
        },
        brand: {
          50: '#F6E7DF',
          100: '#EFD3C6',
          200: '#E88F6B',
          300: '#D97757',
          400: '#B0512F',
          500: '#0B5CD5',
          600: '#0E2E63',
          700: '#000D59',
          800: '#031246',
          900: '#000836',
        },
        // Status Washes
        moss: {
          DEFAULT: '#3E7A55',
          wash: '#E4EFE7',
          text: '#2C5B3E',
          border: '#C6DFCF',
        },
        ochre: {
          DEFAULT: '#B98520',
          wash: '#F7EEDA',
          text: '#8A6212',
          border: '#EBD9AE',
        },
        brick: {
          DEFAULT: '#B23F35',
          wash: '#F7E3E0',
          text: '#8E2F27',
          border: '#EBC7C2',
        },
        slateWash: {
          DEFAULT: '#697788',
          wash: '#E9ECF0',
          text: '#4C596A',
          border: '#D3D9E1',
        },
        // Topbar Dark Chrome Theme
        bar: {
          DEFAULT: '#000D59',
          2: '#031246',
          accent: '#E88F6B',
          gold: '#F2C46B',
          ink: '#F0EDE9',
          ink2: '#A7B0D4',
          line: 'rgba(240, 237, 233, 0.16)',
          hover: 'rgba(240, 237, 233, 0.10)',
          on: 'rgba(240, 237, 233, 0.15)',
          cta: '#0033C4',
          ctaHover: '#0A45E4',
        },
        status: {
          verified: '#3E7A55',
          suspicious: '#B98520',
          false: '#B23F35',
        }
      },
      fontFamily: {
        sans: ['Roboto', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"Roboto Mono"', 'ui-monospace', 'monospace'],
        serif: ['Roboto', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
