/**
 * Mock Data for CalendarView Prototype
 *
 * Simulates passive tracking data for the demo.
 */

import type { ActivityDay, WorkBlock, Capture } from "./types";

// Helper to create dates relative to today
function daysAgo(days: number, hours: number = 9, minutes: number = 0): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

// Generate mock captures for a work block
function generateCaptures(
  startTime: Date,
  count: number,
  apps: string[]
): Capture[] {
  const captures: Capture[] = [];
  let currentTime = new Date(startTime);

  for (let i = 0; i < count; i++) {
    const app = apps[Math.floor(Math.random() * apps.length)];
    captures.push({
      id: `capture-${Date.now()}-${i}`,
      timestamp: new Date(currentTime),
      appName: app,
      windowTitle: getWindowTitle(app),
      thumbnailUrl: undefined,
    });
    currentTime = addMinutes(currentTime, 0.5); // 30 second intervals
  }

  return captures;
}

function getWindowTitle(app: string): string {
  const titles: Record<string, string[]> = {
    "VS Code": [
      "index.tsx - mitable",
      "CalendarView.tsx - mitable",
      "types.ts - mitable",
      "README.md - mitable",
    ],
    Chrome: [
      "GitHub - Pull Requests",
      "Stack Overflow - React Hooks",
      "Notion - Sprint Planning",
      "Google Docs - Tech Spec",
    ],
    Slack: [
      "#engineering",
      "#general",
      "Direct Message - Sarah",
      "Thread: API Design",
    ],
    Figma: [
      "Calendar UI Mockups",
      "Component Library",
      "Dashboard Redesign",
      "Icons",
    ],
    Terminal: ["npm run dev", "git status", "docker logs", "ssh server"],
    Notion: [
      "Sprint Planning",
      "Tech Spec: Calendar Feature",
      "Team Wiki",
      "Meeting Notes",
    ],
  };

  const appTitles = titles[app] || [`${app} - Window`];
  return appTitles[Math.floor(Math.random() * appTitles.length)];
}

// Today's data - currently active
const todayMorningBlock: WorkBlock = {
  id: "wb-today-1",
  startTime: daysAgo(0, 9, 15),
  endTime: daysAgo(0, 11, 45),
  duration: 150,
  idleGapBefore: null, // First block of the day
  summary:
    "Morning focused coding session. Implemented CalendarView components and set up the routing. Reviewed PRs and responded to team feedback on Slack.",
  captures: generateCaptures(daysAgo(0, 9, 15), 300, [
    "VS Code",
    "Chrome",
    "Terminal",
  ]),
  appBreakdown: [
    { app: "VS Code", minutes: 95, percentage: 63 },
    { app: "Chrome", minutes: 35, percentage: 23 },
    { app: "Terminal", minutes: 20, percentage: 14 },
  ],
};

const todayAfternoonBlock: WorkBlock = {
  id: "wb-today-2",
  startTime: daysAgo(0, 13, 30),
  endTime: null, // Currently active
  duration: 85, // 1hr 25min so far
  idleGapBefore: 105, // Lunch break
  summary:
    "Continuing frontend work. Building the work block timeline component and integrating with mock data.",
  captures: generateCaptures(daysAgo(0, 13, 30), 170, [
    "VS Code",
    "Figma",
    "Chrome",
  ]),
  appBreakdown: [
    { app: "VS Code", minutes: 55, percentage: 65 },
    { app: "Figma", minutes: 20, percentage: 23 },
    { app: "Chrome", minutes: 10, percentage: 12 },
  ],
  isActive: true,
};

const today: ActivityDay = {
  id: "day-today",
  date: daysAgo(0, 0, 0),
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  totalWorkTime: 235, // 3hr 55min
  workBlocks: [todayMorningBlock, todayAfternoonBlock],
  summary:
    "Deep focus day on Calendar feature implementation. Morning sprint on component architecture, afternoon on UI polish and Figma review.",
  topApps: [
    { app: "VS Code", minutes: 150 },
    { app: "Chrome", minutes: 45 },
    { app: "Figma", minutes: 20 },
    { app: "Terminal", minutes: 20 },
  ],
};

