import type { Metadata } from "next";

import { StoreProvider } from "@/lib/store";
import { AppShell } from "@/components/shell/AppShell";

import "../styles/globals.css";

export const metadata: Metadata = {
    title: "Mitable for Montessori",
    description: "AI-powered classroom record-keeping and reporting for Montessori schools.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className="dark">
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
                <link
                    href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Newsreader:ital,wght@0,300;0,400;0,500;1,300;1,400&family=JetBrains+Mono:wght@400;500&display=swap"
                    rel="stylesheet"
                />
            </head>
            <body>
                <StoreProvider>
                    <AppShell>{children}</AppShell>
                </StoreProvider>
            </body>
        </html>
    );
}
