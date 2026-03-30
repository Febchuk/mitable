"use client";

import { useCallback, useEffect, useState } from "react";

type Theme = "dark" | "light";

const STORAGE_KEY = "mitable-theme";

function getStoredTheme(): Theme | null {
    if (typeof window === "undefined") return null;
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : null;
}

function applyTheme(theme: Theme) {
    const root = document.documentElement;
    if (theme === "light") {
        root.classList.add("landing-light");
    } else {
        root.classList.remove("landing-light");
    }
}

export function useTheme() {
    const [theme, setTheme] = useState<Theme>("dark");

    useEffect(() => {
        const stored = getStoredTheme();
        if (stored) {
            setTheme(stored);
            applyTheme(stored);
        }
    }, []);

    const toggle = useCallback(() => {
        setTheme((prev) => {
            const next: Theme = prev === "dark" ? "light" : "dark";
            localStorage.setItem(STORAGE_KEY, next);
            applyTheme(next);
            return next;
        });
    }, []);

    return { theme, toggle };
}
