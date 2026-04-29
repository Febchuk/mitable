import type { Metadata, Viewport } from "next";

import { AuthProvider } from "@/lib/auth/AuthContext";
import { PWARegister } from "@/components/system/PWARegister";

import "../styles/globals.css";

export const metadata: Metadata = {
    title: "Mitable for Montessori",
    description: "AI-powered classroom record-keeping and reporting for Montessori schools.",
    applicationName: "Mitable",
    manifest: "/manifest.webmanifest",
    icons: {
        icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
        apple: [{ url: "/icon.svg", type: "image/svg+xml" }],
    },
    appleWebApp: {
        capable: true,
        title: "Mitable",
        statusBarStyle: "black-translucent",
    },
    formatDetection: { telephone: false },
};

export const viewport: Viewport = {
    themeColor: "#1A1916",
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
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
                <AuthProvider>{children}</AuthProvider>
                <PWARegister />
            </body>
        </html>
    );
}
