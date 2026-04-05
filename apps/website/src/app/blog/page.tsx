"use client";

import { LandingFooter } from "@/components/landing";
import { LandingNav } from "@/components/landing/landing-nav";
import { BLOG_AUTHOR, BLOG_POSTS, formatBlogPublished } from "@/content/blog-posts";

const C = {
    bg: "var(--l-bg, #1A1916)",
    raised: "var(--l-bg-raised, #211F1B)",
    text: "var(--l-text, #ECE8E0)",
    textSec: "var(--l-text-secondary, #A09A8E)",
    textTer: "var(--l-text-tertiary, #6B665C)",
    accent: "var(--l-accent, #82C0CC)",
    border: "var(--l-border, #33312B)",
    serif: 'var(--font-newsreader, "Newsreader"), Georgia, serif',
    sans: 'var(--font-dm-sans, "DM Sans"), system-ui, sans-serif',
};

export default function BlogIndexPage() {
    /** Newest first; `publishedAt` still follows step order (step 1 oldest → step 4 newest). */
    const sorted = [...BLOG_POSTS].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    return (
        <div className="landing" style={{ minHeight: "100dvh", background: C.bg, fontFamily: C.sans }}>
            <style>{`
                .blog-card {
                    display: block;
                    padding: 32px;
                    border-radius: 16px;
                    background: ${C.bg};
                    border: 1px solid rgba(255,255,255,0.03);
                    text-decoration: none;
                    transition: background 0.2s, border-color 0.2s;
                    margin-bottom: 16px;
                }
                
                .blog-card:hover {
                    background: ${C.raised};
                    border-color: ${C.border};
                }

                @media (max-width: 768px) {
                    .blog-main {
                        padding: 100px 20px 48px !important;
                    }
                    .blog-main .blog-header h1 {
                        font-size: 30px !important;
                    }
                    .blog-main .blog-header p {
                        font-size: 14px !important;
                    }
                    .blog-main .blog-header {
                        margin-bottom: 32px !important;
                    }
                    .blog-card {
                        padding: 20px;
                        margin-bottom: 10px;
                    }
                }
            `}</style>
            <LandingNav />

            <main className="blog-main" style={{ padding: "180px 48px 80px", maxWidth: 760, margin: "0 auto" }}>
                <header className="blog-header" style={{ marginBottom: 56 }}>
                    <h1
                        style={{
                            fontFamily: C.serif,
                            fontSize: 44,
                            fontWeight: 400,
                            color: C.text,
                            letterSpacing: "-0.02em",
                            lineHeight: 1.2,
                            margin: "0 0 14px",
                        }}
                    >
                        The Mitable Journal
                    </h1>
                    <p style={{ fontSize: 16, color: C.textSec, lineHeight: 1.6, margin: 0 }}>
                        Deep dives into how Mitable's products work, our differentiated approaches to using AI, and insights on modern performance tracking.
                    </p>
                </header>

                <div className="blog-list">
                    {sorted.map((post) => {
                        const { dateTime, label } = formatBlogPublished(post.publishedAt);
                        return (
                            <a key={post.slug} href={`/blog/${post.slug}`} className="blog-card">
                                <div
                                    style={{
                                        fontFamily: C.sans,
                                        fontSize: 13,
                                        color: C.textTer,
                                        marginBottom: 12,
                                        display: "flex",
                                        flexWrap: "wrap",
                                        alignItems: "center",
                                        gap: "0 8px",
                                    }}
                                >
                                    <time dateTime={dateTime}>{label}</time>
                                    <span aria-hidden>•</span>
                                    <span>{BLOG_AUTHOR}</span>
                                </div>
                                <h2
                                    style={{
                                        fontFamily: C.serif,
                                        fontSize: 22,
                                        fontWeight: 400,
                                        color: C.text,
                                        letterSpacing: "-0.01em",
                                        margin: "0 0 8px",
                                    }}
                                >
                                    {post.title}
                                </h2>
                                <p style={{ fontSize: 14, color: C.textSec, lineHeight: 1.6, margin: 0 }}>{post.description}</p>
                            </a>
                        );
                    })}
                </div>
            </main>

            <LandingFooter />
        </div>
    );
}
