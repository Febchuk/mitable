"use client";

import { ReactNode } from "react";
import { LandingFooter } from "@/components/landing";
import { LandingNav } from "@/components/landing/landing-nav";
import { BLOG_AUTHOR, formatBlogPublished } from "@/content/blog-posts";

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

interface BlogPostLayoutProps {
    title: string;
    description?: string;
    /** ISO 8601 — drives visible date and `<time dateTime>`. */
    publishedAt?: string;
    author?: string;
    children: ReactNode;
}

export const BlogPostLayout = ({ title, description, publishedAt, author = BLOG_AUTHOR, children }: BlogPostLayoutProps) => {
    const published = publishedAt ? formatBlogPublished(publishedAt) : null;
    return (
        <div className="landing" style={{ minHeight: "100dvh", background: C.bg, fontFamily: C.sans }}>
            <style>{`
                .blog-post-main {
                    padding: 180px 48px 80px;
                    max-width: 760px;
                    margin: 0 auto;
                }
                
                .blog-content {
                    color: ${C.text};
                    font-size: 16px;
                    line-height: 1.7;
                }

                .blog-content p {
                    margin-bottom: 24px;
                    color: ${C.textSec};
                }

                .blog-content h2 {
                    font-family: ${C.sans};
                    font-size: 22px;
                    font-weight: 600;
                    color: ${C.text};
                    margin: 48px 0 16px;
                    letter-spacing: -0.01em;
                }

                .blog-content h3 {
                    font-family: ${C.sans};
                    font-size: 18px;
                    font-weight: 600;
                    color: ${C.text};
                    margin: 32px 0 12px;
                }

                .blog-content ul, .blog-content ol {
                    margin-bottom: 24px;
                    padding-left: 24px;
                    color: ${C.textSec};
                }

                .blog-content li {
                    margin-bottom: 8px;
                }

                .blog-content strong {
                    color: ${C.text};
                    font-weight: 600;
                }

                .blog-content blockquote {
                    border-left: 2px solid rgba(130, 192, 204, 0.4);
                    background: rgba(130, 192, 204, 0.05);
                    padding: 16px 20px;
                    margin: 32px 0;
                    border-radius: 0 8px 8px 0;
                    color: ${C.text};
                    font-style: italic;
                }

                .blog-content code {
                    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                    background: ${C.raised};
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-size: 0.9em;
                    color: ${C.text};
                    border: 1px solid ${C.border};
                }
            `}</style>
            <LandingNav />

            <main className="blog-post-main">
                {/* Header */}
                <header style={{ marginBottom: 56, paddingBottom: 32, borderBottom: `1px solid ${C.border}` }}>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: 12,
                            marginBottom: 16,
                            fontFamily: C.sans,
                            fontSize: 13,
                            color: C.textTer,
                        }}
                    >
                        {published && (
                            <time dateTime={published.dateTime} style={{ color: C.textTer }}>
                                {published.label}
                            </time>
                        )}
                        {published && author && <span aria-hidden>•</span>}
                        {author && <span>{author}</span>}
                    </div>
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
                        {title}
                    </h1>
                    {description && <p style={{ fontSize: 16, color: C.textSec, lineHeight: 1.6, margin: 0 }}>{description}</p>}
                </header>

                {/* Content Body */}
                <article className="blog-content">{children}</article>
            </main>

            <LandingFooter />
        </div>
    );
};
