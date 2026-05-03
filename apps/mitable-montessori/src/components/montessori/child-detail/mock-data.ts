export type AreaName = "Sensorial" | "Math" | "Language" | "Practical Life" | "Cultural";
export type Level = "Emerging" | "Practicing" | "Deepening" | "Leading";
export type SubtopicState = "i" | "p" | "m";

export type AxisKey =
  | "concentration"
  | "material-progression"
  | "self-correction"
  | "independence"
  | "choice-quality"
  | "error-resilience"
  | "motivation";

export type Axis = {
  key: AxisKey;
  label: string;
  level: Level;
  updated: string;
  descriptors: Record<Level, string>;
};

export type WholeChildObservation = {
  id: string;
  date: string;
  abs: string;
  rel: string;
  axis: AxisKey;
  from: Level | null;
  to: Level | null;
  note: string;
  source: string | null;
  author: string;
};

export type Subtopic = {
  name: string;
  area: AreaName;
  state: SubtopicState;
  introduced: string | null;
  practicing: string | null;
  mastered: string | null;
};

export type ActivityTransition = { area: AreaName; to: "Introduced" | "Practicing" | "Mastered" };

export type ActivityEntry = {
  id: string;
  date: string;
  abs: string;
  rel: string;
  area: AreaName;
  material: string;
  comment: string;
  transition: ActivityTransition | null;
};

export type Guardian = {
  name: string;
  relationship: string;
  primary: boolean;
  contact: string;
};

export type ChildProfile = {
  fullName: string;
  dob: string;
  age: string;
  classroom: string;
  primaryTeacher: string;
  enrolled: string;
  pronouns: string;
  allergies: string;
  guardians: Guardian[];
};

export const AREAS: Record<AreaName, { tone: string; soft: string }> = {
  Sensorial: { tone: "var(--color-clay)", soft: "var(--color-clay-soft)" },
  Math: { tone: "var(--color-butter)", soft: "var(--color-butter-soft)" },
  Language: { tone: "var(--color-terracotta)", soft: "var(--color-terracotta-soft)" },
  "Practical Life": { tone: "var(--color-sage)", soft: "var(--color-sage-soft)" },
  Cultural: { tone: "var(--color-dusty-blue)", soft: "var(--color-dusty-blue-soft)" },
};

export const LEVELS: Level[] = ["Emerging", "Practicing", "Deepening", "Leading"];

export const LEVEL_TONES: Record<Level, { tone: string; soft: string; deep: string }> = {
  Emerging: {
    tone: "var(--color-terracotta)",
    soft: "var(--color-terracotta-soft)",
    deep: "var(--color-terracotta-deep)",
  },
  Practicing: {
    tone: "var(--color-butter)",
    soft: "var(--color-butter-soft)",
    deep: "var(--color-butter-deep)",
  },
  Deepening: {
    tone: "var(--color-dusty-blue)",
    soft: "var(--color-dusty-blue-soft)",
    deep: "#33526E",
  },
  Leading: {
    tone: "var(--color-sage)",
    soft: "var(--color-sage-soft)",
    deep: "var(--color-sage-deep)",
  },
};

