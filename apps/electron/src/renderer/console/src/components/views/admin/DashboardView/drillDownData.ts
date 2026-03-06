export interface DrillDownItem {
  title: string;
  subtitle: string;
  stats: { label: string; value: string }[];
  breakdown: { label: string; value: string; bar?: number }[];
  trend: { label: string; value: number }[];
}

// ── Metric card drill-downs ───────────────────────────────────
const metricDrillDowns: Record<string, DrillDownItem> = {
  "Avg Focus Time": {
    title: "Avg Focus Time",
    subtitle: "Deep work hours per person per day this week",
    stats: [
      { label: "This Week Avg", value: "4.2h" },
      { label: "Last Week Avg", value: "3.7h" },
      { label: "Best Day", value: "Wed (5.1h)" },
      { label: "Lowest Day", value: "Fri (2.8h)" },
    ],
    breakdown: [
      { label: "Technical Writing", value: "1.4h avg", bar: 70 },
      { label: "Code & Development", value: "1.1h avg", bar: 55 },
      { label: "Report Writing", value: "0.9h avg", bar: 45 },
      { label: "Research & Analysis", value: "0.8h avg", bar: 40 },
    ],
    trend: [
      { label: "Mon", value: 3.8 },
      { label: "Tue", value: 4.5 },
      { label: "Wed", value: 5.1 },
      { label: "Thu", value: 4.2 },
      { label: "Fri", value: 2.8 },
    ],
  },
  "Reports Completed": {
    title: "Reports Completed",
    subtitle: "14 reports finished this week",
    stats: [
      { label: "This Week", value: "14" },
      { label: "Last Week", value: "11" },
      { label: "Avg Time to Complete", value: "2.3h" },
      { label: "On-Time Rate", value: "86%" },
    ],
    breakdown: [
      { label: "Q4 Revenue Analysis", value: "Completed Tue", bar: 100 },
      { label: "Sprint Retrospective", value: "Completed Wed", bar: 100 },
      { label: "Customer Churn Report", value: "Completed Wed", bar: 100 },
      { label: "Weekly Status Update (x4)", value: "Mon–Thu", bar: 100 },
      { label: "Incident Post-mortem", value: "Completed Thu", bar: 100 },
      { label: "Team Activity Report", value: "Completed Fri", bar: 80 },
    ],
    trend: [
      { label: "Mon", value: 2 },
      { label: "Tue", value: 3 },
      { label: "Wed", value: 4 },
      { label: "Thu", value: 3 },
      { label: "Fri", value: 2 },
    ],
  },
  "Avg Meeting Load": {
    title: "Avg Meeting Load",
    subtitle: "Meeting hours per person per day",
    stats: [
      { label: "This Week Avg", value: "1.8h" },
      { label: "Last Week Avg", value: "2.1h" },
      { label: "Recurring", value: "62%" },
      { label: "Ad-hoc", value: "38%" },
    ],
    breakdown: [
      { label: "Sprint Planning", value: "4.2h total", bar: 85 },
      { label: "1:1s with Manager", value: "3.0h total", bar: 60 },
      { label: "Standup", value: "2.5h total", bar: 50 },
      { label: "Client Calls", value: "2.1h total", bar: 42 },
      { label: "Design Reviews", value: "1.8h total", bar: 36 },
    ],
    trend: [
      { label: "Mon", value: 2.2 },
      { label: "Tue", value: 1.5 },
      { label: "Wed", value: 2.8 },
      { label: "Thu", value: 1.6 },
      { label: "Fri", value: 1.0 },
    ],
  },
  "Support Tickets Resolved": {
    title: "Support Tickets Resolved",
    subtitle: "38 tickets closed this week",
    stats: [
      { label: "Resolved", value: "38" },
      { label: "Still Open", value: "7" },
      { label: "Avg Resolution Time", value: "3.2h" },
      { label: "First Response", value: "18min avg" },
    ],
    breakdown: [
      { label: "Bug Reports", value: "14 resolved", bar: 90 },
      { label: "Feature Requests", value: "8 resolved", bar: 55 },
      { label: "Account Issues", value: "7 resolved", bar: 48 },
      { label: "How-to Questions", value: "6 resolved", bar: 40 },
      { label: "Billing", value: "3 resolved", bar: 20 },
    ],
    trend: [
      { label: "Mon", value: 9 },
      { label: "Tue", value: 11 },
      { label: "Wed", value: 8 },
      { label: "Thu", value: 7 },
      { label: "Fri", value: 3 },
    ],
  },
};

