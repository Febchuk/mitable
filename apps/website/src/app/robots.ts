import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: "*",
            allow: "/",
            disallow: ["/api/", "/checkout/", "/billing/", "/account/"],
        },
        sitemap: "https://mitable.ai/sitemap.xml",
    };
}
