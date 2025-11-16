/** @type {import('tailwindcss').Config} */
import tailwindcssAnimate from "tailwindcss-animate";

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
        "background-primary": "#111827",
        "background-secondary": "#1f2937",
        "background-elevated": "#374151",
        "border-subtle": "#4b5563",
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
          success: "#10b981",
          warning: "#f59e0b",
          error: "#ef4444",
          info: "#3b82f6",
        },
        gradient: {
          purple: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
          blue: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
          purpleBlue: "linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%)",
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
        sans: ["Inter", "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
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
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "glow": "glow 2s ease-in-out infinite alternate",
      },
      boxShadow: {
        'card': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        'card-hover': '0 10px 15px -3px rgba(0, 0, 0, 0.2), 0 4px 6px -2px rgba(0, 0, 0, 0.1)',
        'glow-purple': '0 0 20px rgba(139, 92, 246, 0.3)',
        'glow-blue': '0 0 20px rgba(59, 130, 246, 0.3)',
      },
      backgroundImage: {
        'gradient-purple': 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
        'gradient-blue': 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
        'gradient-purple-blue': 'linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%)',
      },
    },
  },
  plugins: [
    tailwindcssAnimate,
    function ({ addUtilities }) {
      addUtilities({
        '.scrollbar-hide': {
          /* Hide scrollbar for Chrome, Safari and Opera */
          '&::-webkit-scrollbar': {
            display: 'none',
          },
          /* Hide scrollbar for IE, Edge and Firefox */
          '-ms-overflow-style': 'none',
          'scrollbar-width': 'none',
        },
      })
    },
  ],
};
