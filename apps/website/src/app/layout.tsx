import type { Metadata, Viewport } from "next";
import { DM_Sans, Inter, JetBrains_Mono, Manrope, Newsreader } from "next/font/google";
import { RouteProvider } from "@/providers/router-provider";
import { Theme } from "@/providers/theme";
import "@/styles/globals.css";
import "@/styles/landing.css";
import { cx } from "@/utils/cx";

const inter = Inter({
    subsets: ["latin"],
    display: "swap",
    variable: "--font-inter",
});

const manrope = Manrope({
    subsets: ["latin"],
    display: "swap",
    variable: "--font-manrope",
    weight: ["400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
    subsets: ["latin"],
    display: "swap",
    variable: "--font-jetbrains",
});

const newsreader = Newsreader({
    subsets: ["latin"],
    display: "swap",
    variable: "--font-newsreader",
    weight: ["300", "400", "500", "600"],
    style: ["normal", "italic"],
});

const dmSans = DM_Sans({
    subsets: ["latin"],
    display: "swap",
    variable: "--font-dm-sans",
    weight: ["300", "400", "500", "600"],
});

export const metadata: Metadata = {
    title: "Mitable — Performance, measured.",
    description:
        "Knowing if your team is spending their time on the right things is the hardest part of management. Mitable makes it simple.",
};

export const viewport: Viewport = {
    themeColor: [
        { media: "(prefers-color-scheme: dark)", color: "#1A1916" },
        { media: "(prefers-color-scheme: light)", color: "#F5F1ED" },
    ],
    colorScheme: "dark light",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body
                className={cx(
                    inter.variable,
                    manrope.variable,
                    jetbrainsMono.variable,
                    newsreader.variable,
                    dmSans.variable,
                    "antialiased",
                )}
                style={{ background: "var(--l-bg, #1A1916)" }}
            >
                <RouteProvider>
                    <Theme>{children}</Theme>
                </RouteProvider>
            </body>
        </html>
    );
}
