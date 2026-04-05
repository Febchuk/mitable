"use client";

import { BlogPostLayout } from "@/components/blog/blog-post-layout";
import { getBlogPost } from "@/content/blog-posts";

const post = getBlogPost("benchmarks")!;

export default function BenchmarksPost() {
    return (
        <BlogPostLayout title={post.title} description={post.description} publishedAt={post.publishedAt}>
            <p>
                In most organizations, standardizing performance expectations is a manual and painful process. Managers spend hours drafting what "good" looks
                like, resulting in static PDFs that get outdated the moment they're published. Mitable solves this by using AI to generate and maintain dynamic
                benchmarks.
            </p>

            <h2>The Problem with Static Rubrics</h2>
            <p>
                When you define a rubric manually, you have to account for every single edge case. If you're evaluating a software engineer, do you score them
                on pull request size? Lines of code? Time to merge? Code review participation? It's impossible to maintain these metrics manually.
            </p>
            <p>
                More importantly, when you try to measure team members against a static rubric, bias inevitably creeps in. Managers remember the last two weeks
                of performance, not the last two quarters.
            </p>

            <h2>How Mitable Generates Benchmarks</h2>
            <p>
                We've reduced the complexity of creating benchmarks down to a simple description. You define what good looks like for a role in plain English,
                and Mitable's AI handles the rest, automatically generating the necessary scoring parameters in minutes instead of weeks.
            </p>

            <h2>Real-world Application</h2>
            <p>
                Instead of a manager saying "I expect you to communicate better," Mitable creates a benchmark that expects "Proactive updates in Slack channels
                after major deployments." Because our agent captures work across all apps, we can objectively measure if this standard is being met.
            </p>

            <h3>What's Next?</h3>
            <p>
                We're currently experimenting with advanced AI agent architectures to continuously refine these benchmarks based on the top performers in your
                organization. If your best engineers are adopting a new tool or workflow, Mitable will suggest updating the benchmark to reflect this new
                standard.
            </p>
        </BlogPostLayout>
    );
}