export const AXES: Axis[] = [
  {
    key: "concentration",
    label: "Concentration",
    level: "Practicing",
    updated: "Apr 28",
    descriptors: {
      Emerging: "Brief, needs adult to redirect.",
      Practicing: "Sustained on familiar work; some resets after distraction.",
      Deepening: "Holds focus through full work cycle, resists interruption.",
      Leading: "Returns to a chosen work over days; protects own focus.",
    },
  },
  {
    key: "material-progression",
    label: "Material Progression",
    level: "Practicing",
    updated: "Apr 26",
    descriptors: {
      Emerging: "Repeats first presentation; new materials feel uncertain.",
      Practicing: "Moves through familiar shelf at her own pace.",
      Deepening: "Builds on prior work; seeks logical next step.",
      Leading: "Bridges areas — uses Sensorial to inform Math choices.",
    },
  },
  {
    key: "self-correction",
    label: "Self-Correction",
    level: "Leading",
    updated: "Apr 30",
    descriptors: {
      Emerging: "Notices error only when adult points it out.",
      Practicing: "Catches obvious mismatches; sometimes asks for help.",
      Deepening: "Finds and fixes error in same work cycle.",
      Leading: "Uses material's own control of error fluently; explains it.",
    },
  },
  {
    key: "independence",
    label: "Independence",
    level: "Deepening",
    updated: "Apr 24",
    descriptors: {
      Emerging: "Looks to adult for each step.",
      Practicing: "Sets up familiar work; returns it to the shelf.",
      Deepening: "Chooses, completes, and restores work without prompting.",
      Leading: "Helps a younger child set up their own work.",
    },
  },
  {
    key: "choice-quality",
    label: "Choice Quality",
    level: "Practicing",
    updated: "Apr 22",
    descriptors: {
      Emerging: "Chooses by proximity or peer; abandons quickly.",
      Practicing: "Picks work she knows well; occasional stretch choice.",
      Deepening: "Chooses with intent — names goal before starting.",
      Leading: "Plans a work cycle across multiple materials.",
    },
  },
  {
    key: "error-resilience",
    label: "Error Resilience",
    level: "Emerging",
    updated: "Apr 18",
    descriptors: {
      Emerging: "Frustrated by mistakes; may abandon the work.",
      Practicing: "Tries again with encouragement.",
      Deepening: "Retries unprompted; treats error as information.",
      Leading: "Welcomes hard work; chooses materials at the edge of skill.",
    },
  },
  {
    key: "motivation",
    label: "Motivation",
    level: "Deepening",
    updated: "Apr 27",
    descriptors: {
      Emerging: "Works when adult invites; rarely initiates.",
      Practicing: "Initiates work she enjoys; flat on stretch tasks.",
      Deepening: "Initiates broadly; curious about new presentations.",
      Leading: "Articulates own goals; pursues work across days.",
    },
  },
];

export const CHILD_PROFILE: ChildProfile = {
  fullName: "Ada Chen",
  dob: "Aug 14, 2021",
  age: "4y 2m",
  classroom: "Hummingbirds",
  primaryTeacher: "Ms. Halima",
  enrolled: "Sept 2024",
  pronouns: "she/her",
  allergies: "None on file",
  guardians: [
    { name: "Jane Chen", relationship: "Mother", primary: true, contact: "jane.chen@example.com" },
    { name: "Wei Chen", relationship: "Father", primary: false, contact: "(415) 555-0142" },
  ],
};

export const WHOLE_CHILD_OBSERVATIONS: WholeChildObservation[] = [
  {
    id: "w01",
    date: "Apr 30",
    abs: "Apr 30, 2026",
    rel: "today",
    axis: "self-correction",
    from: "Deepening",
    to: "Leading",
    note: "Caught her own missing-cube on the pink tower without prompt — explained the control of error to a younger child. Bumping to Leading.",
    source: "t01",
    author: "Ms. Halima",
  },
  {
    id: "w02",
    date: "Apr 28",
    abs: "Apr 28, 2026",
    rel: "2 days ago",
    axis: "motivation",
    from: "Practicing",
    to: "Deepening",
    note: "Sequenced 11–16 on her own initiative, asked to bring out the teen board the next day. Initiation is broadening past Sensorial.",
    source: "t02",
    author: "Ms. Halima",
  },
  {
    id: "w03",
    date: "Apr 27",
    abs: "Apr 27, 2026",
    rel: "3 days ago",
    axis: "concentration",
    from: null,
    to: null,
    note: "27-minute work cycle on knobless cylinders. No reset. Confirms Practicing — not yet Deepening (still resets after lunch transition).",
    source: null,
    author: "Ms. Halima",
  },
  {
    id: "w04",
    date: "Apr 24",
    abs: "Apr 24, 2026",
    rel: "6 days ago",
    axis: "independence",
    from: "Practicing",
    to: "Deepening",
    note: "Set up dressing frame, completed it, returned every piece, refilled the basket. No adult cue at any step.",
    source: "t04",
    author: "Mr. Owen",
  },
  {
    id: "w05",
    date: "Apr 22",
    abs: "Apr 22, 2026",
    rel: "8 days ago",
    axis: "choice-quality",
    from: null,
    to: null,
    note: "Picked map of Africa because 'Iris was working with it yesterday.' Choice still proximity-driven — staying at Practicing for now.",
    source: "t05",
    author: "Ms. Halima",
  },
  {
    id: "w06",
    date: "Apr 18",
    abs: "Apr 18, 2026",
    rel: "12 days ago",
    axis: "error-resilience",
    from: null,
    to: null,
    note: "Cried briefly when red rods didn't sequence — abandoned the work. Still at Emerging. Watch over the next two weeks.",
    source: "t09",
    author: "Ms. Halima",
  },
  {
    id: "w07",
    date: "Apr 14",
    abs: "Apr 14, 2026",
    rel: "2 weeks ago",
    axis: "material-progression",
    from: "Emerging",
    to: "Practicing",
    note: "Bridged Sensorial → Math intentionally — used pink tower experience to anchor teen board quantity work. First cross-area connection.",
    source: "t08",
    author: "Ms. Halima",
  },
  {
    id: "w08",
    date: "Apr 09",
    abs: "Apr 9, 2026",
    rel: "3 weeks ago",
    axis: "independence",
    from: null,
    to: null,
    note: "Sorted land/water/air without prompt. Confirms Practicing on independence; not yet helping peers, so not Deepening yet.",
    source: "t10",
    author: "Mr. Owen",
  },
  {
    id: "w09",
    date: "Apr 02",
    abs: "Apr 2, 2026",
    rel: "4 weeks ago",
    axis: "concentration",
    from: "Emerging",
    to: "Practicing",
    note: "Returned to brown stair three times across the week — sustained focus on familiar work. Moving up to Practicing.",
    source: "t12",
    author: "Ms. Halima",
  },
  {
    id: "w10",
    date: "Mar 22",
    abs: "Mar 22, 2026",
    rel: "5 weeks ago",
    axis: "motivation",
    from: "Emerging",
    to: "Practicing",
    note: "Initiated sandpaper letters unprompted — first time choosing Language work without a presentation cue.",
    source: "t13",
    author: "Ms. Halima",
  },
  {
    id: "w11",
    date: "Mar 18",
    abs: "Mar 18, 2026",
    rel: "6 weeks ago",
    axis: "self-correction",
    from: "Practicing",
    to: "Deepening",
    note: "Built pink tower, found her own size error mid-build, undid the top three blocks and rebuilt cleanly. Repeating the pattern across two days.",
    source: "t14",
    author: "Ms. Halima",
  },
];

