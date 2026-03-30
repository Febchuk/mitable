/**
 * Mock data for benchmarks UI development.
 * Used as placeholderData in React Query hooks so the UI renders
 * before the backend endpoints exist.
 *
 * Remove this file (and the placeholderData references) once the
 * backend is live.
 */

import type {
  Benchmark,
  BenchmarkDetail,
  MyBenchmark,
  MyBenchmarkDetail,
  PersonBenchmarkDetail,
} from "../../../services/benchmarkService";

// ── Admin: benchmark list ───────────────────────────────────

export const MOCK_BENCHMARKS: Benchmark[] = [
  {
    id: "bm-ai-adoption",
    organizationId: "org-1",
    name: "AI Adoption & Tool Usage",
    description:
      "How effectively employees leverage AI tools (Copilot, ChatGPT, Claude, Cursor) in their workflow. AI-assessed weekly.",
    category: "growth",
    metric: "score",
    targetValue: 4,
    unit: "score (1-5)",
    frequency: "weekly",
    isActive: true,
    assignedCount: 4,
    avgProgress: 72,
    trend: "improving",
    trendDelta: 8,
    createdAt: "2026-02-01T00:00:00Z",
    updatedAt: "2026-03-24T00:00:00Z",
  },
  {
    id: "bm-clear-comm",
    organizationId: "org-1",
    name: "Clear Communication",
    description:
      "Minutes spent on communication activities per week — Slack, email, status updates, standups, documentation sharing.",
    category: "collaboration",
    metric: "minutes",
    targetValue: 120,
    unit: "min/week",
    frequency: "weekly",
    isActive: true,
    assignedCount: 6,
    avgProgress: 80,
    trend: "stable",
    trendDelta: 0,
    createdAt: "2026-02-01T00:00:00Z",
    updatedAt: "2026-03-24T00:00:00Z",
  },
  {
    id: "bm-cross-collab",
    organizationId: "org-1",
    name: "Cross-functional Collaboration",
    description:
      "Percentage of work time spent collaborating with people outside your primary team.",
    category: "collaboration",
    metric: "percentage",
    targetValue: 30,
    unit: "%",
    frequency: "weekly",
    isActive: true,
    assignedCount: 5,
    avgProgress: 62,
    trend: "stable",
    trendDelta: 0,
    createdAt: "2026-02-01T00:00:00Z",
    updatedAt: "2026-03-24T00:00:00Z",
  },
  {
    id: "bm-mentorship",
    organizationId: "org-1",
    name: "Mentorship & Development",
    description:
      "Total minutes spent on mentorship activities per week — 1:1s, coaching, code review walkthroughs, pair programming.",
    category: "growth",
    metric: "minutes",
    targetValue: 30,
    unit: "min/week",
    frequency: "weekly",
    isActive: true,
    assignedCount: 3,
    avgProgress: 78,
    trend: "improving",
    trendDelta: 5,
    createdAt: "2026-02-01T00:00:00Z",
    updatedAt: "2026-03-24T00:00:00Z",
  },
  {
    id: "bm-proactive",
    organizationId: "org-1",
    name: "Proactive vs Reactive Work",
    description:
      "Ratio of planned, proactive work vs interrupt-driven, reactive work. AI-assessed from task patterns.",
    category: "quality",
    metric: "score",
    targetValue: 4,
    unit: "score (1-5)",
    frequency: "weekly",
    isActive: true,
    assignedCount: 4,
    avgProgress: 85,
    trend: "improving",
    trendDelta: 3,
    createdAt: "2026-02-01T00:00:00Z",
    updatedAt: "2026-03-24T00:00:00Z",
  },
  {
    id: "bm-deep-focus",
    organizationId: "org-1",
    name: "Deep Focus Work",
    description:
      "Average daily minutes of uninterrupted focus work (work time minus meeting time).",
    category: "productivity",
    metric: "minutes",
    targetValue: 120,
    unit: "min/day",
    frequency: "weekly",
    isActive: true,
    assignedCount: 5,
    avgProgress: 78,
    trend: "improving",
    trendDelta: 8,
    createdAt: "2026-02-01T00:00:00Z",
    updatedAt: "2026-03-24T00:00:00Z",
  },
  {
    id: "bm-meeting-eff",
    organizationId: "org-1",
    name: "Meeting Efficiency",
    description:
      "Meeting time as a percentage of total active time. Lower is better — target is under 30%.",
    category: "productivity",
    metric: "percentage",
    targetValue: 30,
    unit: "%",
    frequency: "weekly",
    isActive: true,
    assignedCount: 6,
    avgProgress: 88,
    trend: "stable",
    trendDelta: 0,
    createdAt: "2026-02-01T00:00:00Z",
    updatedAt: "2026-03-24T00:00:00Z",
  },
  {
    id: "bm-engagement",
    organizationId: "org-1",
    name: "Consistent Engagement",
    description:
      "Active working days per week (days with >30 minutes of tracked activity).",
    category: "productivity",
    metric: "count",
    targetValue: 5,
    unit: "days/week",
    frequency: "weekly",
    isActive: true,
    assignedCount: 8,
    avgProgress: 92,
    trend: "stable",
    trendDelta: 0,
    createdAt: "2026-02-01T00:00:00Z",
    updatedAt: "2026-03-24T00:00:00Z",
  },
  {
    id: "bm-work-life",
    organizationId: "org-1",
    name: "Work-Life Balance",
    description:
      "Average daily active hours — should fall within a healthy 6-9 hour range.",
    category: "quality",
    metric: "hours",
    targetValue: 7.5,
    unit: "hrs/day",
    frequency: "weekly",
    isActive: true,
    assignedCount: 8,
    avgProgress: 82,
    trend: "stable",
    trendDelta: 0,
    createdAt: "2026-02-01T00:00:00Z",
    updatedAt: "2026-03-24T00:00:00Z",
  },
];

