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
    description: "Is your team working on what matters? Now you'll know. Mitable measures what gets done against your goals, in real time.",
};

export const viewport: Viewport = {
    themeColor: "#1A1916",
    colorScheme: "dark",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body className={cx(inter.variable, manrope.variable, jetbrainsMono.variable, newsreader.variable, dmSans.variable, "bg-primary antialiased")}>
                <RouteProvider>
                    <Theme>{children}</Theme>
                </RouteProvider>
            </body>
        </html>
    );
}
