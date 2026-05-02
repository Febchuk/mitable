export type Tone = "clay" | "sage" | "butter" | "blue" | "terracotta";
export type ProgressMark = "m" | "p" | "i" | "-";
export type AttendanceMark = "p" | "a" | "t" | "-";
export type ReportStatus = "draft" | "review" | "sent";
export type ObservationStatus = "pending" | "approved";
export type ObservationLevel = "Mastered" | "Practicing" | "Introduced" | string;
export type ObservationAccent = "butter" | "sage" | "clay";

export type Child = {
  id: string;
  name: string;
  age: string;
  enrolled: string;
  tone: Tone;
  present: boolean;
  guardian: string;
  recent: string;
};

export type Report = {
  id: string;
  childId: string;
  kind: "Daily" | "Major";
  when: string;
  period: string;
  status: ReportStatus;
};

export type DividerMessage = { id: string; type: "divider"; label: string };
export type AssistantMessage = { id: string; type: "assistant"; text: string };
export type UserMessage = { id: string; type: "user"; text: string };
export type VoiceMessage = {
  id: string;
  type: "voice";
  duration: string;
  transcript?: string;
};
export type ObservationMessage = {
  id: string;
  type: "observation";
  status: ObservationStatus;
  childId: string;
  area: string;
  subtopic: string;
  level: ObservationLevel;
  body: string;
  accent: ObservationAccent;
  edited?: boolean;
};

export type ChatMessage =
  | DividerMessage
  | AssistantMessage
  | UserMessage
  | VoiceMessage
  | ObservationMessage;

export const CHILDREN: Child[] = [
  {
    id: "ada",
    name: "Ada Okafor",
    age: "4y 7m",
    enrolled: "Sept 2024",
    tone: "clay",
    present: true,
    guardian: "2 guardians",
    recent: "Pink tower · 8:42a",
  },
  {
    id: "bea",
    name: "Bea Chen",
    age: "3y 11m",
    enrolled: "Sept 2024",
    tone: "sage",
    present: true,
    guardian: "1 guardian",
    recent: "Number rods · yesterday",
  },
  {
    id: "dgo",
    name: "Diego Ramos",
    age: "5y 2m",
    enrolled: "Aug 2023",
    tone: "butter",
    present: true,
    guardian: "2 guardians",
    recent: "Map of Africa · yesterday",
  },
  {
    id: "eli",
    name: "Eli Okonkwo",
    age: "4y 1m",
    enrolled: "Jan 2025",
    tone: "clay",
    present: true,
    guardian: "2 guardians",
    recent: "Metal insets · 8:20a",
  },
  {
    id: "iris",
    name: "Iris Moreau",
    age: "3y 9m",
    enrolled: "Sept 2024",
    tone: "blue",
    present: true,
    guardian: "1 guardian",
    recent: "Pouring · this morning",
  },
  {
    id: "kai",
    name: "Kai Nakamura",
    age: "4y 4m",
    enrolled: "Sept 2024",
    tone: "sage",
    present: true,
    guardian: "2 guardians",
    recent: "Trinomial cube · yesterday",
  },
  {
    id: "levi",
    name: "Levi Schwartz",
    age: "3y 6m",
    enrolled: "Mar 2026",
    tone: "butter",
    present: true,
    guardian: "1 guardian",
    recent: "Sandpaper letters · 8:30a",
  },
  {
    id: "mira",
    name: "Mira Khan",
    age: "4y 9m",
    enrolled: "Sept 2024",
    tone: "sage",
    present: true,
    guardian: "2 guardians",
    recent: "Teen board · 8:14a",
  },
  {
    id: "noor",
    name: "Noor Habib",
    age: "3y 8m",
    enrolled: "Sept 2024",
    tone: "clay",
    present: true,
    guardian: "2 guardians",
    recent: "Practical life · this week",
  },
  {
    id: "ren",
    name: "Ren Tanaka",
    age: "4y 11m",
    enrolled: "Sept 2023",
    tone: "blue",
    present: true,
    guardian: "1 guardian",
    recent: "Geometry cabinet · this week",
  },
  {
    id: "pia",
    name: "Pia Marin",
    age: "4y 0m",
    enrolled: "Sept 2024",
    tone: "butter",
    present: true,
    guardian: "2 guardians",
    recent: "Botany puzzle · yesterday",
  },
  {
    id: "tom",
    name: "Tom Walsh",
    age: "3y 7m",
    enrolled: "Sept 2024",
    tone: "clay",
    present: true,
    guardian: "1 guardian",
    recent: "Dressing frame · this morning",
  },
  {
    id: "fin",
    name: "Fin Nilsson",
    age: "4y 6m",
    enrolled: "Sept 2024",
    tone: "sage",
    present: true,
    guardian: "2 guardians",
    recent: "Knobless cylinders · yesterday",
  },
  {
    id: "val",
    name: "Val Lopez",
    age: "3y 10m",
    enrolled: "Sept 2024",
    tone: "blue",
    present: true,
    guardian: "2 guardians",
    recent: "Land/water/air · this week",
  },
  {
    id: "rui",
    name: "Rui Costa",
    age: "4y 3m",
    enrolled: "Sept 2024",
    tone: "butter",
    present: false,
    guardian: "2 guardians",
    recent: "Movable alphabet · Mon",
  },
  {
    id: "jen",
    name: "Jen Park",
    age: "4y 8m",
    enrolled: "Sept 2024",
    tone: "sage",
    present: false,
    guardian: "1 guardian",
    recent: "Stamp game · last week",
  },
  {
    id: "oli",
    name: "Oli Hassan",
    age: "5y 0m",
    enrolled: "Sept 2023",
    tone: "clay",
    present: false,
    guardian: "2 guardians",
    recent: "Continent map · last week",
  },
  {
    id: "sam",
    name: "Sam Wright",
    age: "3y 5m",
    enrolled: "Mar 2026",
    tone: "blue",
    present: false,
    guardian: "1 guardian",
    recent: "Spooning · this week",
  },
];