// ── Admin: benchmark detail (Deep Focus Work) ───────────────

export const MOCK_BENCHMARK_DETAILS: Record<string, BenchmarkDetail> = {
  "bm-deep-focus": {
    ...MOCK_BENCHMARKS.find((b) => b.id === "bm-deep-focus")!,
    teamAverage: 78,
    improvingCount: 3,
    assignments: [
      {
        id: "a-1",
        benchmarkId: "bm-deep-focus",
        userId: "u-sarah",
        userName: "Sarah Chen",
        userEmail: "sarah@company.com",
        userAvatarUrl: null,
        currentValue: 116,
        targetValue: 120,
        progress: 97,
        percentile: "top_1",
        trend: "improving",
        trendDelta: 12,
        assignedAt: "2026-02-15T00:00:00Z",
      },
      {
        id: "a-2",
        benchmarkId: "bm-deep-focus",
        userId: "u-alex",
        userName: "Alex Kim",
        userEmail: "alex@company.com",
        userAvatarUrl: null,
        currentValue: 115,
        targetValue: 120,
        progress: 96,
        percentile: "top_10",
        trend: "improving",
        trendDelta: 5,
        assignedAt: "2026-02-15T00:00:00Z",
      },
      {
        id: "a-3",
        benchmarkId: "bm-deep-focus",
        userId: "u-jordan",
        userName: "Jordan Lee",
        userEmail: "jordan@company.com",
        userAvatarUrl: null,
        currentValue: 98,
        targetValue: 120,
        progress: 82,
        percentile: "top_25",
        trend: "improving",
        trendDelta: 3,
        assignedAt: "2026-02-15T00:00:00Z",
      },
      {
        id: "a-4",
        benchmarkId: "bm-deep-focus",
        userId: "u-pat",
        userName: "Pat Rivera",
        userEmail: "pat@company.com",
        userAvatarUrl: null,
        currentValue: 72,
        targetValue: 120,
        progress: 60,
        percentile: "top_50",
        trend: "stable",
        trendDelta: 0,
        assignedAt: "2026-02-15T00:00:00Z",
      },
      {
        id: "a-5",
        benchmarkId: "bm-deep-focus",
        userId: "u-sam",
        userName: "Sam Taylor",
        userEmail: "sam@company.com",
        userAvatarUrl: null,
        currentValue: 54,
        targetValue: 120,
        progress: 45,
        percentile: "bottom_half",
        trend: "improving",
        trendDelta: 8,
        assignedAt: "2026-03-01T00:00:00Z",
      },
    ],
  },
  "bm-ai-adoption": {
    ...MOCK_BENCHMARKS.find((b) => b.id === "bm-ai-adoption")!,
    teamAverage: 72,
    improvingCount: 3,
    assignments: [
      {
        id: "a-6",
        benchmarkId: "bm-ai-adoption",
        userId: "u-sarah",
        userName: "Sarah Chen",
        userEmail: "sarah@company.com",
        userAvatarUrl: null,
        currentValue: 3.8,
        targetValue: 4,
        progress: 95,
        percentile: "top_1",
        trend: "improving",
        trendDelta: 10,
        assignedAt: "2026-02-15T00:00:00Z",
      },
      {
        id: "a-7",
        benchmarkId: "bm-ai-adoption",
        userId: "u-alex",
        userName: "Alex Kim",
        userEmail: "alex@company.com",
        userAvatarUrl: null,
        currentValue: 3.6,
        targetValue: 4,
        progress: 72,
        percentile: "top_25",
        trend: "improving",
        trendDelta: 6,
        assignedAt: "2026-02-15T00:00:00Z",
      },
      {
        id: "a-8",
        benchmarkId: "bm-ai-adoption",
        userId: "u-jordan",
        userName: "Jordan Lee",
        userEmail: "jordan@company.com",
        userAvatarUrl: null,
        currentValue: 2.8,
        targetValue: 3,
        progress: 56,
        percentile: "top_50",
        trend: "stable",
        trendDelta: 0,
        assignedAt: "2026-02-15T00:00:00Z",
      },
      {
        id: "a-9",
        benchmarkId: "bm-ai-adoption",
        userId: "u-pat",
        userName: "Pat Rivera",
        userEmail: "pat@company.com",
        userAvatarUrl: null,
        currentValue: 2.5,
        targetValue: 4,
        progress: 50,
        percentile: "bottom_half",
        trend: "improving",
        trendDelta: 4,
        assignedAt: "2026-02-15T00:00:00Z",
      },
    ],
  },
};