// ── Activity breakdown drill-downs ────────────────────────────
const activityDrillDowns: Record<string, DrillDownItem> = {
  "Technical Writing": {
    title: "Technical Writing",
    subtitle: "28h across the team this week",
    stats: [
      { label: "Total Hours", value: "28h" },
      { label: "Contributors", value: "8 people" },
      { label: "Docs Produced", value: "12" },
      { label: "Avg per Person", value: "3.5h" },
    ],
    breakdown: [
      { label: "API Documentation", value: "8.5h", bar: 85 },
      { label: "Architecture Decisions", value: "6.2h", bar: 62 },
      { label: "Runbook Updates", value: "5.1h", bar: 51 },
      { label: "Release Notes", value: "4.8h", bar: 48 },
      { label: "Internal Wiki", value: "3.4h", bar: 34 },
    ],
    trend: [
      { label: "Mon", value: 5.2 },
      { label: "Tue", value: 6.8 },
      { label: "Wed", value: 7.1 },
      { label: "Thu", value: 5.5 },
      { label: "Fri", value: 3.4 },
    ],
  },
  "Customer Support": {
    title: "Customer Support",
    subtitle: "22h of support activity this week",
    stats: [
      { label: "Total Hours", value: "22h" },
      { label: "Tickets Handled", value: "45" },
      { label: "Avg Response Time", value: "18min" },
      { label: "CSAT Score", value: "4.6/5" },
    ],
    breakdown: [
      { label: "Live Chat", value: "9.2h", bar: 80 },
      { label: "Email Support", value: "6.5h", bar: 56 },
      { label: "Escalations", value: "3.8h", bar: 33 },
      { label: "Knowledge Base Updates", value: "2.5h", bar: 22 },
    ],
    trend: [
      { label: "Mon", value: 5.5 },
      { label: "Tue", value: 4.8 },
      { label: "Wed", value: 4.2 },
      { label: "Thu", value: 4.5 },
      { label: "Fri", value: 3.0 },
    ],
  },
  "Sprint Planning": {
    title: "Sprint Planning",
    subtitle: "16h of planning meetings this week",
    stats: [
      { label: "Total Hours", value: "16h" },
      { label: "Meetings Held", value: "8" },
      { label: "Avg Duration", value: "1h 15m" },
      { label: "Action Items Created", value: "34" },
    ],
    breakdown: [
      { label: "Sprint Planning", value: "4.5h", bar: 75 },
      { label: "Backlog Grooming", value: "3.8h", bar: 63 },
      { label: "Retrospective", value: "3.2h", bar: 53 },
      { label: "Standup (daily)", value: "2.5h", bar: 42 },
      { label: "Capacity Planning", value: "2.0h", bar: 33 },
    ],
    trend: [
      { label: "Mon", value: 4.2 },
      { label: "Tue", value: 2.8 },
      { label: "Wed", value: 3.5 },
      { label: "Thu", value: 3.0 },
      { label: "Fri", value: 2.5 },
    ],
  },
  "Lead Follow-ups": {
    title: "Lead Follow-ups",
    subtitle: "14h of outreach this week",
    stats: [
      { label: "Total Hours", value: "14h" },
      { label: "Contacts Made", value: "62" },
      { label: "Response Rate", value: "34%" },
      { label: "Meetings Booked", value: "8" },
    ],
    breakdown: [
      { label: "Cold Outreach", value: "5.2h", bar: 72 },
      { label: "Follow-up Emails", value: "3.8h", bar: 53 },
      { label: "Demo Calls", value: "3.0h", bar: 42 },
      { label: "CRM Updates", value: "2.0h", bar: 28 },
    ],
    trend: [
      { label: "Mon", value: 3.5 },
      { label: "Tue", value: 3.2 },
      { label: "Wed", value: 2.8 },
      { label: "Thu", value: 2.5 },
      { label: "Fri", value: 2.0 },
    ],
  },
  "Bug Triage": {
    title: "Bug Triage",
    subtitle: "10h of triage work this week",
    stats: [
      { label: "Total Hours", value: "10h" },
      { label: "Bugs Triaged", value: "27" },
      { label: "Critical", value: "3" },
      { label: "Avg Triage Time", value: "22min" },
    ],
    breakdown: [
      { label: "P0 — Critical", value: "3 bugs · 2.8h", bar: 90 },
      { label: "P1 — High", value: "7 bugs · 3.2h", bar: 70 },
      { label: "P2 — Medium", value: "11 bugs · 2.8h", bar: 45 },
      { label: "P3 — Low", value: "6 bugs · 1.2h", bar: 20 },
    ],
    trend: [
      { label: "Mon", value: 2.5 },
      { label: "Tue", value: 2.2 },
      { label: "Wed", value: 1.8 },
      { label: "Thu", value: 2.0 },
      { label: "Fri", value: 1.5 },
    ],
  },
  "Report Writing": {
    title: "Report Writing",
    subtitle: "8h of report writing this week",
    stats: [
      { label: "Total Hours", value: "8h" },
      { label: "Reports Written", value: "6" },
      { label: "Avg Time per Report", value: "1.3h" },
      { label: "On-Time Delivery", value: "83%" },
    ],
    breakdown: [
      { label: "Weekly Status Reports", value: "3.2h", bar: 80 },
      { label: "Client Deliverables", value: "2.5h", bar: 63 },
      { label: "Internal Analysis", value: "1.5h", bar: 38 },
      { label: "Compliance Reports", value: "0.8h", bar: 20 },
    ],
    trend: [
      { label: "Mon", value: 1.8 },
      { label: "Tue", value: 1.5 },
      { label: "Wed", value: 2.0 },
      { label: "Thu", value: 1.5 },
      { label: "Fri", value: 1.2 },
    ],
  },
};

export function getDrillDown(label: string): DrillDownItem | null {
  return metricDrillDowns[label] || activityDrillDowns[label] || null;
}