export const SUBTOPICS: string[] = [
  "Pink tower",
  "Brown stair",
  "Red rods",
  "Cylinder blocks",
  "Binomial cube",
  "Trinomial cube",
  "Geometric solids",
  "Smelling jars",
  "Sound cylinders",
  "Color tablets",
  "Touch boards",
  "Thermic tablets",
];

export const INITIAL_PROGRESS: Record<string, ProgressMark[]> = {
  ada: ["m", "m", "p", "m", "p", "i", "-", "m", "p", "i", "-", "-"],
  bea: ["m", "p", "p", "i", "-", "-", "-", "m", "p", "i", "-", "-"],
  dgo: ["m", "m", "m", "m", "p", "p", "i", "m", "m", "p", "i", "-"],
  eli: ["p", "p", "i", "i", "-", "-", "-", "p", "i", "-", "-", "-"],
  iris: ["p", "i", "-", "-", "-", "-", "-", "i", "-", "-", "-", "-"],
  kai: ["m", "m", "p", "p", "m", "p", "i", "m", "m", "p", "p", "i"],
  levi: ["i", "-", "-", "-", "-", "-", "-", "i", "-", "-", "-", "-"],
  mira: ["m", "m", "m", "m", "p", "p", "-", "m", "m", "m", "p", "i"],
  noor: ["p", "i", "-", "-", "-", "-", "-", "p", "i", "-", "-", "-"],
  ren: ["m", "m", "p", "p", "i", "i", "-", "m", "p", "p", "i", "-"],
};