// Build detail mocks for all benchmarks that don't have custom assignments
for (const bm of MOCK_BENCHMARKS) {
  if (!MOCK_BENCHMARK_DETAILS[bm.id]) {
    MOCK_BENCHMARK_DETAILS[bm.id] = {
      ...bm,
      teamAverage: bm.avgProgress,
      improvingCount: Math.ceil(bm.assignedCount * 0.5),
      assignments: [
        {
          id: `a-gen-${bm.id}-1`,
          benchmarkId: bm.id,
          userId: "u-sarah",
          userName: "Sarah Chen",
          userEmail: "sarah@company.com",
          userAvatarUrl: null,
          currentValue: bm.targetValue * 0.95,
          targetValue: bm.targetValue,
          progress: 95,
          percentile: "top_10",
          trend: "improving",
          trendDelta: 6,
          assignedAt: "2026-02-15T00:00:00Z",
        },
        {
          id: `a-gen-${bm.id}-2`,
          benchmarkId: bm.id,
          userId: "u-alex",
          userName: "Alex Kim",
          userEmail: "alex@company.com",
          userAvatarUrl: null,
          currentValue: bm.targetValue * 0.82,
          targetValue: bm.targetValue,
          progress: 82,
          percentile: "top_25",
          trend: "improving",
          trendDelta: 4,
          assignedAt: "2026-02-15T00:00:00Z",
        },
        {
          id: `a-gen-${bm.id}-3`,
          benchmarkId: bm.id,
          userId: "u-jordan",
          userName: "Jordan Lee",
          userEmail: "jordan@company.com",
          userAvatarUrl: null,
          currentValue: bm.targetValue * 0.6,
          targetValue: bm.targetValue,
          progress: 60,
          percentile: "top_50",
          trend: "stable",
          trendDelta: 0,
          assignedAt: "2026-02-15T00:00:00Z",
        },
      ],
    };
  }
}

