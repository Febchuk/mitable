"use client";

import { useEffect, useState } from "react";

export type OsPlatform = "mac-arm" | "mac-intel" | "windows" | "linux" | "unknown";

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

export interface OsInfo {
    platform: OsPlatform;
    label: string;
    ready: boolean;
}

export function useOsDetection(): OsInfo {
    const [info, setInfo] = useState<OsInfo>({
        platform: "unknown",
        label: "Download",
        ready: false,
    });

    useEffect(() => {
        const platform = detectOs();
        setInfo({
            platform,
            label: LABELS[platform],
            ready: true,
        });
    }, []);

    return info;
}

export interface VersionInfo {
    version: string;
    urls: Record<string, string>;
    isLoading: boolean;
}

export function useLatestVersion(): VersionInfo {
    const [info, setInfo] = useState<VersionInfo>({
        version: "",
        urls: {},
        isLoading: true,
    });

    useEffect(() => {
        fetch("/api/version")
            .then((res) => res.json())
            .then((data: { version: string; urls: Record<string, string> }) => {
                setInfo({ version: data.version, urls: data.urls, isLoading: false });
            })
            .catch(() => {
                setInfo({ version: "", urls: {}, isLoading: false });
            });
    }, []);

    return info;
}