export const SUBTOPICS: Subtopic[] = [
  {
    name: "Pink tower",
    area: "Sensorial",
    state: "p",
    introduced: "Mar 2",
    practicing: "Mar 18",
    mastered: null,
  },
  {
    name: "Brown stair",
    area: "Sensorial",
    state: "p",
    introduced: "Mar 6",
    practicing: "Apr 2",
    mastered: null,
  },
  {
    name: "Red rods",
    area: "Sensorial",
    state: "i",
    introduced: "Apr 12",
    practicing: null,
    mastered: null,
  },
  {
    name: "Knobless cylinders",
    area: "Sensorial",
    state: "m",
    introduced: "Feb 14",
    practicing: "Mar 1",
    mastered: "Apr 8",
  },
  {
    name: "Teen board",
    area: "Math",
    state: "p",
    introduced: "Mar 21",
    practicing: "Apr 14",
    mastered: null,
  },
  {
    name: "Number rods",
    area: "Math",
    state: "i",
    introduced: "Apr 16",
    practicing: null,
    mastered: null,
  },
  {
    name: "Sandpaper letters",
    area: "Language",
    state: "p",
    introduced: "Feb 28",
    practicing: "Mar 22",
    mastered: null,
  },
  {
    name: "Movable alphabet",
    area: "Language",
    state: "i",
    introduced: "Apr 19",
    practicing: null,
    mastered: null,
  },
  {
    name: "Pouring",
    area: "Practical Life",
    state: "m",
    introduced: "Jan 18",
    practicing: "Feb 4",
    mastered: "Mar 3",
  },
  {
    name: "Dressing frame",
    area: "Practical Life",
    state: "p",
    introduced: "Mar 8",
    practicing: "Apr 6",
    mastered: null,
  },
  {
    name: "Map of Africa",
    area: "Cultural",
    state: "i",
    introduced: "Apr 21",
    practicing: null,
    mastered: null,
  },
  {
    name: "Land/water/air",
    area: "Cultural",
    state: "p",
    introduced: "Mar 12",
    practicing: "Apr 9",
    mastered: null,
  },
];

