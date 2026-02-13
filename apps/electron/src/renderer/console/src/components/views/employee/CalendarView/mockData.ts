/**
 * Mock Data for CalendarView Prototype
 *
 * Simulates passive tracking data with rich activity details.
 */

import type { ActivityDay, WorkBlock, Capture, ActivityType } from "./types";

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

// Activity type mapping
const appActivityTypes: Record<string, ActivityType> = {
  "VS Code": "coding",
  Chrome: "browsing",
  Slack: "communicating",
  Figma: "designing",
  Terminal: "terminal",
  Notion: "writing",
  Safari: "browsing",
  Discord: "communicating",
};

// Rich activity descriptions based on app + window
interface ActivityTemplate {
  descriptions: string[];
  documents: string[];
  projects: string[];
}

const activityTemplates: Record<string, ActivityTemplate> = {
  "VS Code": {
    descriptions: [
      "Editing React component - adding state management",
      "Writing TypeScript interface definitions",
      "Refactoring function to improve performance",
      "Adding JSDoc comments for documentation",
      "Fixing TypeScript type errors",
      "Implementing new feature logic",
      "Reviewing and cleaning up imports",
      "Adding error handling to async function",
      "Creating new utility helper function",
      "Updating component props interface",
    ],
    documents: [
      "CalendarView/index.tsx",
      "CaptureTimeline.tsx",
      "WorkBlockDetail.tsx",
      "types.ts",
      "mockData.ts",
      "monitoringService.ts",
      "passiveTrackingService.ts",
      "idleDetectionService.ts",
    ],
    projects: ["mitable/apps/electron", "mitable/apps/backend", "mitable/packages/shared"],
  },
  Chrome: {
    descriptions: [
      "Researching React hooks best practices",
      "Reading GitHub PR comments and feedback",
      "Checking Stack Overflow for TypeScript solution",
      "Reviewing Tailwind CSS documentation",
      "Looking up Electron API documentation",
      "Reading technical blog post on state management",
      "Comparing different implementation approaches",
      "Checking npm package documentation",
    ],
    documents: [
      "GitHub - PR #142 Review",
      "Stack Overflow - useEffect cleanup",
      "MDN Web Docs - Date formatting",
      "Tailwind CSS - Flexbox utilities",
      "React Docs - Context API",
    ],
    projects: [],
  },
  Slack: {
    descriptions: [
      "Discussing implementation approach with team",
      "Responding to code review feedback",
      "Asking clarifying question about requirements",
      "Sharing progress update in #engineering",
      "Reviewing thread about API design",
      "Coordinating with designer on UI changes",
      "Answering question from teammate",
    ],
    documents: [
      "#engineering channel",
      "#frontend channel",
      "DM with Sarah (design sync)",
      "Thread: Calendar feature discussion",
      "DM with Alex (code review)",
    ],
    projects: [],
  },
  Figma: {
    descriptions: [
      "Reviewing calendar UI mockups",
      "Inspecting component spacing and layout",
      "Checking color tokens for dark mode",
      "Copying icon assets for implementation",
      "Comparing design variants",
      "Measuring padding and margin values",
      "Reviewing responsive breakpoints",
    ],
    documents: [
      "Calendar Feature - Final Designs",
      "Component Library v2",
      "Activity Timeline Mockups",
      "Work Block Cards",
    ],
    projects: ["Mitable Design System"],
  },
  Terminal: {
    descriptions: [
      "Running development server",
      "Checking git status and diff",
      "Installing npm dependencies",
      "Running TypeScript compiler",
      "Checking Docker container logs",
      "Running test suite",
      "Creating git commit",
      "Pulling latest changes from main",
    ],
    documents: ["npm run dev", "git status", "git diff", "npm test", "docker logs"],
    projects: ["mitable"],
  },
  Notion: {
    descriptions: [
      "Writing technical specification",
      "Updating sprint planning notes",
      "Documenting API endpoint design",
      "Adding implementation notes",
      "Reviewing team wiki documentation",
      "Writing meeting notes",
      "Updating project roadmap",
    ],
    documents: [
      "Calendar Feature Tech Spec",
      "Sprint 24 Planning",
      "API Design Notes",
      "Team Wiki - Architecture",
      "Meeting Notes - Design Review",
    ],
    projects: ["Mitable Documentation"],
  },
};