// Yesterday's data
const yesterdayBlock1: WorkBlock = {
  id: "wb-yesterday-1",
  startTime: daysAgo(1, 9, 0),
  endTime: daysAgo(1, 12, 30),
  duration: 210,
  idleGapBefore: null,
  summary:
    "Sprint planning and technical design session. Drafted architecture for passive tracking system and reviewed monitoring service patterns.",
  captures: generateCaptures(daysAgo(1, 9, 0), 420, [
    "Notion",
    "Chrome",
    "Slack",
  ]),
  appBreakdown: [
    { app: "Notion", minutes: 90, percentage: 43 },
    { app: "Chrome", minutes: 70, percentage: 33 },
    { app: "Slack", minutes: 50, percentage: 24 },
  ],
};

const yesterdayBlock2: WorkBlock = {
  id: "wb-yesterday-2",
  startTime: daysAgo(1, 14, 0),
  endTime: daysAgo(1, 16, 15),
  duration: 135,
  idleGapBefore: 90, // Lunch
  summary:
    "Code review and refactoring session. Reviewed 3 PRs, cleaned up monitoring service types, and updated shared package.",
  captures: generateCaptures(daysAgo(1, 14, 0), 270, [
    "VS Code",
    "Chrome",
    "Terminal",
  ]),
  appBreakdown: [
    { app: "VS Code", minutes: 80, percentage: 59 },
    { app: "Chrome", minutes: 40, percentage: 30 },
    { app: "Terminal", minutes: 15, percentage: 11 },
  ],
};

const yesterdayBlock3: WorkBlock = {
  id: "wb-yesterday-3",
  startTime: daysAgo(1, 17, 0),
  endTime: daysAgo(1, 18, 30),
  duration: 90,
  idleGapBefore: 45, // Short break
  summary:
    "End of day wrap-up. Pushed final commits, updated Linear tickets, and wrote standup notes.",
  captures: generateCaptures(daysAgo(1, 17, 0), 180, [
    "VS Code",
    "Chrome",
    "Slack",
  ]),
  appBreakdown: [
    { app: "VS Code", minutes: 40, percentage: 44 },
    { app: "Chrome", minutes: 30, percentage: 33 },
    { app: "Slack", minutes: 20, percentage: 22 },
  ],
};

const yesterday: ActivityDay = {
  id: "day-yesterday",
  date: daysAgo(1, 0, 0),
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  totalWorkTime: 435, // 7hr 15min
  workBlocks: [yesterdayBlock1, yesterdayBlock2, yesterdayBlock3],
  summary:
    "Productive planning and review day. Morning focused on sprint planning and architecture, afternoon on code review and cleanup.",
  topApps: [
    { app: "VS Code", minutes: 120 },
    { app: "Notion", minutes: 90 },
    { app: "Chrome", minutes: 140 },
    { app: "Slack", minutes: 70 },
    { app: "Terminal", minutes: 15 },
  ],
};

// Two days ago
const twoDaysAgoBlock1: WorkBlock = {
  id: "wb-2days-1",
  startTime: daysAgo(2, 10, 30),
  endTime: daysAgo(2, 13, 0),
  duration: 150,
  idleGapBefore: null,
  summary:
    "Backend development sprint. Implemented new API endpoints for tracking service and wrote integration tests.",
  captures: generateCaptures(daysAgo(2, 10, 30), 300, [
    "VS Code",
    "Terminal",
    "Chrome",
  ]),
  appBreakdown: [
    { app: "VS Code", minutes: 100, percentage: 67 },
    { app: "Terminal", minutes: 35, percentage: 23 },
    { app: "Chrome", minutes: 15, percentage: 10 },
  ],
};

const twoDaysAgoBlock2: WorkBlock = {
  id: "wb-2days-2",
  startTime: daysAgo(2, 15, 0),
  endTime: daysAgo(2, 17, 45),
  duration: 165,
  idleGapBefore: 120, // Long lunch
  summary:
    "Design sync and Figma work. Collaborated with design team on calendar UI, created component specs.",
  captures: generateCaptures(daysAgo(2, 15, 0), 330, [
    "Figma",
    "Slack",
    "Chrome",
  ]),
  appBreakdown: [
    { app: "Figma", minutes: 100, percentage: 61 },
    { app: "Slack", minutes: 40, percentage: 24 },
    { app: "Chrome", minutes: 25, percentage: 15 },
  ],
};