export const TIMELINE: ActivityEntry[] = [
  {
    id: "t01",
    date: "Apr 30",
    abs: "Apr 30, 2026",
    rel: "today",
    area: "Sensorial",
    material: "Pink tower",
    comment: "Built it correctly on first try — third return this week.",
    transition: null,
  },
  {
    id: "t02",
    date: "Apr 28",
    abs: "Apr 28, 2026",
    rel: "2 days ago",
    area: "Math",
    material: "Teen board",
    comment: "Sequenced 11 through 16 unprompted.",
    transition: null,
  },
  {
    id: "t03",
    date: "Apr 26",
    abs: "Apr 26, 2026",
    rel: "4 days ago",
    area: "Sensorial",
    material: "Brown stair",
    comment: "Paired with pink tower — noticed the missing dimension.",
    transition: null,
  },
  {
    id: "t04",
    date: "Apr 24",
    abs: "Apr 24, 2026",
    rel: "6 days ago",
    area: "Practical Life",
    material: "Dressing frame",
    comment: "Buttoned top to bottom; did not ask for help.",
    transition: null,
  },
  {
    id: "t05",
    date: "Apr 21",
    abs: "Apr 21, 2026",
    rel: "9 days ago",
    area: "Cultural",
    material: "Map of Africa",
    comment: "First presentation. Held the puzzle map for a long time.",
    transition: { area: "Cultural", to: "Introduced" },
  },
  {
    id: "t06",
    date: "Apr 19",
    abs: "Apr 19, 2026",
    rel: "11 days ago",
    area: "Language",
    material: "Movable alphabet",
    comment: "First presentation — picked out 'cat' on her own.",
    transition: { area: "Language", to: "Introduced" },
  },
  {
    id: "t07",
    date: "Apr 16",
    abs: "Apr 16, 2026",
    rel: "2 weeks ago",
    area: "Math",
    material: "Number rods",
    comment: "First presentation. Counted to 7 confidently.",
    transition: { area: "Math", to: "Introduced" },
  },
  {
    id: "t08",
    date: "Apr 14",
    abs: "Apr 14, 2026",
    rel: "2 weeks ago",
    area: "Math",
    material: "Teen board",
    comment: "Built 11 through 14 with quantity beads.",
    transition: { area: "Math", to: "Practicing" },
  },
  {
    id: "t09",
    date: "Apr 12",
    abs: "Apr 12, 2026",
    rel: "3 weeks ago",
    area: "Sensorial",
    material: "Red rods",
    comment: "First presentation; ordered them by length.",
    transition: { area: "Sensorial", to: "Introduced" },
  },
  {
    id: "t10",
    date: "Apr 09",
    abs: "Apr 9, 2026",
    rel: "3 weeks ago",
    area: "Cultural",
    material: "Land/water/air",
    comment: "Sorted the small objects without prompting.",
    transition: { area: "Cultural", to: "Practicing" },
  },
  {
    id: "t11",
    date: "Apr 08",
    abs: "Apr 8, 2026",
    rel: "3 weeks ago",
    area: "Sensorial",
    material: "Knobless cylinders",
    comment: "Completed all four boxes blindfolded.",
    transition: { area: "Sensorial", to: "Mastered" },
  },
  {
    id: "t12",
    date: "Apr 02",
    abs: "Apr 2, 2026",
    rel: "4 weeks ago",
    area: "Sensorial",
    material: "Brown stair",
    comment: "Returned to it three times this week.",
    transition: { area: "Sensorial", to: "Practicing" },
  },
  {
    id: "t13",
    date: "Mar 22",
    abs: "Mar 22, 2026",
    rel: "5 weeks ago",
    area: "Language",
    material: "Sandpaper letters",
    comment: "Traced 'a', 'm', 's' with strong tactile interest.",
    transition: { area: "Language", to: "Practicing" },
  },
  {
    id: "t14",
    date: "Mar 18",
    abs: "Mar 18, 2026",
    rel: "6 weeks ago",
    area: "Sensorial",
    material: "Pink tower",
    comment: "Built tower independently — two tries, both correct.",
    transition: { area: "Sensorial", to: "Practicing" },
  },
];

export const FILTERS = [
  "All",
  "This week",
  "This month",
  "Sensorial",
  "Math",
  "Language",
  "Practical Life",
  "Cultural",
] as const;
export type FilterValue = (typeof FILTERS)[number];

export const stateMeta: Record<
  SubtopicState,
  { label: string; tone: string; soft: string; deep: string }
> = {
  i: {
    label: "Introduced",
    tone: "var(--color-terracotta)",
    soft: "var(--color-terracotta-soft)",
    deep: "var(--color-terracotta-deep)",
  },
  p: {
    label: "Practicing",
    tone: "var(--color-butter)",
    soft: "var(--color-butter-soft)",
    deep: "var(--color-butter-deep)",
  },
  m: {
    label: "Mastered",
    tone: "var(--color-sage)",
    soft: "var(--color-sage-soft)",
    deep: "var(--color-sage-deep)",
  },
};

export const inLastWeek = (date: string) => /Apr (24|25|26|27|28|29|30)/.test(date);
export const inLastMonth = (date: string) => /Apr/.test(date);
