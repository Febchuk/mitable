"use client";

import { useEffect, useState } from "react";
import { MITABLE_VERSION } from "@/config/content/base";

export type OsPlatform = "mac-arm" | "mac-intel" | "windows" | "linux" | "unknown";

const R2_BASE = "https://pub-56941275957b42049f3bad9b4bf1daa9.r2.dev";

const DOWNLOAD_URLS: Record<OsPlatform, string> = {
    "mac-arm": `${R2_BASE}/Mitable-${MITABLE_VERSION}-arm64.dmg`,
    "mac-intel": `${R2_BASE}/Mitable-${MITABLE_VERSION}-x64.dmg`,
    windows: `${R2_BASE}/Mitable-${MITABLE_VERSION}-x64.exe`,
    linux: "/download",
    unknown: "/download",
};

export interface OsInfo {
    platform: OsPlatform;
    label: string;
    /** Direct binary URL for this platform */
    downloadUrl: string;
    ready: boolean;
}

function detectAppleSilicon(): boolean {
    try {
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
        if (!gl) return false;
        const ext = (gl as WebGLRenderingContext).getExtension("WEBGL_debug_renderer_info");
        if (!ext) return false;
        const renderer = (gl as WebGLRenderingContext).getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;
        return /Apple M\d/i.test(renderer);
    } catch {
        return false;
    }
}

function detectOs(): OsPlatform {
    const ua = navigator.userAgent;

    if (/Macintosh|Mac OS X/i.test(ua)) {
        return detectAppleSilicon() ? "mac-arm" : "mac-intel";
    }
    if (/Windows/i.test(ua)) return "windows";
    if (/Linux/i.test(ua)) return "linux";
    return "unknown";
}

const LABELS: Record<OsPlatform, string> = {
    "mac-arm": "Download for macOS",
    "mac-intel": "Download for macOS",
    windows: "Download for Windows",
    linux: "Download for Linux",
    unknown: "Download",
};

export function useOsDetection(): OsInfo {
    const [info, setInfo] = useState<OsInfo>({
        platform: "unknown",
        label: "Download",
        downloadUrl: "/download",
        ready: false,
    });

    useEffect(() => {
        const platform = detectOs();
        setInfo({
            platform,
            label: LABELS[platform],
            downloadUrl: DOWNLOAD_URLS[platform],
            ready: true,
        });
    }, []);

    return info;
}

export { DOWNLOAD_URLS };
