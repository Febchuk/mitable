/**
 * Seed Session Data — Additive script for Mitable org
 *
 * Inserts ~4 ended monitoring sessions per employee over the last 2 weeks.
 * Each session has realistic summaries, accomplishments, and task breakdowns
 * so the bragbook generator and benchmark compute have data to work with.
 *
 * Safe to re-run: checks for existing [SEED] sessions per user.
 *
 * Usage: npx tsx apps/backend/src/scripts/seed-sessions-data.ts
 */
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and, like } from "drizzle-orm";
import dotenv from "dotenv";
import * as schema from "../db/schema/index";

dotenv.config({ path: new URL("../../.env", import.meta.url).pathname });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
const db = drizzle(pool, { schema });

// ── Role mapping (same as seed-dashboard-data.ts) ───────────────────

const USER_ROLE_MAP: Record<string, string> = {
  // Admins (treated as PM/leadership)
  Febe: "pm",
  Aurel: "pm",
  Mikun: "pm",
  // Employees
  Amara: "engineer",
  Chisom: "engineer",
  Ella: "design",
  Jide: "engineer",
  Kamsi: "engineer",
  Nneka: "customer_success",
  Tunde: "devops",
  Yemi: "engineer",
  // Test users
  Test: "engineer",
};

// ── Session templates per role ──────────────────────────────────────

interface SessionTemplate {
  name: string;
  sessionType: "focused" | "passive";
  summary: string;
  accomplishments: string[];
  taskBreakdown: { shortTitle: string; description: string; minutes: number }[];
  keyActivities: string[];
}