// Generate rich captures with activity flow
function generateRichCaptures(
  startTime: Date,
  durationMinutes: number,
  _apps: string[], // Kept for API compatibility, flow determined by scenario
  scenario: "coding" | "review" | "design" | "planning"
): Capture[] {
  const captures: Capture[] = [];
  let currentTime = new Date(startTime);
  const endTime = addMinutes(startTime, durationMinutes);
  let captureIndex = 0;
  let lastApp = "";

  // Define activity flows for different scenarios
  const activityFlows: Record<string, { app: string; duration: number }[]> = {
    coding: [
      { app: "VS Code", duration: 8 },
      { app: "Chrome", duration: 2 },
      { app: "VS Code", duration: 12 },
      { app: "Terminal", duration: 1 },
      { app: "VS Code", duration: 10 },
      { app: "Slack", duration: 2 },
      { app: "VS Code", duration: 15 },
      { app: "Chrome", duration: 3 },
      { app: "VS Code", duration: 8 },
    ],
    review: [
      { app: "Chrome", duration: 5 },
      { app: "VS Code", duration: 8 },
      { app: "Chrome", duration: 4 },
      { app: "Slack", duration: 3 },
      { app: "VS Code", duration: 6 },
      { app: "Chrome", duration: 5 },
    ],
    design: [
      { app: "Figma", duration: 10 },
      { app: "VS Code", duration: 5 },
      { app: "Figma", duration: 8 },
      { app: "Slack", duration: 2 },
      { app: "Chrome", duration: 3 },
      { app: "Figma", duration: 12 },
    ],
    planning: [
      { app: "Notion", duration: 15 },
      { app: "Slack", duration: 5 },
      { app: "Chrome", duration: 4 },
      { app: "Notion", duration: 10 },
      { app: "Slack", duration: 3 },
    ],
  };

  const flow = activityFlows[scenario];
  let flowIndex = 0;
  let flowRemaining = flow[0].duration;

  while (currentTime < endTime) {
    const currentFlow = flow[flowIndex % flow.length];
    const app = currentFlow.app;
    const template = activityTemplates[app] || activityTemplates["Chrome"];

    const isSwitch = lastApp !== "" && lastApp !== app;
    const description =
      template.descriptions[Math.floor(Math.random() * template.descriptions.length)];
    const document = template.documents[Math.floor(Math.random() * template.documents.length)];
    const project =
      template.projects.length > 0
        ? template.projects[Math.floor(Math.random() * template.projects.length)]
        : undefined;

    captures.push({
      id: `capture-${Date.now()}-${captureIndex}`,
      timestamp: new Date(currentTime),
      appName: app,
      windowTitle: document,
      activityType: appActivityTypes[app] || "other",
      activityDescription: description,
      documentName: document,
      projectContext: project,
      isContextSwitch: isSwitch,
      switchedFrom: isSwitch ? lastApp : undefined,
    });

    lastApp = app;
    captureIndex++;

    // Move time forward (30 second intervals)
    currentTime = addMinutes(currentTime, 0.5);

    // Track flow progress
    flowRemaining -= 0.5;
    if (flowRemaining <= 0) {
      flowIndex++;
      if (flowIndex < flow.length) {
        flowRemaining = flow[flowIndex].duration;
      } else {
        flowIndex = 0;
        flowRemaining = flow[0].duration;
      }
    }
  }

  return captures;
}

// Today's data - currently active
const todayMorningBlock: WorkBlock = {
  id: "wb-today-1",
  startTime: daysAgo(0, 9, 15),
  endTime: daysAgo(0, 11, 45),
  duration: 150,
  idleGapBefore: null,
  summary:
    "Morning focused coding session. Implemented CalendarView components and set up the routing. Reviewed PRs and responded to team feedback on Slack.",
  captures: generateRichCaptures(daysAgo(0, 9, 15), 150, ["VS Code", "Chrome", "Terminal"], "coding"),
  appBreakdown: [
    { app: "VS Code", minutes: 95, percentage: 63 },
    { app: "Chrome", minutes: 35, percentage: 23 },
    { app: "Terminal", minutes: 20, percentage: 14 },
  ],
  status: "ended",
};

const todayAfternoonBlock: WorkBlock = {
  id: "wb-today-2",
  startTime: daysAgo(0, 13, 30),
  endTime: null,
  duration: 85,
  idleGapBefore: 105,
  summary:
    "Continuing frontend work. Building the work block timeline component and integrating with mock data.",
  captures: generateRichCaptures(daysAgo(0, 13, 30), 85, ["VS Code", "Figma", "Chrome"], "design"),
  appBreakdown: [
    { app: "VS Code", minutes: 55, percentage: 65 },
    { app: "Figma", minutes: 20, percentage: 23 },
    { app: "Chrome", minutes: 10, percentage: 12 },
  ],
  isActive: true,
  isFocusedSession: true,
  goal: "Complete CalendarView prototype UI",
  status: "active",
};