const twoDaysAgo: ActivityDay = {
  id: "day-2days",
  date: daysAgo(2, 0, 0),
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  totalWorkTime: 315, // 5hr 15min
  workBlocks: [twoDaysAgoBlock1, twoDaysAgoBlock2],
  summary:
    "Mixed development and design day. Morning backend work, afternoon design collaboration with the team.",
  topApps: [
    { app: "VS Code", minutes: 100 },
    { app: "Figma", minutes: 100 },
    { app: "Slack", minutes: 40 },
    { app: "Terminal", minutes: 35 },
    { app: "Chrome", minutes: 40 },
  ],
};

// Three days ago
const threeDaysAgo: ActivityDay = {
  id: "day-3days",
  date: daysAgo(3, 0, 0),
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  totalWorkTime: 380, // 6hr 20min
  workBlocks: [
    {
      id: "wb-3days-1",
      startTime: daysAgo(3, 9, 0),
      endTime: daysAgo(3, 12, 0),
      duration: 180,
      idleGapBefore: null,
      summary: "Morning standup and feature development. Started passive monitoring implementation.",
      captures: generateCaptures(daysAgo(3, 9, 0), 360, ["VS Code", "Slack", "Chrome"]),
      appBreakdown: [
        { app: "VS Code", minutes: 120, percentage: 67 },
        { app: "Slack", minutes: 35, percentage: 19 },
        { app: "Chrome", minutes: 25, percentage: 14 },
      ],
    },
    {
      id: "wb-3days-2",
      startTime: daysAgo(3, 14, 0),
      endTime: daysAgo(3, 17, 20),
      duration: 200,
      idleGapBefore: 120,
      summary: "Continued implementation and documentation. Updated technical spec and created diagrams.",
      captures: generateCaptures(daysAgo(3, 14, 0), 400, ["VS Code", "Notion", "Chrome"]),
      appBreakdown: [
        { app: "VS Code", minutes: 110, percentage: 55 },
        { app: "Notion", minutes: 60, percentage: 30 },
        { app: "Chrome", minutes: 30, percentage: 15 },
      ],
    },
  ],
  summary: "Feature development day focused on passive monitoring system. Good progress on architecture.",
  topApps: [
    { app: "VS Code", minutes: 230 },
    { app: "Notion", minutes: 60 },
    { app: "Chrome", minutes: 55 },
    { app: "Slack", minutes: 35 },
  ],
};

// Four days ago (lighter day)
const fourDaysAgo: ActivityDay = {
  id: "day-4days",
  date: daysAgo(4, 0, 0),
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  totalWorkTime: 180, // 3hr (light day)
  workBlocks: [
    {
      id: "wb-4days-1",
      startTime: daysAgo(4, 10, 0),
      endTime: daysAgo(4, 13, 0),
      duration: 180,
      idleGapBefore: null,
      summary: "Half day - meetings and planning. Team sync, 1:1s, and roadmap review.",
      captures: generateCaptures(daysAgo(4, 10, 0), 360, ["Slack", "Chrome", "Notion"]),
      appBreakdown: [
        { app: "Slack", minutes: 80, percentage: 44 },
        { app: "Chrome", minutes: 60, percentage: 33 },
        { app: "Notion", minutes: 40, percentage: 22 },
      ],
    },
  ],
  summary: "Light meeting-focused day. Team sync and planning sessions.",
  topApps: [
    { app: "Slack", minutes: 80 },
    { app: "Chrome", minutes: 60 },
    { app: "Notion", minutes: 40 },
  ],
};