const TEMPLATES: Record<string, SessionTemplate[]> = {
  engineer: [
    {
      name: "API endpoint refactoring",
      sessionType: "focused",
      summary:
        "Refactored the REST API endpoints for the user management module. Consolidated duplicate validation logic into shared middleware, improved error responses with proper HTTP status codes, and added request/response type safety with Zod schemas.",
      accomplishments: [
        "Consolidated 12 duplicate validation blocks into 3 reusable middleware functions",
        "Migrated all user endpoints to use Zod request validation",
        "Improved API error responses with structured error codes",
      ],
      taskBreakdown: [
        { shortTitle: "Audit existing endpoints", description: "Mapped all user API routes and identified duplication", minutes: 20 },
        { shortTitle: "Create shared middleware", description: "Built validation and error-handling middleware", minutes: 35 },
        { shortTitle: "Migrate endpoints", description: "Updated all user routes to use new middleware", minutes: 25 },
        { shortTitle: "Write tests", description: "Added integration tests for refactored endpoints", minutes: 15 },
      ],
      keyActivities: [
        "Reviewed existing API route handlers in VS Code",
        "Created shared validation middleware module",
        "Ran test suite and fixed 2 failing tests",
        "Pushed branch and opened PR for review",
      ],
    },
    {
      name: "Auth system JWT improvements",
      sessionType: "focused",
      summary:
        "Enhanced the JWT authentication flow with refresh token rotation and improved token expiry handling. Added automatic token refresh in the API client and implemented secure httpOnly cookie storage for refresh tokens.",
      accomplishments: [
        "Implemented refresh token rotation with automatic invalidation of used tokens",
        "Added httpOnly cookie storage for refresh tokens improving security posture",
        "Reduced auth-related 401 errors by 85% with proactive token refresh",
      ],
      taskBreakdown: [
        { shortTitle: "Token rotation logic", description: "Implemented server-side refresh token rotation", minutes: 30 },
        { shortTitle: "Cookie storage", description: "Switched refresh tokens to httpOnly cookies", minutes: 20 },
        { shortTitle: "Client-side refresh", description: "Added automatic token refresh interceptor", minutes: 25 },
      ],
      keyActivities: [
        "Designed token rotation flow on whiteboard",
        "Implemented refresh endpoint in auth router",
        "Updated API client with axios interceptor for auto-refresh",
        "Tested full auth flow including edge cases",
      ],
    },
    {
      name: "Database query optimization",
      sessionType: "focused",
      summary:
        "Investigated and resolved slow query performance in the activity dashboard. Added composite indexes for common query patterns, rewrote N+1 queries using Drizzle joins, and added query result caching for frequently accessed data.",
      accomplishments: [
        "Reduced dashboard load time from 4.2s to 0.8s with optimized queries",
        "Eliminated 6 N+1 query patterns by switching to eager loading with joins",
        "Added Redis caching for team activity aggregations",
      ],
      taskBreakdown: [
        { shortTitle: "Profile slow queries", description: "Used pg_stat_statements to identify bottlenecks", minutes: 15 },
        { shortTitle: "Add indexes", description: "Created composite indexes for dashboard queries", minutes: 20 },
        { shortTitle: "Rewrite N+1 queries", description: "Converted sequential queries to Drizzle joins", minutes: 30 },
        { shortTitle: "Add caching layer", description: "Implemented Redis caching for team aggregations", minutes: 20 },
      ],
      keyActivities: [
        "Analyzed query execution plans in pgAdmin",
        "Created migration with new composite indexes",
        "Refactored repository layer to use joins",
        "Verified performance improvement with load testing",
      ],
    },
    {
      name: "Bug triage and hotfix session",
      sessionType: "passive",
      summary:
        "Triaged 5 production bug reports and implemented fixes for the 2 critical issues. Fixed a race condition in session cleanup that caused orphaned records, and patched a timezone handling bug in the activity date rollup.",
      accomplishments: [
        "Fixed race condition in session cleanup preventing orphaned monitoring records",
        "Patched timezone bug that caused activity data to be attributed to wrong dates",
        "Closed 3 low-priority bugs as duplicates with proper cross-references",
      ],
      taskBreakdown: [
        { shortTitle: "Triage bug reports", description: "Reviewed and prioritized 5 incoming bug reports", minutes: 15 },
        { shortTitle: "Fix race condition", description: "Added row-level locking to session cleanup", minutes: 30 },
        { shortTitle: "Fix timezone bug", description: "Normalized all date comparisons to UTC", minutes: 25 },
      ],
      keyActivities: [
        "Reviewed error logs in production monitoring",
        "Reproduced race condition locally with concurrent requests",
        "Applied fix and wrote regression test",
        "Deployed hotfix to staging and verified",
      ],
    },
    {
      name: "Code review and PR feedback",
      sessionType: "passive",
      summary:
        "Reviewed 4 pull requests from team members. Provided detailed feedback on the new notification system architecture, caught a potential SQL injection in the search endpoint, and approved the design system component library update.",
      accomplishments: [
        "Caught and prevented a SQL injection vulnerability in the search endpoint PR",
        "Provided architectural feedback that simplified the notification system design",
        "Reviewed and approved 3 PRs enabling team to ship on schedule",
      ],
      taskBreakdown: [
        { shortTitle: "Review notification PR", description: "Deep review of notification system architecture", minutes: 25 },
        { shortTitle: "Review search endpoint", description: "Found SQL injection, suggested parameterized queries", minutes: 20 },
        { shortTitle: "Review component library", description: "Verified design system changes and accessibility", minutes: 15 },
        { shortTitle: "Review minor fixes", description: "Quick review of 1 small bugfix PR", minutes: 10 },
      ],
      keyActivities: [
        "Read through notification system PR diff on GitHub",
        "Tested search endpoint locally and identified injection vector",
        "Left detailed review comments with code suggestions",
        "Approved PRs and notified authors in Slack",
      ],
    },
    {
      name: "Feature: real-time activity feed",
      sessionType: "focused",
      summary:
        "Built the real-time activity feed using WebSocket connections. Implemented server-sent events for live session updates, added client-side state management with React Query, and created the feed UI component with virtual scrolling for performance.",
      accomplishments: [
        "Shipped real-time activity feed with sub-200ms update latency",
        "Implemented virtual scrolling handling 1000+ feed items without jank",
        "Added WebSocket reconnection logic with exponential backoff",
      ],
      taskBreakdown: [
        { shortTitle: "WebSocket server setup", description: "Created WS endpoint with authentication", minutes: 25 },
        { shortTitle: "Event dispatching", description: "Built event system for session state changes", minutes: 20 },
        { shortTitle: "Client integration", description: "Connected feed component to WS with React Query", minutes: 25 },
        { shortTitle: "Virtual scrolling", description: "Implemented virtualized list for feed performance", minutes: 20 },
      ],
      keyActivities: [
        "Set up WebSocket server with ws library",
        "Designed event schema for activity feed updates",
        "Built React component with virtual scrolling",
        "Load tested with 50 concurrent connections",
      ],
    },
  ],
  pm: [
    {
      name: "Sprint planning and backlog grooming",
      sessionType: "focused",
      summary:
        "Facilitated sprint planning for the team. Prioritized 15 backlog items based on customer impact and engineering effort, broke down 3 epics into actionable stories, and assigned owners for the upcoming 2-week sprint.",
      accomplishments: [
        "Prioritized sprint backlog with clear impact-effort scoring for 15 items",
        "Decomposed 3 large epics into 12 actionable user stories with acceptance criteria",
        "Achieved team consensus on sprint goals within 45-minute planning session",
      ],
      taskBreakdown: [
        { shortTitle: "Backlog prioritization", description: "Scored and ranked items by impact and effort", minutes: 25 },
        { shortTitle: "Epic decomposition", description: "Broke 3 epics into user stories", minutes: 30 },
        { shortTitle: "Sprint commitment", description: "Facilitated team commitment and owner assignment", minutes: 20 },
      ],
      keyActivities: [
        "Reviewed customer feedback tickets in Linear",
        "Led sprint planning meeting on Zoom",
        "Updated sprint board with committed stories",
        "Sent sprint goals summary to team in Slack",
      ],
    },
    {
      name: "Product requirements review",
      sessionType: "focused",
      summary:
        "Refined the PRD for the analytics dashboard redesign. Incorporated feedback from 3 stakeholder interviews, updated user flows, defined success metrics, and aligned with engineering on technical constraints.",
      accomplishments: [
        "Finalized PRD for analytics dashboard with sign-off from all stakeholders",
        "Defined 5 measurable success metrics tied to business KPIs",
        "Identified 2 technical constraints early saving estimated 1 week of rework",
      ],
      taskBreakdown: [
        { shortTitle: "Stakeholder feedback", description: "Synthesized notes from 3 stakeholder interviews", minutes: 20 },
        { shortTitle: "PRD updates", description: "Updated requirements, user flows, and edge cases", minutes: 30 },
        { shortTitle: "Success metrics", description: "Defined measurable KPIs for the feature", minutes: 15 },
        { shortTitle: "Eng alignment", description: "Reviewed technical feasibility with engineering lead", minutes: 20 },
      ],
      keyActivities: [
        "Reviewed stakeholder interview notes in Notion",
        "Updated PRD document with revised requirements",
        "Created user flow diagrams in Figma",
        "Met with engineering lead to discuss constraints",
      ],
    },
    {
      name: "Customer feedback synthesis",
      sessionType: "passive",
      summary:
        "Analyzed the last month of customer feedback from support tickets, NPS surveys, and user interviews. Identified the top 3 pain points, mapped them to product roadmap items, and drafted recommendations for Q2 planning.",
      accomplishments: [
        "Synthesized 47 customer feedback data points into 3 actionable themes",
        "Mapped customer pain points to 5 existing roadmap items for Q2 prioritization",
        "Drafted executive summary with recommendations for leadership review",
      ],
      taskBreakdown: [
        { shortTitle: "Data collection", description: "Gathered feedback from support, NPS, and interviews", minutes: 20 },
        { shortTitle: "Theme analysis", description: "Categorized and identified top 3 pain points", minutes: 25 },
        { shortTitle: "Roadmap mapping", description: "Connected themes to existing product roadmap", minutes: 15 },
        { shortTitle: "Recommendations", description: "Drafted executive summary with proposed actions", minutes: 20 },
      ],
      keyActivities: [
        "Exported support ticket data from Zendesk",
        "Created affinity diagram grouping feedback themes",
        "Cross-referenced with product roadmap in Linear",
        "Wrote executive summary document in Notion",
      ],
    },
    {
      name: "Cross-team alignment on Q2 goals",
      sessionType: "focused",
      summary:
        "Led cross-functional alignment session with engineering, design, and marketing. Reviewed Q1 retrospective data, aligned on Q2 OKRs, and resolved 2 resource conflicts between teams.",
      accomplishments: [
        "Achieved alignment across 3 teams on Q2 priorities and shared OKRs",
        "Resolved resource conflict by rescheduling design system work to late Q2",
        "Documented clear ownership matrix for all Q2 initiatives",
      ],
      taskBreakdown: [
        { shortTitle: "Q1 retrospective", description: "Presented Q1 metrics and learnings", minutes: 15 },
        { shortTitle: "OKR alignment", description: "Facilitated discussion on Q2 objectives", minutes: 30 },
        { shortTitle: "Conflict resolution", description: "Worked through 2 resource conflicts", minutes: 20 },
        { shortTitle: "Documentation", description: "Created ownership matrix and action items", minutes: 15 },
      ],
      keyActivities: [
        "Prepared Q1 retrospective slides",
        "Facilitated cross-team meeting on Google Meet",
        "Updated OKR tracker in Notion",
        "Sent meeting notes and action items to all teams",
      ],
    },
  ],
  customer_success: [
    {
      name: "Client onboarding: Acme Corp",
      sessionType: "focused",
      summary:
        "Conducted full onboarding for Acme Corp's 15-person team. Walked through platform setup, configured their Slack and Notion integrations, and created customized training documentation for their specific workflow.",
      accomplishments: [
        "Successfully onboarded Acme Corp's 15-person team with 100% activation rate",
        "Configured Slack and Notion integrations reducing their setup time by 60%",
        "Created customized training guide tailored to their engineering workflow",
      ],
      taskBreakdown: [
        { shortTitle: "Platform walkthrough", description: "Live demo of core features for the team", minutes: 30 },
        { shortTitle: "Integration setup", description: "Configured Slack and Notion integrations", minutes: 25 },
        { shortTitle: "Custom documentation", description: "Created team-specific training guides", minutes: 20 },
      ],
      keyActivities: [
        "Led onboarding call with Acme Corp team on Zoom",
        "Configured Slack integration with their workspace",
        "Created custom training docs in Google Docs",
        "Sent follow-up email with next steps",
      ],
    },
    {
      name: "Quarterly business review preparation",
      sessionType: "passive",
      summary:
        "Prepared QBR materials for 3 enterprise accounts. Compiled usage analytics, identified expansion opportunities, and created presentation decks with ROI metrics and success stories.",
      accomplishments: [
        "Prepared QBR decks for 3 enterprise accounts highlighting 40% avg productivity gain",
        "Identified $45K expansion opportunity across Nike and Stripe accounts",
        "Created reusable QBR template reducing future prep time by 50%",
      ],
      taskBreakdown: [
        { shortTitle: "Usage analytics", description: "Compiled platform usage data for 3 accounts", minutes: 20 },
        { shortTitle: "ROI calculations", description: "Calculated productivity improvements and time savings", minutes: 20 },
        { shortTitle: "Deck creation", description: "Built presentation slides with charts and metrics", minutes: 25 },
        { shortTitle: "Template creation", description: "Standardized QBR template for future use", minutes: 15 },
      ],
      keyActivities: [
        "Exported usage analytics from admin dashboard",
        "Created ROI calculation spreadsheet",
        "Built QBR slide deck in Google Slides",
        "Shared draft with account managers for review",
      ],
    },
    {
      name: "Support escalation resolution",
      sessionType: "focused",
      summary:
        "Resolved 2 critical support escalations. Investigated a data sync issue affecting Nike's team and coordinated with engineering to deploy a fix. Also resolved a billing discrepancy for Stripe's account.",
      accomplishments: [
        "Resolved Nike's data sync issue within 2 hours of escalation",
        "Coordinated emergency fix deployment with engineering team",
        "Corrected Stripe billing discrepancy and issued credit memo",
      ],
      taskBreakdown: [
        { shortTitle: "Investigate sync issue", description: "Diagnosed Nike's data synchronization problem", minutes: 25 },
        { shortTitle: "Coordinate fix", description: "Worked with engineering to deploy hotfix", minutes: 20 },
        { shortTitle: "Billing resolution", description: "Investigated and corrected Stripe billing error", minutes: 20 },
        { shortTitle: "Follow-up", description: "Sent resolution summaries to affected accounts", minutes: 10 },
      ],
      keyActivities: [
        "Investigated error logs for Nike's sync issue",
        "Created urgent Slack thread with engineering team",
        "Reviewed billing records and identified discrepancy",
        "Sent resolution emails to both accounts",
      ],
    },
    {
      name: "Customer health check calls",
      sessionType: "passive",
      summary:
        "Conducted health check calls with 4 accounts flagged as at-risk. Identified adoption blockers, documented specific concerns, and created action plans to improve engagement over the next 30 days.",
      accomplishments: [
        "Completed health checks for 4 at-risk accounts identifying specific adoption blockers",
        "Created 30-day action plans for each account with measurable engagement targets",
        "Prevented potential churn by scheduling executive sponsor meetings for 2 accounts",
      ],
      taskBreakdown: [
        { shortTitle: "Pre-call research", description: "Reviewed usage data and support history for each account", minutes: 15 },
        { shortTitle: "Health check calls", description: "Conducted 4 calls with account stakeholders", minutes: 40 },
        { shortTitle: "Action plans", description: "Created 30-day improvement plans for each account", minutes: 20 },
      ],
      keyActivities: [
        "Reviewed account health dashboards before calls",
        "Conducted health check calls on Zoom",
        "Documented concerns and blockers in CRM",
        "Created action plan documents in Notion",
      ],
    },
  ],
  sales: [
    {
      name: "Pipeline review and forecasting",
      sessionType: "focused",
      summary:
        "Conducted weekly pipeline review and updated Q2 forecast. Qualified 3 new inbound leads, moved 2 deals to negotiation stage, and revised revenue forecast based on updated close probabilities.",
      accomplishments: [
        "Qualified 3 new inbound leads with combined ARR potential of $120K",
        "Advanced 2 deals to negotiation stage accelerating expected close dates",
        "Updated Q2 forecast with 15% increase based on pipeline momentum",
      ],
      taskBreakdown: [
        { shortTitle: "Pipeline review", description: "Reviewed all active opportunities in CRM", minutes: 20 },
        { shortTitle: "Lead qualification", description: "Qualified 3 new inbound leads", minutes: 25 },
        { shortTitle: "Forecast update", description: "Revised Q2 revenue forecast and probabilities", minutes: 15 },
        { shortTitle: "Follow-ups", description: "Sent next-step emails to 5 prospects", minutes: 15 },
      ],
      keyActivities: [
        "Reviewed pipeline dashboard in CRM",
        "Conducted discovery calls with 3 new leads",
        "Updated deal stages and close probabilities",
        "Sent follow-up emails and scheduled next meetings",
      ],
    },
    {
      name: "Demo preparation and delivery",
      sessionType: "focused",
      summary:
        "Prepared and delivered a customized product demo for Nike's procurement team. Tailored the demo to their specific use case, addressed security concerns, and outlined a proposed implementation timeline.",
      accomplishments: [
        "Delivered compelling demo to Nike resulting in request for formal proposal",
        "Addressed all security and compliance concerns with prepared documentation",
        "Proposed 4-week implementation timeline accepted by procurement team",
      ],
      taskBreakdown: [
        { shortTitle: "Demo customization", description: "Tailored demo environment for Nike's workflow", minutes: 25 },
        { shortTitle: "Security prep", description: "Prepared security documentation and compliance answers", minutes: 15 },
        { shortTitle: "Demo delivery", description: "Presented to Nike's 6-person procurement team", minutes: 30 },
        { shortTitle: "Proposal outline", description: "Created implementation timeline and pricing proposal", minutes: 20 },
      ],
      keyActivities: [
        "Customized demo instance with Nike branding",
        "Reviewed security questionnaire answers",
        "Delivered live demo on Zoom with screen sharing",
        "Drafted proposal document in Google Docs",
      ],
    },
    {
      name: "Outbound prospecting session",
      sessionType: "passive",
      summary:
        "Researched and reached out to 8 target accounts in the fintech vertical. Drafted personalized outreach sequences, connected with 3 prospects on LinkedIn, and booked 2 discovery calls for next week.",
      accomplishments: [
        "Booked 2 discovery calls from outbound prospecting effort",
        "Created personalized outreach sequences for 8 fintech accounts",
        "Built prospect research database with key decision-maker contacts",
      ],
      taskBreakdown: [
        { shortTitle: "Account research", description: "Researched 8 target fintech accounts", minutes: 25 },
        { shortTitle: "Outreach drafting", description: "Wrote personalized email sequences", minutes: 20 },
        { shortTitle: "LinkedIn outreach", description: "Connected with decision-makers on LinkedIn", minutes: 15 },
        { shortTitle: "Calendar booking", description: "Scheduled 2 discovery calls", minutes: 10 },
      ],
      keyActivities: [
        "Researched target accounts on LinkedIn and Crunchbase",
        "Drafted personalized outreach emails in Gmail",
        "Sent LinkedIn connection requests to 8 prospects",
        "Booked 2 discovery calls via Calendly",
      ],
    },
  ],
  design: [
    {
      name: "Dashboard redesign exploration",
      sessionType: "focused",
      summary:
        "Explored 3 design directions for the activity dashboard redesign. Created wireframes, tested different data visualization approaches, and gathered initial feedback from the product team on the preferred direction.",
      accomplishments: [
        "Created 3 distinct design concepts for the dashboard redesign",
        "Validated preferred direction with product team saving a week of iteration",
        "Established reusable chart component patterns for the design system",
      ],
      taskBreakdown: [
        { shortTitle: "Competitive analysis", description: "Reviewed 5 competitor dashboard designs", minutes: 20 },
        { shortTitle: "Wireframing", description: "Created 3 design direction wireframes in Figma", minutes: 30 },
        { shortTitle: "Data viz exploration", description: "Tested chart types for activity data", minutes: 20 },
        { shortTitle: "Team feedback", description: "Presented concepts and gathered input", minutes: 15 },
      ],
      keyActivities: [
        "Reviewed competitor dashboards for inspiration",
        "Created wireframes in Figma with 3 layout options",
        "Explored chart libraries for data visualization",
        "Shared designs in Slack for async feedback",
      ],
    },
    {
      name: "Design system component audit",
      sessionType: "passive",
      summary:
        "Audited the design system for consistency issues. Found 8 components with inconsistent spacing, updated the color token system to support dark mode, and documented all component variants.",
      accomplishments: [
        "Identified and fixed 8 spacing inconsistencies across core components",
        "Updated color token system with full dark mode support",
        "Documented all component variants reducing designer onboarding time",
      ],
      taskBreakdown: [
        { shortTitle: "Component audit", description: "Reviewed all components for consistency", minutes: 25 },
        { shortTitle: "Spacing fixes", description: "Corrected spacing tokens across 8 components", minutes: 20 },
        { shortTitle: "Dark mode tokens", description: "Added dark mode color variants", minutes: 20 },
        { shortTitle: "Documentation", description: "Updated Figma component documentation", minutes: 15 },
      ],
      keyActivities: [
        "Audited component library in Figma",
        "Fixed spacing tokens to match 4px grid",
        "Created dark mode color palette",
        "Updated component documentation pages",
      ],
    },
    {
      name: "User research synthesis",
      sessionType: "focused",
      summary:
        "Synthesized findings from 6 user interview sessions. Created an affinity diagram, identified 4 key insight themes, and drafted a research report with design recommendations for the next sprint.",
      accomplishments: [
        "Synthesized 6 user interviews into 4 actionable insight themes",
        "Created research report with 8 specific design recommendations",
        "Identified critical usability issue in session start flow affecting 60% of users",
      ],
      taskBreakdown: [
        { shortTitle: "Interview review", description: "Re-read transcripts and highlighted key quotes", minutes: 20 },
        { shortTitle: "Affinity mapping", description: "Grouped findings into themes on FigJam", minutes: 25 },
        { shortTitle: "Insight extraction", description: "Distilled themes into actionable insights", minutes: 15 },
        { shortTitle: "Report writing", description: "Drafted research report with recommendations", minutes: 25 },
      ],
      keyActivities: [
        "Reviewed interview transcripts and recordings",
        "Created affinity diagram on FigJam board",
        "Extracted key insights and user quotes",
        "Wrote research report in Notion",
      ],
    },
    {
      name: "Prototype: settings page redesign",
      sessionType: "focused",
      summary:
        "Built an interactive prototype for the redesigned settings page. Added micro-interactions for toggle states, created responsive layouts for mobile and desktop, and shared the prototype for engineering review.",
      accomplishments: [
        "Delivered interactive prototype with 12 screens and micro-interactions",
        "Designed responsive layouts supporting mobile, tablet, and desktop viewports",
        "Received engineering sign-off on feasibility of all proposed interactions",
      ],
      taskBreakdown: [
        { shortTitle: "Screen design", description: "Designed 12 settings page screens", minutes: 30 },
        { shortTitle: "Micro-interactions", description: "Added toggle, slide, and fade animations", minutes: 20 },
        { shortTitle: "Responsive layouts", description: "Created breakpoint variants for all screens", minutes: 15 },
        { shortTitle: "Prototype linking", description: "Connected screens into interactive flow", minutes: 10 },
      ],
      keyActivities: [
        "Designed settings page layouts in Figma",
        "Added smart animate micro-interactions",
        "Created responsive variants for 3 breakpoints",
        "Shared prototype link for team review",
      ],
    },
  ],
  devops: [
    {
      name: "Infrastructure monitoring setup",
      sessionType: "focused",
      summary:
        "Set up comprehensive monitoring for the production environment. Configured Datadog dashboards for API latency, error rates, and resource utilization. Created alerting rules for critical thresholds and documented the runbook.",
      accomplishments: [
        "Deployed monitoring dashboards covering all critical production metrics",
        "Configured 12 alerting rules with appropriate severity levels and routing",
        "Created incident response runbook reducing mean-time-to-acknowledge by 40%",
      ],
      taskBreakdown: [
        { shortTitle: "Dashboard setup", description: "Created Datadog dashboards for key metrics", minutes: 25 },
        { shortTitle: "Alert configuration", description: "Set up alerting rules for critical thresholds", minutes: 20 },
        { shortTitle: "Runbook creation", description: "Documented incident response procedures", minutes: 20 },
        { shortTitle: "Testing", description: "Triggered test alerts to verify routing", minutes: 10 },
      ],
      keyActivities: [
        "Configured Datadog integration with production services",
        "Created custom dashboards for API and database metrics",
        "Set up PagerDuty routing for critical alerts",
        "Wrote runbook documentation in Notion",
      ],
    },
    {
      name: "CI/CD pipeline optimization",
      sessionType: "focused",
      summary:
        "Optimized the GitHub Actions CI/CD pipeline. Parallelized test execution across 3 runners, added Docker layer caching, and reduced the full pipeline time from 18 minutes to 7 minutes.",
      accomplishments: [
        "Reduced CI/CD pipeline duration from 18 minutes to 7 minutes (61% improvement)",
        "Parallelized test execution across 3 runners with proper sharding",
        "Added Docker layer caching saving 4 minutes per build",
      ],
      taskBreakdown: [
        { shortTitle: "Pipeline analysis", description: "Identified bottlenecks in current workflow", minutes: 15 },
        { shortTitle: "Test parallelization", description: "Sharded tests across 3 GitHub runners", minutes: 25 },
        { shortTitle: "Docker caching", description: "Implemented multi-stage build with layer caching", minutes: 20 },
        { shortTitle: "Validation", description: "Ran 10 builds to verify consistency and speed", minutes: 15 },
      ],
      keyActivities: [
        "Analyzed GitHub Actions workflow timing breakdown",
        "Configured test sharding with jest --shard flag",
        "Updated Dockerfile with multi-stage build",
        "Validated pipeline with multiple test runs",
      ],
    },
    {
      name: "Security patch deployment",
      sessionType: "focused",
      summary:
        "Deployed critical security patches across all environments. Updated Node.js runtime, patched 3 CVEs in npm dependencies, rotated API secrets, and verified no regressions in staging before production rollout.",
      accomplishments: [
        "Patched 3 critical CVEs with zero downtime deployment",
        "Rotated all API secrets and updated vault entries",
        "Completed full security audit of dependency tree with clean bill of health",
      ],
      taskBreakdown: [
        { shortTitle: "CVE assessment", description: "Reviewed and prioritized 3 critical vulnerabilities", minutes: 15 },
        { shortTitle: "Dependency updates", description: "Updated affected packages and resolved conflicts", minutes: 25 },
        { shortTitle: "Secret rotation", description: "Rotated API keys and updated vault", minutes: 15 },
        { shortTitle: "Deployment", description: "Staged rollout to staging then production", minutes: 20 },
      ],
      keyActivities: [
        "Ran npm audit and reviewed CVE details",
        "Updated package.json and resolved version conflicts",
        "Rotated secrets in AWS Secrets Manager",
        "Deployed to staging, ran smoke tests, then production",
      ],
    },
  ],
};

