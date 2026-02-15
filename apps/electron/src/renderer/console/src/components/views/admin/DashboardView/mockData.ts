export interface MetricData {
  label: string;
  value: string;
  change: string;
  changeType: "up" | "down" | "neutral";
  description: string;
}

export interface ActivityEntry {
  id: string;
  label: string;
  hours: number;
  color: string;
}

export interface WorkBlock {
  label: string;
  value: number;
  color: string;
}

export interface WeeklyTrendPoint {
  day: string;
  activities: number;
  meetings: number;
  docs: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface UserActivity {
  id: string;
  avatar: string;
  name: string;
  role: string;
  status: "active" | "idle" | "offline";
  totalHoursToday: number;
  topActivities: { type: string; label: string; duration: string }[];
  meetings: { title: string }[];
  docsCreated: number;
}

// ── Dashboard data by time range ──────────────────────────────
export type TimeRange = "day" | "week" | "month" | "ytd";

export interface DashboardData {
  metrics: MetricData[];
  activityBreakdown: ActivityEntry[];
  workBlocks: WorkBlock[];
  trend: WeeklyTrendPoint[];
}

const dataByRange: Record<TimeRange, DashboardData> = {
  day: {
    metrics: [
      {
        label: "Avg Focus Time",
        value: "3.8h",
        change: "+0.2h from yesterday",
        changeType: "up",
        description: "Average deep work per person today",
      },
      {
        label: "Reports Completed",
        value: "3",
        change: "Same as yesterday",
        changeType: "neutral",
        description: "Reports finished today",
      },
      {
        label: "Avg Meeting Load",
        value: "2.1h",
        change: "+0.4h from yesterday",
        changeType: "up",
        description: "Average meeting time per person today",
      },
      {
        label: "Support Tickets Resolved",
        value: "9",
        change: "+2 from yesterday",
        changeType: "up",
        description: "Tickets closed today",
      },
    ],
    activityBreakdown: [
      { id: "technical-writing", label: "Technical Writing", hours: 5.2, color: "#6366F1" },
      { id: "customer-support", label: "Customer Support", hours: 4.1, color: "#F472B6" },
      { id: "sprint-planning", label: "Sprint Planning", hours: 3.5, color: "#F59E0B" },
      { id: "lead-followups", label: "Lead Follow-ups", hours: 2.8, color: "#818CF8" },
      { id: "bug-triage", label: "Bug Triage", hours: 1.9, color: "#34D399" },
      { id: "report-writing", label: "Report Writing", hours: 1.2, color: "#60A5FA" },
    ],
    workBlocks: [
      { label: "Deep Work", value: 38, color: "#6366F1" },
      { label: "Meetings", value: 28, color: "#F59E0B" },
      { label: "Code Review", value: 14, color: "#818CF8" },
      { label: "Documentation", value: 12, color: "#34D399" },
      { label: "Communication", value: 8, color: "#F472B6" },
    ],
    trend: [
      { day: "9am", activities: 18, meetings: 4, docs: 1 },
      { day: "10am", activities: 32, meetings: 8, docs: 0 },
      { day: "11am", activities: 28, meetings: 12, docs: 1 },
      { day: "12pm", activities: 14, meetings: 2, docs: 0 },
      { day: "1pm", activities: 22, meetings: 6, docs: 0 },
      { day: "2pm", activities: 35, meetings: 4, docs: 1 },
      { day: "3pm", activities: 26, meetings: 3, docs: 0 },
    ],
  },
  week: {
    metrics: [
      {
        label: "Avg Focus Time",
        value: "4.2h",
        change: "+0.5h from last week",
        changeType: "up",
        description: "Average deep work per person per day",
      },
      {
        label: "Reports Completed",
        value: "14",
        change: "+3 from last week",
        changeType: "up",
        description: "Reports finished and submitted",
      },
      {
        label: "Avg Meeting Load",
        value: "1.8h",
        change: "-0.3h from last week",
        changeType: "down",
        description: "Average meeting time per person per day",
      },
      {
        label: "Support Tickets Resolved",
        value: "38",
        change: "+12% this week",
        changeType: "up",
        description: "Customer issues closed by the team",
      },
    ],
    activityBreakdown: [
      { id: "technical-writing", label: "Technical Writing", hours: 28, color: "#6366F1" },
      { id: "customer-support", label: "Customer Support", hours: 22, color: "#F472B6" },
      { id: "sprint-planning", label: "Sprint Planning", hours: 16, color: "#F59E0B" },
      { id: "lead-followups", label: "Lead Follow-ups", hours: 14, color: "#818CF8" },
      { id: "bug-triage", label: "Bug Triage", hours: 10, color: "#34D399" },
      { id: "report-writing", label: "Report Writing", hours: 8, color: "#60A5FA" },
    ],
    workBlocks: [
      { label: "Deep Work", value: 42, color: "#6366F1" },
      { label: "Meetings", value: 23, color: "#F59E0B" },
      { label: "Code Review", value: 15, color: "#818CF8" },
      { label: "Documentation", value: 12, color: "#34D399" },
      { label: "Communication", value: 8, color: "#F472B6" },
    ],
    trend: [
      { day: "Mon", activities: 156, meetings: 34, docs: 8 },
      { day: "Tue", activities: 189, meetings: 28, docs: 12 },
      { day: "Wed", activities: 201, meetings: 42, docs: 6 },
      { day: "Thu", activities: 178, meetings: 31, docs: 10 },
      { day: "Fri", activities: 123, meetings: 19, docs: 5 },
    ],
  },
  month: {
    metrics: [
      {
        label: "Avg Focus Time",
        value: "4.0h",
        change: "+0.3h from last month",
        changeType: "up",
        description: "Average deep work per person per day",
      },
      {
        label: "Reports Completed",
        value: "52",
        change: "+8 from last month",
        changeType: "up",
        description: "Reports finished this month",
      },
      {
        label: "Avg Meeting Load",
        value: "2.0h",
        change: "-0.2h from last month",
        changeType: "down",
        description: "Average meeting time per person per day",
      },
      {
        label: "Support Tickets Resolved",
        value: "156",
        change: "+18% this month",
        changeType: "up",
        description: "Tickets closed this month",
      },
    ],
    activityBreakdown: [
      { id: "technical-writing", label: "Technical Writing", hours: 112, color: "#6366F1" },
      { id: "customer-support", label: "Customer Support", hours: 94, color: "#F472B6" },
      { id: "sprint-planning", label: "Sprint Planning", hours: 68, color: "#F59E0B" },
      { id: "lead-followups", label: "Lead Follow-ups", hours: 56, color: "#818CF8" },
      { id: "bug-triage", label: "Bug Triage", hours: 42, color: "#34D399" },
      { id: "report-writing", label: "Report Writing", hours: 34, color: "#60A5FA" },
    ],
    workBlocks: [
      { label: "Deep Work", value: 40, color: "#6366F1" },
      { label: "Meetings", value: 25, color: "#F59E0B" },
      { label: "Code Review", value: 14, color: "#818CF8" },
      { label: "Documentation", value: 13, color: "#34D399" },
      { label: "Communication", value: 8, color: "#F472B6" },
    ],
    trend: [
      { day: "Wk 1", activities: 720, meetings: 145, docs: 28 },
      { day: "Wk 2", activities: 810, meetings: 132, docs: 35 },
      { day: "Wk 3", activities: 847, meetings: 154, docs: 41 },
      { day: "Wk 4", activities: 790, meetings: 128, docs: 32 },
    ],
  },
  ytd: {
    metrics: [
      {
        label: "Avg Focus Time",
        value: "3.9h",
        change: "+0.7h from last year",
        changeType: "up",
        description: "Average deep work per person per day",
      },
      {
        label: "Reports Completed",
        value: "312",
        change: "+24% vs last year",
        changeType: "up",
        description: "Reports finished year to date",
      },
      {
        label: "Avg Meeting Load",
        value: "2.1h",
        change: "-0.4h from last year",
        changeType: "down",
        description: "Average meeting time per person per day",
      },
      {
        label: "Support Tickets Resolved",
        value: "1,247",
        change: "+31% vs last year",
        changeType: "up",
        description: "Tickets closed year to date",
      },
    ],
    activityBreakdown: [
      { id: "technical-writing", label: "Technical Writing", hours: 1420, color: "#6366F1" },
      { id: "customer-support", label: "Customer Support", hours: 1180, color: "#F472B6" },
      { id: "sprint-planning", label: "Sprint Planning", hours: 840, color: "#F59E0B" },
      { id: "lead-followups", label: "Lead Follow-ups", hours: 720, color: "#818CF8" },
      { id: "bug-triage", label: "Bug Triage", hours: 510, color: "#34D399" },
      { id: "report-writing", label: "Report Writing", hours: 390, color: "#60A5FA" },
    ],
    workBlocks: [
      { label: "Deep Work", value: 39, color: "#6366F1" },
      { label: "Meetings", value: 26, color: "#F59E0B" },
      { label: "Code Review", value: 15, color: "#818CF8" },
      { label: "Documentation", value: 12, color: "#34D399" },
      { label: "Communication", value: 8, color: "#F472B6" },
    ],
    trend: [
      { day: "Jan", activities: 3100, meetings: 580, docs: 120 },
      { day: "Feb", activities: 2900, meetings: 540, docs: 105 },
      { day: "Mar", activities: 3400, meetings: 610, docs: 138 },
      { day: "Apr", activities: 3200, meetings: 560, docs: 125 },
      { day: "May", activities: 3500, meetings: 590, docs: 142 },
      { day: "Jun", activities: 3350, meetings: 570, docs: 130 },
    ],
  },
};

export function getDataByTimeRange(range: TimeRange): DashboardData {
  return dataByRange[range];
}

// ── Chat messages (sample conversation) ───────────────────────
export const sampleMessages: ChatMessage[] = [
  {
    id: "1",
    role: "assistant",
    content:
      "Welcome to your dashboard. I can help you understand trends, drill into any metric, or compare time periods. Click on any card or chart item to explore, or just ask me.",
    timestamp: "9:00 AM",
  },
  {
    id: "2",
    role: "user",
    content: "Why did focus time increase this week?",
    timestamp: "9:02 AM",
  },
  {
    id: "3",
    role: "assistant",
    content:
      "Average focus time is up 0.5h compared to last week (4.2h vs 3.7h). The main driver is a 30% reduction in recurring meetings — 3 weekly syncs were consolidated into one on Tuesday. Technical Writing and Report Writing both saw increases as a result. Wednesday had the highest focus time at 5.1h avg per person.",
    timestamp: "9:02 AM",
  },
];
