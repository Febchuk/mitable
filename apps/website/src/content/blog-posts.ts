/**
 * Canonical blog metadata. Set `publishedAt` to the real calendar moment a post
 * goes live on the site (ISO 8601). Display strings are derived via
 * `formatBlogPublished` so the index and article headers stay in sync.
 */
export const BLOG_AUTHOR = "Mitable" as const;

export type BlogSlug = "benchmarks" | "work-capture" | "evaluations" | "reporting";

export interface BlogPostMeta {
    slug: BlogSlug;
    title: string;
    description: string;
    /** ISO 8601 instant (UTC recommended) */
    publishedAt: string;
}

// Dates ascend with homepage steps: benchmarks (1) → … → reporting (4).
export const BLOG_POSTS: BlogPostMeta[] = [
    {
        slug: "benchmarks",
        title: "Setting the Standard: How AI Benchmarks Work",
        description:
            "Defining what good looks like for every role can take weeks. Here's how our AI reduces it to minutes.",
        publishedAt: "2026-03-25T16:00:00.000Z",
    },
    {
        slug: "work-capture",
        title: "Your Team Just Works: The Philosophy of Work Capture",
        description:
            "We built a multi-app work montage so you don't have to manually track time or ask for status updates.",
        publishedAt: "2026-03-28T16:00:00.000Z",
    },
    {
        slug: "evaluations",
        title: "Evaluate Performance More Accurately",
        description:
            "Live, AI-generated scores for every person on your team — measured against the benchmarks you actually care about.",
        publishedAt: "2026-04-01T16:00:00.000Z",
    },
    {
        slug: "reporting",
        title: "More Robust Reporting: The Person Detail Dashboard",
        description:
            "See exactly how each person spends their time, which customers they serve, and where they're most effective.",
        publishedAt: "2026-04-03T16:00:00.000Z",
    },
];

export function getBlogPost(slug: string): BlogPostMeta | undefined {
    return BLOG_POSTS.find((p) => p.slug === slug);
}

/** Human-readable date for UI + `datetime` attribute for <time>. */
export function formatBlogPublished(publishedAt: string): { dateTime: string; label: string } {
    const d = new Date(publishedAt);
    if (Number.isNaN(d.getTime())) {
        return { dateTime: publishedAt, label: publishedAt };
    }
    return {
        dateTime: d.toISOString(),
        label: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    };
}