// ── Helpers ──────────────────────────────────────────

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

// ── Main ──────────────────────────────────────────

async function main() {
  console.log("🌱 Seeding monitoring sessions for Mitable org (last 2 weeks)...\n");

  // 1. Find the Mitable org
  const [org] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.domain, "mitable.ai"))
    .limit(1);

  if (!org) {
    console.error("❌ Mitable org not found.");
    process.exit(1);
  }
  console.log(`✅ Found org: ${org.name} (${org.id})`);

  // 2. Get all users in the org
  const users = await db
    .select({
      id: schema.users.id,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
      role: schema.users.role,
    })
    .from(schema.users)
    .where(eq(schema.users.organizationId, org.id));

  if (users.length === 0) {
    console.error("❌ No users found in Lorikeet org.");
    process.exit(1);
  }
  console.log(`✅ Found ${users.length} users\n`);

  // 3. Generate weekdays for last 2 weeks
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekdays: Date[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    if (d.getDay() !== 0 && d.getDay() !== 6) weekdays.push(d);
  }

  let totalSessions = 0;
  let skippedUsers = 0;

  for (const user of users) {
    const firstName = user.firstName || "Unknown";
    const roleKey = USER_ROLE_MAP[firstName] || "engineer";
    const templates = TEMPLATES[roleKey] || TEMPLATES["engineer"]!;

    // Check if user already has seed sessions
    const existing = await db
      .select({ id: schema.monitoringSessions.id })
      .from(schema.monitoringSessions)
      .where(
        and(
          eq(schema.monitoringSessions.userId, user.id),
          like(schema.monitoringSessions.name, "[SEED]%")
        )
      )
      .limit(1);

    if (existing.length > 0) {
      console.log(`  ⏭️  ${firstName} ${user.lastName || ""} — already has seed sessions, skipping`);
      skippedUsers++;
      continue;
    }

    // Pick 3-5 random templates
    const numSessions = rand(3, Math.min(5, templates.length));
    const selectedTemplates = shuffle(templates).slice(0, numSessions);
    const sessionDates = shuffle(weekdays).slice(0, numSessions);

    console.log(`  👤 ${firstName} ${user.lastName || ""} (${roleKey}) — inserting ${numSessions} sessions`);

    for (let i = 0; i < numSessions; i++) {
      const template = selectedTemplates[i]!;
      const sessionDate = sessionDates[i]!;

      // Random start time between 9am and 4pm
      const startHour = rand(9, 16);
      const startMin = rand(0, 45);
      const startedAt = new Date(sessionDate);
      startedAt.setHours(startHour, startMin, 0, 0);

      // Session duration 30-120 minutes
      const durationMin = rand(30, 120);
      const endedAt = new Date(startedAt.getTime() + durationMin * 60 * 1000);

      // Scale task breakdown minutes to match session duration
      const templateTotalMin = template.taskBreakdown.reduce((s, t) => s + t.minutes, 0);
      const scale = durationMin / templateTotalMin;
      const scaledTasks = template.taskBreakdown.map((t) => ({
        shortTitle: t.shortTitle,
        description: t.description,
        minutes: Math.round(t.minutes * scale),
      }));

      await db.insert(schema.monitoringSessions).values({
        organizationId: org.id,
        userId: user.id,
        name: `[SEED] ${template.name}`,
        sessionType: template.sessionType,
        status: "ended",
        ingestionStatus: "completed",
        captureIntervalMs: 30000,
        selectedWindows: [],
        startedAt,
        endedAt,
        totalPausedMs: 0,
        rawActivitySummary: template.summary,
        finalSummary: template.summary,
        accomplishments: template.accomplishments,
        taskBreakdown: scaledTasks,
        keyActivities: template.keyActivities,
      });

      totalSessions++;
    }
  }

  console.log(`\n✅ Done!`);
  console.log(`   ${totalSessions} monitoring sessions inserted`);
  if (skippedUsers > 0) console.log(`   ${skippedUsers} users skipped (already had seed sessions)`);

  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  pool.end();
  process.exit(1);
});