const today: ActivityDay = {
  id: "day-today",
  date: daysAgo(0, 0, 0),
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  totalWorkTime: 235,
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
  captures: generateRichCaptures(daysAgo(1, 9, 0), 210, ["Notion", "Chrome", "Slack"], "planning"),
  appBreakdown: [
    { app: "Notion", minutes: 90, percentage: 43 },
    { app: "Chrome", minutes: 70, percentage: 33 },
    { app: "Slack", minutes: 50, percentage: 24 },
  ],
  status: "ended",
};

const yesterdayBlock2: WorkBlock = {
  id: "wb-yesterday-2",
  startTime: daysAgo(1, 14, 0),
  endTime: daysAgo(1, 16, 15),
  duration: 135,
  idleGapBefore: 90,
  summary:
    "Code review and refactoring session. Reviewed 3 PRs, cleaned up monitoring service types, and updated shared package.",
  captures: generateRichCaptures(daysAgo(1, 14, 0), 135, ["VS Code", "Chrome", "Terminal"], "review"),
  appBreakdown: [
    { app: "VS Code", minutes: 80, percentage: 59 },
    { app: "Chrome", minutes: 40, percentage: 30 },
    { app: "Terminal", minutes: 15, percentage: 11 },
  ],
  isFocusedSession: true,
  goal: "Complete PR reviews for Sprint 23",
  status: "ended",
};

const yesterdayBlock3: WorkBlock = {
  id: "wb-yesterday-3",
  startTime: daysAgo(1, 17, 0),
  endTime: daysAgo(1, 18, 30),
  duration: 90,
  idleGapBefore: 45,
  summary:
    "End of day wrap-up. Pushed final commits, updated Linear tickets, and wrote standup notes.",
  captures: generateRichCaptures(daysAgo(1, 17, 0), 90, ["VS Code", "Chrome", "Slack"], "coding"),
  appBreakdown: [
    { app: "VS Code", minutes: 40, percentage: 44 },
    { app: "Chrome", minutes: 30, percentage: 33 },
    { app: "Slack", minutes: 20, percentage: 22 },
  ],
  status: "ended",
};

const yesterday: ActivityDay = {
  id: "day-yesterday",
  date: daysAgo(1, 0, 0),
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  totalWorkTime: 435,
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
  captures: generateRichCaptures(daysAgo(2, 10, 30), 150, ["VS Code", "Terminal", "Chrome"], "coding"),
  appBreakdown: [
    { app: "VS Code", minutes: 100, percentage: 67 },
    { app: "Terminal", minutes: 35, percentage: 23 },
    { app: "Chrome", minutes: 15, percentage: 10 },
  ],
  status: "ended",
};

const twoDaysAgoBlock2: WorkBlock = {
  id: "wb-2days-2",
  startTime: daysAgo(2, 15, 0),
  endTime: daysAgo(2, 17, 45),
  duration: 165,
  idleGapBefore: 120,
  summary:
    "Design sync and Figma work. Collaborated with design team on calendar UI, created component specs.",
  captures: generateRichCaptures(daysAgo(2, 15, 0), 165, ["Figma", "Slack", "Chrome"], "design"),
  appBreakdown: [
    { app: "Figma", minutes: 100, percentage: 61 },
    { app: "Slack", minutes: 40, percentage: 24 },
    { app: "Chrome", minutes: 25, percentage: 15 },
  ],
  status: "ended",
};

