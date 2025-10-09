/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/renderer/**/*.{html,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Primary palette (Indigo)
        primary: {
          DEFAULT: "#6366F1",
          light: "#818CF8",
          hover: "#4F46E5",
          pressed: "#4338CA",
        },
        // Neutral palette
        background: {
          primary: "#1A1A1A",
          secondary: "#2A2A2A",
          elevated: "#3A3A3A",
        },
        surface: {
          DEFAULT: "#2A2A2A",
          elevated: "#3A3A3A",
        },
        border: {
          DEFAULT: "#404040",
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
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
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
      borderRadius: {
        sm: "6px",
        md: "10px",
        lg: "16px",
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
        "300": "300ms",
      },
    },
  },
  plugins: [],
};
