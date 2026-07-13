import type { Config } from 'tailwindcss';

/**
 * Tailwind config — consumes the semantic tokens defined in app/globals.css.
 *
 * Color utility names (e.g. `bg-primary`, `text-text-primary`) are generated
 * from the same HSL CSS variables so light/dark switching Just Works.
 *
 * Font families are also CSS variables, populated by next/font in app/layout.tsx.
 */
const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './features/**/*.{ts,tsx}',
    './agents/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      /* ---------------------------------------------------------------------
       * Colors — every entry maps to an HSL triplet from app/globals.css
       * ------------------------------------------------------------------- */
      colors: {
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--border) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--text-primary) / <alpha-value>)',
        surface: {
          DEFAULT: 'hsl(var(--surface) / <alpha-value>)',
          elevated: 'hsl(var(--surface-elevated) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--text-muted) / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
          hover: 'hsl(var(--primary-hover) / <alpha-value>)',
          soft: 'hsl(var(--primary-soft) / <alpha-value>)',
          foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
          hover: 'hsl(var(--secondary-hover) / <alpha-value>)',
          foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          hover: 'hsl(var(--accent-hover) / <alpha-value>)',
          foreground: 'hsl(var(--accent-foreground) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'hsl(var(--success) / <alpha-value>)',
          foreground: 'hsl(var(--success-foreground) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning) / <alpha-value>)',
          foreground: 'hsl(var(--warning-foreground) / <alpha-value>)',
        },
        error: {
          DEFAULT: 'hsl(var(--error) / <alpha-value>)',
          foreground: 'hsl(var(--error-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'hsl(var(--error) / <alpha-value>)',
          foreground: 'hsl(var(--error-foreground) / <alpha-value>)',
        },
        text: {
          DEFAULT: 'hsl(var(--text-primary) / <alpha-value>)',
          primary: 'hsl(var(--text-primary) / <alpha-value>)',
          secondary: 'hsl(var(--text-secondary) / <alpha-value>)',
          muted: 'hsl(var(--text-muted) / <alpha-value>)',
          inverse: 'hsl(var(--text-inverse) / <alpha-value>)',
        },
        // Legacy aliases kept for backwards compatibility with existing
        // shadcn-style class names that some packages may inject.
        card: {
          DEFAULT: 'hsl(var(--surface) / <alpha-value>)',
          foreground: 'hsl(var(--text-primary) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'hsl(var(--surface-elevated) / <alpha-value>)',
          foreground: 'hsl(var(--text-primary) / <alpha-value>)',
        },

        /* ---------- Raw brand scale (logo-derived) ----------
         * Use these only for gradients, illustrations, or one-off accents.
         * Components should still prefer the semantic tokens above. */
        brand: {
          indigo: {
            50: 'var(--brand-indigo-50)',
            100: 'var(--brand-indigo-100)',
            200: 'var(--brand-indigo-200)',
            300: 'var(--brand-indigo-300)',
            400: 'var(--brand-indigo-400)',
            500: 'var(--brand-indigo-500)', // logo primary
            600: 'var(--brand-indigo-600)', // logo mid
            700: 'var(--brand-indigo-700)', // logo deep
            800: 'var(--brand-indigo-800)',
            900: 'var(--brand-indigo-900)',
          },
          cyan: {
            300: 'var(--brand-cyan-300)',
            400: 'var(--brand-cyan-400)',
            500: 'var(--brand-cyan-500)', // logo accent
            600: 'var(--brand-cyan-600)',
            700: 'var(--brand-cyan-700)',
          },
          navy: {
            700: 'var(--brand-navy-700)',
            800: 'var(--brand-navy-800)',
            900: 'var(--brand-navy-900)', // wordmark
          },
        },
      },

      /* ---------------------------------------------------------------------
       * Border radii — wire to the CSS variables
       * ------------------------------------------------------------------- */
      borderRadius: {
        none: '0',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': '1.25rem',
        '3xl': '1.5rem',
        full: '9999px',
        DEFAULT: 'var(--radius)',
      },

      /* ---------------------------------------------------------------------
       * Font families — CSS variables set by next/font in app/layout.tsx
       * ------------------------------------------------------------------- */
      fontFamily: {
        sans: ['var(--font-sans)'],
        display: ['var(--font-display)'],
        mono: ['var(--font-mono)'],
      },

      /* ---------------------------------------------------------------------
       * Typography tokens (also available as utility classes)
       * ------------------------------------------------------------------- */
      fontSize: {
        display: [
          'var(--text-display)',
          { lineHeight: 'var(--leading-none)', letterSpacing: 'var(--tracking-tighter)' },
        ],
        h1: [
          'var(--text-h1)',
          { lineHeight: 'var(--leading-tight)', letterSpacing: 'var(--tracking-tight)' },
        ],
        h2: [
          'var(--text-h2)',
          { lineHeight: 'var(--leading-tight)', letterSpacing: 'var(--tracking-tight)' },
        ],
        h3: [
          'var(--text-h3)',
          { lineHeight: 'var(--leading-snug)', letterSpacing: 'var(--tracking-tight)' },
        ],
        h4: ['var(--text-h4)', { lineHeight: 'var(--leading-snug)' }],
        h5: ['var(--text-h5)', { lineHeight: 'var(--leading-snug)' }],
        h6: ['var(--text-h6)', { lineHeight: 'var(--leading-snug)' }],
        body: ['var(--text-body)', { lineHeight: 'var(--leading-normal)' }],
        caption: ['var(--text-caption)', { lineHeight: 'var(--leading-snug)' }],
        small: ['var(--text-small)', { lineHeight: 'var(--leading-snug)' }],
        xs: ['var(--text-xs)', { lineHeight: 'var(--leading-snug)' }],
      },
      fontWeight: {
        normal: 'var(--weight-regular)',
        medium: 'var(--weight-medium)',
        semibold: 'var(--weight-semibold)',
        bold: 'var(--weight-bold)',
      },

      /* ---------------------------------------------------------------------
       * Logo gradient — for use in hero text, brand marks, etc.
       * `bg-gradient-brand` → indigo → cyan, matching the SONDA logo.
       * ------------------------------------------------------------------- */
      backgroundImage: {
        'gradient-brand':
          'linear-gradient(135deg, var(--brand-indigo-500) 0%, var(--brand-indigo-600) 45%, var(--brand-cyan-500) 100%)',
        'gradient-brand-soft':
          'linear-gradient(135deg, var(--brand-indigo-100) 0%, var(--brand-cyan-300) 100%)',
      },
      backgroundClipText: {
        brand: 'text',
      },

      /* ---------------------------------------------------------------------
       * Shadows tuned to the brand (subtle blue tint)
       * ------------------------------------------------------------------- */
      boxShadow: {
        xs: '0 1px 2px 0 rgb(10 14 39 / 0.04)',
        sm: '0 1px 3px 0 rgb(10 14 39 / 0.06), 0 1px 2px -1px rgb(10 14 39 / 0.06)',
        md: '0 4px 8px -2px rgb(10 14 39 / 0.08), 0 2px 4px -2px rgb(10 14 39 / 0.06)',
        lg: '0 12px 24px -6px rgb(10 14 39 / 0.10), 0 4px 8px -4px rgb(10 14 39 / 0.06)',
        xl: '0 24px 48px -12px rgb(10 14 39 / 0.18), 0 8px 16px -8px rgb(10 14 39 / 0.08)',
        'brand-sm': '0 4px 14px -2px rgb(88 96 248 / 0.25)',
        'brand-md': '0 8px 24px -4px rgb(88 96 248 / 0.35)',
        'brand-lg': '0 16px 40px -6px rgb(88 96 248 / 0.45)',
        'inner-brand': 'inset 0 2px 4px 0 rgb(88 96 248 / 0.10)',
      },

      /* ---------------------------------------------------------------------
       * Animations (already present in the original config; preserved)
       * ------------------------------------------------------------------- */
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.4s ease-out',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