// ── Employee: my benchmarks ─────────────────────────────────

export const MOCK_MY_BENCHMARKS: MyBenchmark[] = [
  {
    id: "mb-1",
    benchmarkId: "bm-deep-focus",
    name: "Deep Focus Work",
    description: "Average daily minutes of uninterrupted focus work.",
    category: "productivity",
    currentValue: 98,
    targetValue: 120,
    unit: "min/day",
    progress: 82,
    percentile: "top_10",
    trend: "improving",
    trendDelta: 12,
    frequency: "weekly",
    topAccomplishment: "3 deep focus sessions over 90 minutes this week",
  },
  {
    id: "mb-2",
    benchmarkId: "bm-cross-collab",
    name: "Cross-functional Collaboration",
    description: "Percentage of work time collaborating with other teams.",
    category: "collaboration",
    currentValue: 35,
    targetValue: 30,
    unit: "%",
    progress: 100,
    percentile: "top_1",
    trend: "improving",
    trendDelta: 5,
    frequency: "weekly",
    topAccomplishment: "Collaborated with Design, Backend, QA, and Product this week",
  },
  {
    id: "mb-3",
    benchmarkId: "bm-ai-adoption",
    name: "AI Adoption & Tool Usage",
    description: "How effectively you leverage AI tools in your workflow.",
    category: "growth",
    currentValue: 3.6,
    targetValue: 5,
    unit: "score (1-5)",
    progress: 72,
    percentile: "top_25",
    trend: "improving",
    trendDelta: 6,
    frequency: "weekly",
    topAccomplishment: "Used Copilot in 12 coding sessions this week",
  },
  {
    id: "mb-4",
    benchmarkId: "bm-mentorship",
    name: "Mentorship & Development",
    description: "Minutes of mentorship activities per week.",
    category: "growth",
    currentValue: 20,
    targetValue: 30,
    unit: "min/week",
    progress: 65,
    percentile: "top_50",
    trend: "improving",
    trendDelta: 10,
    frequency: "monthly",
    topAccomplishment: "Met with mentee 2x this month (up from 1x)",
  },
  {
    id: "mb-5",
    benchmarkId: "bm-work-life",
    name: "Work-Life Balance",
    description: "Average daily active hours in healthy 6-9 hour range.",
    category: "quality",
    currentValue: 7.2,
    targetValue: 7.5,
    unit: "hrs/day",
    progress: 85,
    percentile: "top_25",
    trend: "stable",
    trendDelta: 0,
    frequency: "weekly",
    topAccomplishment: "Healthy work hours all 5 days — no sessions past 6:30pm",
  },
];

// ── Employee: benchmark detail (Deep Focus Work) ────────────

function generateHistory(): { date: string; value: number; target: number }[] {
  const base = 60;
  return Array.from({ length: 8 }, (_, i) => ({
    date: new Date(2026, 1, 2 + i * 7).toISOString().slice(0, 10),
    value: Math.round(base + i * 6 + Math.random() * 8),
    target: 120,
  }));
}

export const MOCK_MY_BENCHMARK_DETAILS: Record<string, MyBenchmarkDetail> = {
  "bm-deep-focus": {
    ...MOCK_MY_BENCHMARKS.find((b) => b.benchmarkId === "bm-deep-focus")!,
    history: generateHistory(),
    suggestions: [
      {
        id: "s-1",
        text: "Block your calendar 9-11am daily — your data shows this is your peak focus window. A recurring block could add ~20 min of focus daily.",
        category: "scheduling",
      },
      {
        id: "s-2",
        text: 'Try "Do Not Disturb" during afternoon coding — you average 3 context switches between 2-4pm. Reducing interruptions could boost your afternoon focus.',
        category: "habits",
      },
      {
        id: "s-3",
        text: "You're close! Just 22 more min/day to hit target. At your current improvement rate, you'll reach 120 min/day in about 2-3 weeks.",
        category: "encouragement",
      },
    ],
    accomplishments: [
      { id: "ac-1", text: "3 deep focus sessions over 90 minutes", date: "2026-03-26" },
      {
        id: "ac-2",
        text: "Longest session: 2h 15m on Tuesday (VS Code, Figma)",
        date: "2026-03-25",
      },
      { id: "ac-3", text: "Focus time increased 12% week-over-week", date: "2026-03-24" },
      {
        id: "ac-4",
        text: "Most productive hours: 9am-11am consistently",
        date: "2026-03-24",
      },
    ],
  },
};