export const INITIAL_REPORTS: Report[] = [
  { id: "r1", childId: "ada", kind: "Daily", when: "Apr 30", period: "today", status: "draft" },
  { id: "r2", childId: "dgo", kind: "Daily", when: "Apr 30", period: "today", status: "draft" },
  {
    id: "r3",
    childId: "mira",
    kind: "Major",
    when: "Spring 2026",
    period: "spring period",
    status: "review",
  },
  {
    id: "r4",
    childId: "bea",
    kind: "Major",
    when: "Spring 2026",
    period: "spring period",
    status: "draft",
  },
  { id: "r5", childId: "levi", kind: "Daily", when: "Apr 29", period: "yesterday", status: "sent" },
  { id: "r6", childId: "bea", kind: "Daily", when: "Apr 28", period: "2 days ago", status: "sent" },
  {
    id: "r7",
    childId: "iris",
    kind: "Daily",
    when: "Apr 28",
    period: "2 days ago",
    status: "sent",
  },
  {
    id: "r8",
    childId: "dgo",
    kind: "Major",
    when: "Winter 2026",
    period: "last term",
    status: "sent",
  },
];

export const INITIAL_CHAT: ChatMessage[] = [
  { id: "d1", type: "divider", label: "This morning · 8:42" },
  { id: "a1", type: "assistant", text: "You captured one observation earlier." },
  {
    id: "o1",
    type: "observation",
    status: "approved",
    childId: "mira",
    area: "Math",
    subtopic: "Teen board",
    level: "Mastered",
    body: "Math → Teen board · independently completed 11 to 19.",
    accent: "sage",
  },
  {
    id: "v1",
    type: "voice",
    duration: "0:18",
    transcript:
      '"Ada chose the pink tower for the third time this week. Built it correctly — first try."',
  },
  {
    id: "a2",
    type: "assistant",
    text: "Two things to record from that. Both stay here until you approve.",
  },
  {
    id: "o2",
    type: "observation",
    status: "pending",
    childId: "ada",
    area: "Sensorial",
    subtopic: "Pink tower",
    level: "Practicing",
    body: "Sensorial → Pink tower · third return this week, built correctly on first try.",
    accent: "butter",
  },
  {
    id: "o3",
    type: "observation",
    status: "pending",
    childId: "ada",
    area: "Private note",
    subtopic: "",
    level: "not shared with family",
    body: "Drawn to the pink tower repeatedly — worth surfacing in next family conference.",
    accent: "clay",
  },
];

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

export const INITIAL_ATTENDANCE: Record<string, AttendanceMark[]> = {
  ada: ["p", "p", "p", "p", "t"],
  bea: ["p", "a", "p", "p", "t"],
  dgo: ["p", "p", "p", "p", "t"],
  eli: ["p", "p", "a", "p", "t"],
  iris: ["a", "p", "p", "p", "t"],
  kai: ["p", "p", "p", "p", "t"],
  levi: ["p", "p", "p", "p", "t"],
  mira: ["p", "p", "p", "p", "t"],
  noor: ["p", "p", "p", "a", "-"],
  ren: ["p", "p", "p", "p", "t"],
};

export type ScriptedReply = {
  match: RegExp;
  reply: string;
  cards: Array<Omit<ObservationMessage, "id" | "type" | "status">>;
};

export const SCRIPTED_REPLIES: ScriptedReply[] = [
  {
    match: /pink tower|tower/i,
    reply: "Got it — adding to Ada's record.",
    cards: [
      {
        childId: "ada",
        area: "Sensorial",
        subtopic: "Pink tower",
        level: "Practicing",
        body: "Sensorial → Pink tower · returned today, built without error.",
        accent: "butter",
      },
    ],
  },
  {
    match: /(read|letter|sandpaper)/i,
    reply: "Heard. One observation drafted for Levi.",
    cards: [
      {
        childId: "levi",
        area: "Language",
        subtopic: "Sandpaper letters",
        level: "Introduced",
        body: "Language → Sandpaper letters · first presentation. Strong tactile interest.",
        accent: "butter",
      },
    ],
  },
  {
    match: /(addition|math|number|teen)/i,
    reply: "Noted — that's a Math · Practicing for Diego.",
    cards: [
      {
        childId: "dgo",
        area: "Math",
        subtopic: "Teen board",
        level: "Practicing",
        body: "Math → Teen board · sequenced 11 through 16 unprompted.",
        accent: "butter",
      },
    ],
  },
];

export function findChild(id: string): Child | undefined {
  return CHILDREN.find((c) => c.id === id);
}

export function initialsFor(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("");
}
