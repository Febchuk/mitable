"use client";

import { useTheme as useNextTheme } from "next-themes";
import { useCallback, useEffect, useState } from "react";

type Theme = "dark" | "light";

export function useTheme() {
    const { resolvedTheme, setTheme } = useNextTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    const theme: Theme = mounted && resolvedTheme === "light" ? "light" : "dark";

    const toggle = useCallback(() => {
        setTheme(theme === "dark" ? "light" : "dark");
    }, [theme, setTheme]);

    return { theme, toggle };
}
