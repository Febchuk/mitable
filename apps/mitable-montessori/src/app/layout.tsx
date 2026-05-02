import type { Metadata, Viewport } from "next";
import { Caveat, DM_Sans } from "next/font/google";
import "@/styles/globals.css";
import "@/styles/tokens.css";
import { cn } from "@/lib/utils";

const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm-sans",
  weight: ["400", "500", "600", "700"],
});

const caveat = Caveat({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-caveat",
  weight: ["400", "600"],
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
