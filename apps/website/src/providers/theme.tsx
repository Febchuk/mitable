"use client";

import { ThemeProvider } from "next-themes";

export function Theme({ children }: { children: React.ReactNode }) {
    return (
        <ThemeProvider
            attribute="class"
            value={{ light: "landing-light", dark: "landing-dark" }}
            defaultTheme="system"
            storageKey="mitable-theme"
            enableSystem
            disableTransitionOnChange
        >
            {children}
        </ThemeProvider>
    );
}
