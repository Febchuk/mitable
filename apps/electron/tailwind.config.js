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
          light: "#818CF8",
          hover: "#4F46E5",
          pressed: "#4338CA",
        },
        /* New accent system */
        indigo: {
          DEFAULT: "#6366F1",
          light: "#818CF8",
          muted: "rgba(99, 102, 241, 0.15)",
        },
        rose: {
          DEFAULT: "#F472B6",
          muted: "rgba(244, 114, 182, 0.15)",
        },
        emerald: {
          DEFAULT: "#34D399",
          muted: "rgba(52, 211, 153, 0.15)",
        },
        /* Text colors with new naming */
        ink: {
          primary: "#F4F4F5",
          secondary: "#A1A1AA",
          tertiary: "#52525B",
        },
        /* Border system */
        stroke: {
          subtle: "rgba(255, 255, 255, 0.06)",
          DEFAULT: "rgba(255, 255, 255, 0.12)",
          strong: "rgba(255, 255, 255, 0.24)",
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
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        /* New design system - canvas backgrounds */
        canvas: {
          base: "#0C0C0E",
          raised: "#141418",
          overlay: "#1C1C22",
          muted: "#24242C",
        },
        /* Legacy mappings for compatibility */
        "background-primary": "#0C0C0E",
        "background-secondary": "#141418",
        "background-elevated": "#1C1C22",
        "border-subtle": "rgba(255, 255, 255, 0.06)",
        "integration-card": "#3E3D3D",
        "week-inactive": "#292945",
        agent: {
          pill: "#1A1A1A",
          toggle: {
            inactive: "#3E3D3D",
            active: "#FFFFFF",
          },
          bubble: "#2A2A2A",
          card: "#3A3560",
        },
        surface: {
          DEFAULT: "#2A2A2A",
          elevated: "#3A3A3A",
        },
        text: {
          primary: "#FFFFFF",
          secondary: "#A1A1A1",
          tertiary: "#6B6B6B",
        },
        status: {
          success: "#22C55E",
          warning: "#F59E0B",
          error: "#EF4444",
          info: "#3B82F6",
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
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        "6px": "6px",
        "10px": "10px",
        "16px": "16px",
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans", "system-ui", "sans-serif"],
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
        "sidebar-expanded": "300px",
        "sidebar-collapsed": "80px",
      },
      transitionProperty: {
        width: "width",
        spacing: "margin, padding",
      },
      transitionDuration: {
        300: "300ms",
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
        gradient: {
          "0%, 100%": { "background-position": "0% 50%" },
          "50%": { "background-position": "100% 50%" },
        },
        "reveal-up": {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "reveal-fade": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "hover-lift": {
          to: { transform: "translateY(-2px)" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 8px rgba(99, 102, 241, 0.4)" },
          "50%": { boxShadow: "0 0 16px rgba(99, 102, 241, 0.6)" },
        },
        breathe: {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.02)" },
        },
        "icon-tilt": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(3deg)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        gradient: "gradient 3s ease infinite",
        "reveal-up": "reveal-up 0.5s ease-out both",
        "reveal-fade": "reveal-fade 0.4s ease-out both",
        "hover-lift": "hover-lift 0.2s ease-out forwards",
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
        breathe: "breathe 3s ease-in-out infinite",
        "icon-tilt": "icon-tilt 0.2s ease-out forwards",
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
