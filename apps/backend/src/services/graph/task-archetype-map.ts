/**
 * Task Archetype Map
 *
 * Pure configuration — deterministic mapping rules for normalizing
 * raw activity descriptions into canonical task archetypes.
 * Zero runtime imports.
 */

export interface ArchetypeRule {
  archetypeKey: string;
  displayName: string;
  domainKey: string;
  keywords: string[];
  categoryAliases: string[];
}

export const ARCHETYPE_RULES: ArchetypeRule[] = [
  {
    archetypeKey: "code_authoring",
    displayName: "Code Authoring",
    domainKey: "engineering",
    keywords: [
      "writing code", "coding", "implementing", "developing", "programming",
      "editing source", "code editor", "writing function", "writing class",
      "refactoring", "typing code", "source code",
    ],
    categoryAliases: ["development", "coding"],
  },
  {
    archetypeKey: "code_review",
    displayName: "Code Review",
    domainKey: "engineering",
    keywords: [
      "code review", "pull request", "reviewing code", "PR review",
      "merge request", "reviewing changes", "diff review",
    ],
    categoryAliases: ["review"],
  },
  {
    archetypeKey: "debugging",
    displayName: "Debugging",
    domainKey: "engineering",
    keywords: [
      "debugging", "troubleshooting", "investigating bug", "fixing error",
      "stack trace", "breakpoint", "console error", "log analysis",
      "error investigation",
    ],
    categoryAliases: [],
  },
  {
    archetypeKey: "testing",
    displayName: "Testing",
    domainKey: "engineering",
    keywords: [
      "running tests", "writing tests", "test suite", "unit test",
      "integration test", "test case", "test coverage", "testing",
    ],
    categoryAliases: [],
  },
  {
    archetypeKey: "deployment",
    displayName: "Deployment",
    domainKey: "engineering",
    keywords: [
      "deploying", "deployment", "CI/CD", "pipeline", "build process",
      "staging", "production release", "docker", "kubernetes",
    ],
    categoryAliases: [],
  },
  {
    archetypeKey: "messaging",
    displayName: "Messaging",
    domainKey: "communication",
    keywords: [
      "slack", "teams message", "discord", "chat message", "instant message",
      "direct message", "channel message", "sending message",
    ],
    categoryAliases: ["communication"],
  },
  {
    archetypeKey: "email",
    displayName: "Email",
    domainKey: "communication",
    keywords: [
      "email", "inbox", "composing email", "reading email", "gmail",
      "outlook mail", "mail client", "reply email",
    ],
    categoryAliases: [],
  },
  {
    archetypeKey: "meeting",
    displayName: "Meeting",
    domainKey: "collaboration",
    keywords: [
      "meeting", "video call", "zoom", "google meet", "standup",
      "huddle", "conference call", "screen share meeting",
    ],
    categoryAliases: ["meeting"],
  },
  {
    archetypeKey: "research",
    displayName: "Research",
    domainKey: "knowledge",
    keywords: [
      "researching", "reading documentation", "browsing docs", "stackoverflow",
      "searching for", "looking up", "reading article", "studying",
      "exploring api", "reading reference",
    ],
    categoryAliases: ["research"],
  },
  {
    archetypeKey: "design",
    displayName: "Design",
    domainKey: "creative",
    keywords: [
      "figma", "design file", "mockup", "wireframe", "prototype",
      "sketch", "ui design", "ux design", "layout design", "designing",
    ],
    categoryAliases: ["design"],
  },
  {
    archetypeKey: "documentation",
    displayName: "Documentation",
    domainKey: "knowledge",
    keywords: [
      "writing docs", "documentation", "readme", "wiki", "confluence",
      "notion page", "technical writing", "api docs", "writing specification",
    ],
    categoryAliases: [],
  },
  {
    archetypeKey: "project_management",
    displayName: "Project Management",
    domainKey: "management",
    keywords: [
      "jira", "linear", "asana", "trello", "task board", "sprint planning",
      "backlog", "ticket", "issue tracking", "project board", "kanban",
    ],
    categoryAliases: [],
  },
  {
    archetypeKey: "data_analysis",
    displayName: "Data Analysis",
    domainKey: "analytics",
    keywords: [
      "spreadsheet", "excel", "google sheets", "data analysis", "dashboard",
      "analytics", "chart", "visualization", "sql query", "database query",
      "jupyter", "notebook",
    ],
    categoryAliases: [],
  },
];

export const APP_NAME_ALIASES: Record<string, string> = {
  "google chrome": "Chrome",
  chrome: "Chrome",
  "chromium": "Chrome",
  "microsoft edge": "Edge",
  firefox: "Firefox",
  "mozilla firefox": "Firefox",
  safari: "Safari",
  "visual studio code": "VS Code",
  "code": "VS Code",
  "code - insiders": "VS Code",
  vscode: "VS Code",
  "intellij idea": "IntelliJ",
  webstorm: "WebStorm",
  "sublime text": "Sublime Text",
  iterm2: "Terminal",
  iterm: "Terminal",
  terminal: "Terminal",
  "windows terminal": "Terminal",
  "hyper": "Terminal",
  "warp": "Terminal",
  "alacritty": "Terminal",
  kitty: "Terminal",
  slack: "Slack",
  "microsoft teams": "Teams",
  teams: "Teams",
  zoom: "Zoom",
  "zoom.us": "Zoom",
  discord: "Discord",
  figma: "Figma",
  notion: "Notion",
  "postman": "Postman",
  "insomnia": "Insomnia",
  "tableplus": "TablePlus",
  "datagrip": "DataGrip",
  "pgadmin": "pgAdmin",
  "github desktop": "GitHub Desktop",
  "gitkraken": "GitKraken",
  "sourcetree": "Sourcetree",
  finder: "Finder",
  "file explorer": "File Explorer",
  "activity monitor": "Activity Monitor",
  "task manager": "Task Manager",
  preview: "Preview",
  "google meet": "Google Meet",
  "microsoft outlook": "Outlook",
  outlook: "Outlook",
  "mail": "Mail",
  "apple mail": "Mail",
  gmail: "Gmail",
  "linear": "Linear",
  "jira": "Jira",
};

export const SOURCE_RELIABILITY_WEIGHTS: Record<string, number> = {
  workflow_interaction: 1.0,
  workstream: 0.85,
  session_capture: 0.7,
  persona_seed: 0.5,
};

// Pipeline constants
export const DEDUPE_WINDOW_MS = 90_000; // 90 seconds
export const EPISODE_GAP_MS = 30 * 60 * 1000; // 30 minutes
export const MIN_PATTERN_SUPPORT = 2;
export const MIN_EVIDENCE_STABLE = 5;
export const MIN_USERS_FOR_ORG_TASK = 3;
export const TOP_ACTIVITIES_PER_APP = 5;