// Generate detail for other employee benchmarks
for (const mb of MOCK_MY_BENCHMARKS) {
  if (!MOCK_MY_BENCHMARK_DETAILS[mb.benchmarkId]) {
    MOCK_MY_BENCHMARK_DETAILS[mb.benchmarkId] = {
      ...mb,
      history: Array.from({ length: 8 }, (_, i) => ({
        date: new Date(2026, 1, 2 + i * 7).toISOString().slice(0, 10),
        value: Math.round(mb.currentValue * (0.6 + i * 0.05) + Math.random() * 3),
        target: mb.targetValue,
      })),
      suggestions: [
        {
          id: `s-${mb.benchmarkId}-1`,
          text: `You're making great progress on ${mb.name}. Keep up the momentum!`,
          category: "encouragement",
        },
      ],
      accomplishments: [
        {
          id: `ac-${mb.benchmarkId}-1`,
          text: mb.topAccomplishment || `Solid progress on ${mb.name} this period`,
          date: "2026-03-26",
        },
      ],
    };
  }
}

// ── Admin: person benchmark detail (generated from existing mocks) ──

export function getMockPersonBenchmarkDetail(
  benchmarkId: string,
  userId: string
): PersonBenchmarkDetail | null {
  const bmDetail = MOCK_BENCHMARK_DETAILS[benchmarkId];
  if (!bmDetail) return null;

  const assignment = bmDetail.assignments.find((a) => a.userId === userId);

  const bm = MOCK_BENCHMARKS.find((b) => b.id === benchmarkId);
  if (!bm) return null;

  // Use real assignment if found, otherwise generate synthetic data for any userId
  const progress = Math.min(100, assignment?.progress ?? Math.round(bm.avgProgress + (Math.random() * 20 - 10)));

  return {
    benchmarkId: bm.id,
    benchmarkName: bm.name,
    benchmarkDescription: bm.description,
    benchmarkCategory: bm.category,
    userId: assignment?.userId ?? userId,
    userName: assignment?.userName ?? "Team Member",
    userEmail: assignment?.userEmail ?? "",
    userAvatarUrl: assignment?.userAvatarUrl ?? null,
    currentValue: assignment?.currentValue ?? bm.targetValue * (progress / 100),
    targetValue: assignment?.targetValue ?? bm.targetValue,
    unit: bm.unit,
    progress,
    percentile: assignment?.percentile ?? (progress >= 80 ? "top_25" : "top_50"),
    trend: assignment?.trend ?? bm.trend,
    trendDelta: assignment?.trendDelta ?? bm.trendDelta,
    frequency: bm.frequency,
    history: Array.from({ length: 8 }, (_, i) => ({
      date: new Date(2026, 1, 2 + i * 7).toISOString().slice(0, 10),
      value: Math.min(100, Math.round(progress * (0.5 + i * 0.07) + Math.random() * 8)),
      target: 100,
    })),
    suggestions: [
      {
        id: `ps-${benchmarkId}-${userId}-1`,
        text: `${assignment?.userName ?? "This person"} is ${(assignment?.trend ?? bm.trend) === "improving" ? "on an upward trajectory" : "holding steady"} on ${bm.name}. ${progress >= 80 ? "Great work — keep it up!" : "A few more consistent weeks will make a big difference."}`,
        category: "encouragement",
      },
    ],
    accomplishments: [
      {
        id: `pa-${benchmarkId}-${userId}-1`,
        text: `Current score: ${Math.round(progress)}/100`,
        date: "2026-03-26",
      },
    ],
  };
}
