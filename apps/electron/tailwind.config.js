/** @type {import('tailwindcss').Config} */
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
        // ShadCN colors (CSS variables)
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          // Legacy custom colors (for existing code)
          light: "#818CF8",
          hover: "#4F46E5",
          pressed: "#4338CA",
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
        // Legacy custom colors (for existing code compatibility)
        "background-primary": "#1A1A1A",
        "background-secondary": "#2A2A2A",
        "background-elevated": "#3A3A3A",
        "integration-card": "#3E3D3D",
        // Agent pill specific
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
        // Text palette
        text: {
          primary: "#FFFFFF",
          secondary: "#A1A1A1",
          tertiary: "#6B6B6B",
        },
        // Status colors
        status: {
          success: "#22C55E",
          warning: "#F59E0B",
          error: "#EF4444",
          info: "#3B82F6",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        // Legacy custom radii
        "6px": "6px",
        "10px": "10px",
        "16px": "16px",
      },
      fontFamily: {
        sans: ["Manrope", "system-ui", "sans-serif"],
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
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
