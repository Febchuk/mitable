/**
 * Shared constants used across all regional content.
 * Download links, footer, social links, navigation structure.
 */

export const baseContent = {
    brand: {
        name: "Mitable",
    },

    downloads: {
        headline: "Download Mitable",
        subheadline: "Choose the right version for your platform.",
    },

    footer: {
        copyright: `© ${new Date().getFullYear()} Mitable Inc.`,
        links: {
            product: [
                { label: "Capabilities", href: "#features" },
                { label: "Timeline", href: "#timeline" },
                { label: "Pricing", href: "#pricing" },
                { label: "Download", href: "/download" },
            ],
            company: [
                { label: "About", href: "/about" },
                { label: "Blog", href: "/blog" },
                { label: "Careers", href: "/careers" },
                { label: "Contact", href: "/contact" },
            ],
            resources: [
                { label: "Documentation", href: "/docs" },
                { label: "Help Center", href: "/help" },
                { label: "API", href: "/api" },
                { label: "Status", href: "/status" },
            ],
            legal: [
                { label: "Privacy", href: "/privacy" },
                { label: "Terms", href: "/terms" },
                { label: "Security", href: "/security" },
            ],
        },
        social: {
            twitter: "https://twitter.com/mitable",
            github: "https://github.com/mitable",
            linkedin: "https://linkedin.com/company/mitable",
        },
        platforms: ["Mac", "Windows"],
    },

    navigation: {
        links: [
            { label: "Product", href: "#features" },
            { label: "Pricing", href: "/pricing" },
        ],
        cta: "Download",
    },

    // Platforms list (shared across regions)
    platforms: {
        items: ["VS Code", "Chrome", "Slack", "Notion", "Linear", "Figma", "GitHub", "Terminal"],
    },
};

export type BaseContent = typeof baseContent;
