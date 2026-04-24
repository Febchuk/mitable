/** @type {import('tailwindcss').Config} */
const tailwindcssAnimate = require("tailwindcss-animate");

module.exports = {
    darkMode: ["class"],
    content: ["./src/**/*.{html,js,ts,jsx,tsx}"],
    theme: {
        container: {
            center: true,
            padding: "2rem",
            screens: { "2xl": "1400px" },
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
                stroke: {
                    subtle: "rgba(var(--ui-rgb), 0.07)",
                    DEFAULT: "rgba(var(--ui-rgb), 0.10)",
                    strong: "rgba(var(--ui-rgb), 0.18)",
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
            },
            borderRadius: {
                sm: "4px",
                md: "6px",
                lg: "10px",
                xl: "12px",
                "2xl": "16px",
            },
            borderWidth: {
                hairline: "0.5px",
            },
            fontFamily: {
                sans: ["var(--font-sans)", "Inter", "-apple-system", "sans-serif"],
                serif: ["var(--font-serif)", "Newsreader", "Georgia", "serif"],
                display: ["var(--font-mono)", "JetBrains Mono", "monospace"],
                mono: ["var(--font-mono)", "JetBrains Mono", "monospace"],
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
                    from: { opacity: "0", transform: "translateY(8px)" },
                    to: { opacity: "1", transform: "translateY(0)" },
                },
                "reveal-fade": {
                    from: { opacity: "0" },
                    to: { opacity: "1" },
                },
            },
            animation: {
                "accordion-down": "accordion-down 0.2s ease-out",
                "accordion-up": "accordion-up 0.2s ease-out",
                "reveal-up": "reveal-up 0.3s ease-out both",
                "reveal-fade": "reveal-fade 0.2s ease-out both",
            },
        },
    },
    plugins: [tailwindcssAnimate],
};
