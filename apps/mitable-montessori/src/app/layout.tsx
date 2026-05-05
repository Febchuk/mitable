import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "@/styles/globals.css";
import "@/styles/tokens.css";
import { cn } from "@/lib/utils";

const dmSans = localFont({
  src: [
    { path: "../../public/fonts/dm-sans-latin-400.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/dm-sans-latin-500.woff2", weight: "500", style: "normal" },
    { path: "../../public/fonts/dm-sans-latin-600.woff2", weight: "600", style: "normal" },
    { path: "../../public/fonts/dm-sans-latin-700.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-dm-sans",
});

const caveat = localFont({
  src: [
    { path: "../../public/fonts/caveat-latin-400.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/caveat-latin-600.woff2", weight: "600", style: "normal" },
  ],
  display: "swap",
  variable: "--font-caveat",
});

export const metadata: Metadata = {
  title: {
    default: "Mitable Montessori",
    template: "%s | Mitable Montessori",
  },
  description: "Privacy-first classroom record-keeping for Montessori schools.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Mitable",
  },
};

export const viewport: Viewport = {
  themeColor: "#FAF6EE",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn(dmSans.variable, caveat.variable)} suppressHydrationWarning>
      <body className="min-h-screen bg-canvas font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
