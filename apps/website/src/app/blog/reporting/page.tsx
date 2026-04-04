"use client";

import { BlogPostLayout } from "@/components/blog/blog-post-layout";
import { getBlogPost } from "@/content/blog-posts";

const post = getBlogPost("reporting")!;

export default function ReportingPost() {
    return (
        <BlogPostLayout title={post.title} description={post.description} publishedAt={post.publishedAt}>
            <p>
                Having data is useless if you can't extract insights from it. The Person Detail Dashboard is the culmination of our entire capture and evaluation pipeline. It's designed to give managers and employees a shared, objective view of where time and energy are actually going.
            </p>

            <h2>Beyond "Hours Worked"</h2>
            <p>
                Most productivity tools stop at "Alice worked 8 hours today." Mitable goes deeper. We answer the questions that actually matter to the business:
            </p>
            <ul>
                <li>Is this engineer spending too much time in meetings instead of deep work?</li>
                <li>Is this account executive spending 80% of their time on a client that only brings in 10% of revenue?</li>
                <li>Is the team context-switching too frequently to be effective?</li>
            </ul>

            <h2>Under the Hood: Intent Detection</h2>
            <p>
                To generate these insights, we rely heavily on our <code>IntentService</code> and <code>GeminiVisionService</code>. 
            </p>
            <p>
                When Mitable captures screen activity, it's not just logging window titles. It analyzes the context of the work. If an employee is in Salesforce, our AI determines which account they're working on. If they're in GitHub, it knows which repository and issue they're addressing.
            </p>

            <code>
                // Example of our RRF Search combining keyword and semantic meaning
                const searchResults = await SearchService.hybridSearch(query);
            </code>

            <h3>Visualizing the Data</h3>
            <p>
                We use custom HTML5 Canvas charts to render this data without bogging down the browser's DOM. This allows us to show highly granular, minute-by-minute breakdowns of a day without sacrificing performance.
            </p>
            <p>
                The dashboard splits focus into clear categories:
            </p>
            <ul>
                <li><strong>Deep Work:</strong> Uninterrupted time spent in core applications (IDEs, design tools).</li>
                <li><strong>Communication:</strong> Time spent in Slack, email, or Zoom.</li>
                <li><strong>Context Switching:</strong> The penalty time lost when rapidly moving between disconnected tasks.</li>
            </ul>

            <blockquote>
                "Reporting shouldn't tell you that your team is working. It should tell you if they're working on the right things."
            </blockquote>

            <h2>Empowering the Employee</h2>
            <p>
                Crucially, this dashboard isn't just for managers. Employees have full access to their own reporting. We've found that when individuals can see their own context-switching metrics, they naturally begin to protect their deep work time more fiercely.
            </p>
        </BlogPostLayout>
    );
}