// Five days ago
const fiveDaysAgo: ActivityDay = {
  id: "day-5days",
  date: daysAgo(5, 0, 0),
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  totalWorkTime: 420, // 7hr
  workBlocks: [
    {
      id: "wb-5days-1",
      startTime: daysAgo(5, 8, 30),
      endTime: daysAgo(5, 12, 30),
      duration: 240,
      idleGapBefore: null,
      summary: "Deep work morning. Major refactoring of session capture service.",
      captures: generateCaptures(daysAgo(5, 8, 30), 480, ["VS Code", "Terminal"]),
      appBreakdown: [
        { app: "VS Code", minutes: 190, percentage: 79 },
        { app: "Terminal", minutes: 50, percentage: 21 },
      ],
    },
    {
      id: "wb-5days-2",
      startTime: daysAgo(5, 14, 0),
      endTime: daysAgo(5, 17, 0),
      duration: 180,
      idleGapBefore: 90,
      summary: "Afternoon testing and documentation. Wrote unit tests and updated README.",
      captures: generateCaptures(daysAgo(5, 14, 0), 360, ["VS Code", "Chrome", "Terminal"]),
      appBreakdown: [
        { app: "VS Code", minutes: 120, percentage: 67 },
        { app: "Chrome", minutes: 40, percentage: 22 },
        { app: "Terminal", minutes: 20, percentage: 11 },
      ],
    },
  ],
  summary: "Intense development day. Major refactoring completed with comprehensive test coverage.",
  topApps: [
    { app: "VS Code", minutes: 310 },
    { app: "Terminal", minutes: 70 },
    { app: "Chrome", minutes: 40 },
  ],
};

// Six days ago
const sixDaysAgo: ActivityDay = {
  id: "day-6days",
  date: daysAgo(6, 0, 0),
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  totalWorkTime: 360, // 6hr
  workBlocks: [
    {
      id: "wb-6days-1",
      startTime: daysAgo(6, 9, 0),
      endTime: daysAgo(6, 12, 0),
      duration: 180,
      idleGapBefore: null,
      summary: "Morning code review marathon. Reviewed and merged 5 PRs.",
      captures: generateCaptures(daysAgo(6, 9, 0), 360, ["Chrome", "VS Code", "Slack"]),
      appBreakdown: [
        { app: "Chrome", minutes: 90, percentage: 50 },
        { app: "VS Code", minutes: 60, percentage: 33 },
        { app: "Slack", minutes: 30, percentage: 17 },
      ],
    },
    {
      id: "wb-6days-2",
      startTime: daysAgo(6, 14, 0),
      endTime: daysAgo(6, 17, 0),
      duration: 180,
      idleGapBefore: 120,
      summary: "Bug fixes and hotfix deployment. Fixed production issues and monitored rollout.",
      captures: generateCaptures(daysAgo(6, 14, 0), 360, ["VS Code", "Terminal", "Chrome"]),
      appBreakdown: [
        { app: "VS Code", minutes: 100, percentage: 56 },
        { app: "Terminal", minutes: 50, percentage: 28 },
        { app: "Chrome", minutes: 30, percentage: 16 },
      ],
    },
  ],
  summary: "Maintenance day focused on code review and bug fixes. Successful hotfix deployment.",
  topApps: [
    { app: "VS Code", minutes: 160 },
    { app: "Chrome", minutes: 120 },
    { app: "Terminal", minutes: 50 },
    { app: "Slack", minutes: 30 },
  ],
};

export const mockDays: ActivityDay[] = [
  today,
  yesterday,
  twoDaysAgo,
  threeDaysAgo,
  fourDaysAgo,
  fiveDaysAgo,
  sixDaysAgo,
];

export function getMockDayByDate(date: Date): ActivityDay | undefined {
  return mockDays.find((day) => {
    const dayDate = new Date(day.date);
    return (
      dayDate.getFullYear() === date.getFullYear() &&
      dayDate.getMonth() === date.getMonth() &&
      dayDate.getDate() === date.getDate()
    );
  });
}

export function getMockWeekDays(weekStart: Date): ActivityDay[] {
  const days: ActivityDay[] = [];
  const current = new Date(weekStart);

  for (let i = 0; i < 7; i++) {
    const existingDay = getMockDayByDate(current);
    if (existingDay) {
      days.push(existingDay);
    } else {
      // Create empty day placeholder
      days.push({
        id: `day-empty-${current.toISOString()}`,
        date: new Date(current),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        totalWorkTime: 0,
        workBlocks: [],
        summary: "",
        topApps: [],
      });
    }
    current.setDate(current.getDate() + 1);
  }

  return days;
}