const twoDaysAgo: ActivityDay = {
  id: "day-2days",
  date: daysAgo(2, 0, 0),
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  totalWorkTime: 315,
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
  totalWorkTime: 380,
  workBlocks: [
    {
      id: "wb-3days-1",
      startTime: daysAgo(3, 9, 0),
      endTime: daysAgo(3, 12, 0),
      duration: 180,
      idleGapBefore: null,
      summary:
        "Morning standup and feature development. Started passive monitoring implementation.",
      captures: generateRichCaptures(daysAgo(3, 9, 0), 180, ["VS Code", "Slack", "Chrome"], "coding"),
      appBreakdown: [
        { app: "VS Code", minutes: 120, percentage: 67 },
        { app: "Slack", minutes: 35, percentage: 19 },
        { app: "Chrome", minutes: 25, percentage: 14 },
      ],
      status: "ended",
    },
    {
      id: "wb-3days-2",
      startTime: daysAgo(3, 14, 0),
      endTime: daysAgo(3, 17, 20),
      duration: 200,
      idleGapBefore: 120,
      summary:
        "Continued implementation and documentation. Updated technical spec and created diagrams.",
      captures: generateRichCaptures(daysAgo(3, 14, 0), 200, ["VS Code", "Notion", "Chrome"], "planning"),
      appBreakdown: [
        { app: "VS Code", minutes: 110, percentage: 55 },
        { app: "Notion", minutes: 60, percentage: 30 },
        { app: "Chrome", minutes: 30, percentage: 15 },
      ],
      status: "ended",
    },
  ],
  summary:
    "Feature development day focused on passive monitoring system. Good progress on architecture.",
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
  totalWorkTime: 180,
  workBlocks: [
    {
      id: "wb-4days-1",
      startTime: daysAgo(4, 10, 0),
      endTime: daysAgo(4, 13, 0),
      duration: 180,
      idleGapBefore: null,
      summary: "Half day - meetings and planning. Team sync, 1:1s, and roadmap review.",
      captures: generateRichCaptures(daysAgo(4, 10, 0), 180, ["Slack", "Chrome", "Notion"], "planning"),
      appBreakdown: [
        { app: "Slack", minutes: 80, percentage: 44 },
        { app: "Chrome", minutes: 60, percentage: 33 },
        { app: "Notion", minutes: 40, percentage: 22 },
      ],
      status: "ended",
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
  totalWorkTime: 420,
  workBlocks: [
    {
      id: "wb-5days-1",
      startTime: daysAgo(5, 8, 30),
      endTime: daysAgo(5, 12, 30),
      duration: 240,
      idleGapBefore: null,
      summary: "Deep work morning. Major refactoring of session capture service.",
      captures: generateRichCaptures(daysAgo(5, 8, 30), 240, ["VS Code", "Terminal"], "coding"),
      appBreakdown: [
        { app: "VS Code", minutes: 190, percentage: 79 },
        { app: "Terminal", minutes: 50, percentage: 21 },
      ],
      isFocusedSession: true,
      goal: "Refactor captureService for passive tracking",
      status: "ended",
    },
    {
      id: "wb-5days-2",
      startTime: daysAgo(5, 14, 0),
      endTime: daysAgo(5, 17, 0),
      duration: 180,
      idleGapBefore: 90,
      summary: "Afternoon testing and documentation. Wrote unit tests and updated README.",
      captures: generateRichCaptures(daysAgo(5, 14, 0), 180, ["VS Code", "Chrome", "Terminal"], "coding"),
      appBreakdown: [
        { app: "VS Code", minutes: 120, percentage: 67 },
        { app: "Chrome", minutes: 40, percentage: 22 },
        { app: "Terminal", minutes: 20, percentage: 11 },
      ],
      status: "ended",
    },
  ],
  summary:
    "Intense development day. Major refactoring completed with comprehensive test coverage.",
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
  totalWorkTime: 360,
  workBlocks: [
    {
      id: "wb-6days-1",
      startTime: daysAgo(6, 9, 0),
      endTime: daysAgo(6, 12, 0),
      duration: 180,
      idleGapBefore: null,
      summary: "Morning code review marathon. Reviewed and merged 5 PRs.",
      captures: generateRichCaptures(daysAgo(6, 9, 0), 180, ["Chrome", "VS Code", "Slack"], "review"),
      appBreakdown: [
        { app: "Chrome", minutes: 90, percentage: 50 },
        { app: "VS Code", minutes: 60, percentage: 33 },
        { app: "Slack", minutes: 30, percentage: 17 },
      ],
      status: "ended",
    },
    {
      id: "wb-6days-2",
      startTime: daysAgo(6, 14, 0),
      endTime: daysAgo(6, 17, 0),
      duration: 180,
      idleGapBefore: 120,
      summary:
        "Bug fixes and hotfix deployment. Fixed production issues and monitored rollout.",
      captures: generateRichCaptures(daysAgo(6, 14, 0), 180, ["VS Code", "Terminal", "Chrome"], "coding"),
      appBreakdown: [
        { app: "VS Code", minutes: 100, percentage: 56 },
        { app: "Terminal", minutes: 50, percentage: 28 },
        { app: "Chrome", minutes: 30, percentage: 16 },
      ],
      status: "ended",
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
