import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
    const baseUrl = "https://mitable.ai";
    return [
        { url: baseUrl, lastModified: new Date("2026-04-13"), changeFrequency: "weekly", priority: 1 },
        { url: `${baseUrl}/pricing`, lastModified: new Date("2026-04-13"), changeFrequency: "monthly", priority: 0.8 },
        { url: `${baseUrl}/download`, lastModified: new Date("2026-04-13"), changeFrequency: "monthly", priority: 0.8 },
        { url: `${baseUrl}/login`, lastModified: new Date("2026-04-13"), changeFrequency: "yearly", priority: 0.3 },
        { url: `${baseUrl}/signup`, lastModified: new Date("2026-04-13"), changeFrequency: "yearly", priority: 0.3 },
    ];
}
