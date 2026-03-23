/** @type {import('tailwindcss').Config} */
import tailwindcssAnimate from "tailwindcss-animate";
import tailwindScrollbarHide from "tailwind-scrollbar-hide";

export default {
  darkMode: ["class"],
  content: ["./src/renderer/**/*.{html,js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },

        /* New design system */
        canvas: {
          base: "var(--bg-base)",
          raised: "var(--bg-raised)",
          overlay: "var(--bg-overlay)",
          muted: "var(--bg-muted)",
        },
        ink: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          tertiary: "var(--text-tertiary)",
          faint: "var(--text-faint)",
        },
        accent: {
          DEFAULT: "var(--mi-accent, #82C0CC)",
          foreground: "hsl(var(--accent-foreground))",
          bg: "var(--mi-accent-bg, rgba(130,192,204,0.12))",
          border: "var(--mi-accent-border, rgba(130,192,204,0.22))",
          dark: "var(--mi-accent-dark, #3A7A87)",
          light: "var(--mi-accent-light, #B8DDE4)",
        },
        active: {
          DEFAULT: "var(--status-success)",
          bg: "rgba(var(--status-success-rgb), 0.14)",
          border: "rgba(var(--status-success-rgb), 0.28)",
        },

        /* Legacy compat — map old names to new tokens */
        indigo: {
          DEFAULT: "var(--mi-accent, #82C0CC)",
          light: "var(--mi-accent-light, #B8DDE4)",
          muted: "rgba(var(--mi-accent-rgb, 130,192,204), 0.15)",
        },
        rose: {
          DEFAULT: "var(--status-error)",
          muted: "rgba(var(--status-error-rgb), 0.15)",
        },
        emerald: {
          DEFAULT: "var(--status-success)",
          muted: "rgba(var(--status-success-rgb), 0.15)",
        },
        stroke: {
          subtle: "rgba(var(--ui-rgb), 0.07)",
          DEFAULT: "rgba(var(--ui-rgb), 0.10)",
          strong: "rgba(var(--ui-rgb), 0.18)",
        },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          tertiary: "var(--text-tertiary)",
        },
        status: {
          success: "var(--status-success)",
          warning: "var(--status-warning)",
          error: "var(--status-error)",
          info: "var(--status-info)",
        },
        surface: {
          DEFAULT: "var(--bg-overlay)",
          elevated: "var(--bg-muted)",
        },
        agent: {
          pill: "var(--bg-raised)",
          toggle: {
            inactive: "var(--bg-muted)",
            active: "var(--text-primary)",
          },
          bubble: "var(--bg-overlay)",
          card: "var(--bg-muted)",
        },
        "background-primary": "var(--bg-base)",
        "background-secondary": "var(--bg-raised)",
        "background-elevated": "var(--bg-overlay)",
        "border-subtle": "rgba(var(--ui-rgb), 0.07)",
      },
      borderRadius: {
        sm: "4px",
        md: "6px",
        lg: "10px",
        xl: "12px",
        "2xl": "16px",
        "6px": "6px",
        "10px": "10px",
        "16px": "16px",
      },
      borderWidth: {
        hairline: "0.5px",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "sans-serif"],
        serif: ["Newsreader", "Georgia", "serif"],
        display: ["JetBrains Mono", "monospace"],
        mono: ["JetBrains Mono", "monospace"],
      },
      fontSize: {
        base: "14px",
      },
      spacing: {
        xs: "4px",
        sm: "8px",
        md: "16px",
        lg: "24px",
        xl: "32px",
        "2xl": "48px",
      },
      width: {
        "sidebar-expanded": "220px",
        "sidebar-collapsed": "0px",
      },
      transitionProperty: {
        width: "width",
        spacing: "margin, padding",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "reveal-up": {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "reveal-fade": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "reveal-up": "reveal-up 0.5s ease-out both",
        "reveal-fade": "reveal-fade 0.4s ease-out both",
        shimmer: "shimmer 2s linear infinite",
      },
      transitionDuration: {
        instant: "50ms",
        fast: "150ms",
        normal: "250ms",
        slow: "400ms",
        reveal: "600ms",
      },
    },
  },
  plugins: [tailwindcssAnimate, tailwindScrollbarHide],
};
