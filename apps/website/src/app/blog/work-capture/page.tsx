"use client";

import { BlogPostLayout } from "@/components/blog/blog-post-layout";
import { getBlogPost } from "@/content/blog-posts";

const post = getBlogPost("work-capture")!;

export default function WorkCapturePost() {
    return (
        <BlogPostLayout title={post.title} description={post.description} publishedAt={post.publishedAt}>
            <p>
                The biggest lie in modern management is that "status updates" actually reflect status. When engineers, designers, or marketers sit down to write
                their weekly updates, they're not doing work—they're performing work. Mitable was built on the premise that your team should just work, and the
                system should handle the tracking.
            </p>

            <h2>The Burden of "Showing" Work</h2>
            <p>
                Every minute spent in a standup or writing a Jira update is a minute not spent writing code or designing interfaces. Time tracking software is
                even worse: it treats employees like factory workers punching a clock, leading to anxiety and "mouse-jiggling" behavior.
            </p>

            <h2>The Multi-App Montage</h2>
            <p>
                Our work capture system operates silently in the background. It doesn't just track that you had Slack open for 45 minutes; it understands{" "}
                <em>context</em>.
            </p>
            <p>
                If you're in VS Code, Figma, and Chrome, Mitable's agent connects the dots. It understands that you're working on the "New Authentication Flow"
                because it sees the code you're writing, the designs you're referencing, and the API docs you're reading.
            </p>

            <h3>How We Do It Safely</h3>
            <ul>
                <li>
                    <strong>Local-First Processing:</strong> Raw screen data never leaves your machine unless explicitly required for a specific AI task, and
                    even then, it's scrubbed of PII.
                </li>
                <li>
                    <strong>Context, Not Surveillance:</strong> We don't record video for managers to watch. We generate semantic embeddings of what's happening
                    to create a "story" of the day.
                </li>
                <li>
                    <strong>Employee Control:</strong> If you need to step away or handle personal business, you can pause capture with a single click.
                </li>
            </ul>

            <h2>From Raw Data to Comprehensive Summaries</h2>
            <p>
                We use an advanced AI agent architecture that processes information in a continuous loop. This system takes the raw timeline of app usage and
                intelligently groups it into logical "workstreams." It turns "Opened IDE, opened Terminal, opened Slack" into "Spent 2 hours resolving the
                database migration issue and communicating with DevOps."
            </p>
            <p>
                This means at the end of the week, Mitable generates a beautifully accurate Bragbook of your accomplishments, and you didn't have to lift a
                finger.
            </p>
        </BlogPostLayout>
    );
}
