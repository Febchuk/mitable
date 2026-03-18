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
          base: "#1A1916",
          raised: "#211F1B",
          overlay: "#2A2824",
          muted: "#33312B",
        },
        ink: {
          primary: "#ECE8E0",
          secondary: "#9B9689",
          tertiary: "#6B665C",
          faint: "#4A4640",
        },
        accent: {
          DEFAULT: "#9B84E8",
          foreground: "hsl(var(--accent-foreground))",
          bg: "rgba(155,132,232,0.12)",
          border: "rgba(155,132,232,0.22)",
        },
        active: {
          DEFAULT: "#3A9B6B",
          bg: "rgba(58,155,107,0.14)",
          border: "rgba(58,155,107,0.28)",
        },

        /* Legacy compat — map old names to new tokens */
        indigo: {
          DEFAULT: "#9B84E8",
          light: "#B0A0F0",
          muted: "rgba(155, 132, 232, 0.15)",
        },
        rose: {
          DEFAULT: "#E87474",
          muted: "rgba(232, 116, 116, 0.15)",
        },
        emerald: {
          DEFAULT: "#3A9B6B",
          muted: "rgba(58, 155, 107, 0.15)",
        },
        stroke: {
          subtle: "rgba(236, 232, 224, 0.07)",
          DEFAULT: "rgba(236, 232, 224, 0.10)",
          strong: "rgba(236, 232, 224, 0.18)",
        },
        text: {
          primary: "#ECE8E0",
          secondary: "#9B9689",
          tertiary: "#6B665C",
        },
        status: {
          success: "#3A9B6B",
          warning: "#D4A27A",
          error: "#E87474",
          info: "#9B84E8",
        },
        surface: {
          DEFAULT: "#2A2824",
          elevated: "#33312B",
        },
        agent: {
          pill: "#211F1B",
          toggle: {
            inactive: "#33312B",
            active: "#ECE8E0",
          },
          bubble: "#2A2824",
          card: "#33312B",
        },
        "background-primary": "#1A1916",
        "background-secondary": "#211F1B",
        "background-elevated": "#2A2824",
        "border-subtle": "rgba(236, 232, 224, 0.07)",
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
