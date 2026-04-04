"use client";

import { BlogPostLayout } from "@/components/blog/blog-post-layout";
import { getBlogPost } from "@/content/blog-posts";

const post = getBlogPost("benchmarks")!;

export default function BenchmarksPost() {
    return (
        <BlogPostLayout title={post.title} description={post.description} publishedAt={post.publishedAt}>
            <p>
                In most organizations, standardizing performance expectations is a manual and painful process. Managers spend hours drafting what "good" looks like, resulting in static PDFs that get outdated the moment they're published. Mitable solves this by using AI to generate and maintain dynamic benchmarks.
            </p>

            <h2>The Problem with Static Rubrics</h2>
            <p>
                When you define a rubric manually, you have to account for every single edge case. If you're evaluating a software engineer, do you score them on pull request size? Lines of code? Time to merge? Code review participation? It's impossible to maintain these metrics manually.
            </p>
            <p>
                More importantly, when you try to measure team members against a static rubric, bias inevitably creeps in. Managers remember the last two weeks of performance, not the last two quarters.
            </p>

            <h2>How Mitable Generates Benchmarks</h2>
            <p>
                Our approach to benchmarks uses a hybrid AI system:
            </p>
            <ul>
                <li><strong>Ingestion:</strong> We ingest your existing documentation, job descriptions, and past performance reviews to understand your company's unique context.</li>
                <li><strong>Extraction:</strong> Using <code>gemini-2.5-flash-lite</code>, we extract structured tasks and expectations from your raw text.</li>
                <li><strong>Scoring Parameters:</strong> We convert these expectations into measurable, quantitative scoring parameters that our agent can observe in the background.</li>
            </ul>

            <blockquote>
                "Benchmarks shouldn't be a destination; they should be a live baseline that evolves with your team's capability."
            </blockquote>

            <h2>Real-world Application</h2>
            <p>
                Instead of a manager saying "I expect you to communicate better," Mitable creates a benchmark that expects "Proactive updates in Slack channels after major deployments." Because our agent captures work across all apps, we can objectively measure if this standard is being met.
            </p>

            <h3>What's Next?</h3>
            <p>
                We're currently experimenting with recursive language models (RLMs) to continuously refine these benchmarks based on the top performers in your organization. If your best engineers are adopting a new tool or workflow, Mitable will suggest updating the benchmark to reflect this new standard.
            </p>
        </BlogPostLayout>
    );
}
