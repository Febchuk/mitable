// IEP progress mode — types, scales, and seed data.
//
// Iteration shape (the spec the UI now follows):
//   * student-scoped, one row per goal → "IEP item"
//   * each item has a single current state (rating + completion + prompting)
//     plus a comments thread, instead of an entry-history grid
//   * rating is 1–5 (replaces the I/E/P/C/S band) for parity with how
//     teachers verbally describe progress
//   * prompting stays a single primary value — multi-select was deferred
//
// All scales are deliberately narrow types so the rendering helpers can
// stay total.

export type IepRating = 1 | 2 | 3 | 4 | 5;
export type PromptingCode = "N" | "G" | "V" | "H" | "F";

export type IepDomain =
  | "Sensory integration"
  | "Social skills"
  | "Language and communication skills"
  | "Academics"
  | "Fine motor skills"
  | "Gross motor skills"
  | "Self-help skills";

export const IEP_DOMAINS: IepDomain[] = [
  "Sensory integration",
  "Social skills",
  "Language and communication skills",
  "Academics",
  "Fine motor skills",
  "Gross motor skills",
  "Self-help skills",
];

export const RATING_LABEL: Record<IepRating, string> = {
  1: "Introduced",
  2: "Emerging",
  3: "Progressing",
  4: "Consistent",
  5: "Self-sufficient",
};

export const RATINGS: IepRating[] = [1, 2, 3, 4, 5];

export const PROMPTING_LABEL: Record<PromptingCode, string> = {
  N: "None",
  G: "Gestural",
  V: "Verbal",
  H: "Partial physical",
  F: "Full physical",
};

export const PROMPTING_CODES: PromptingCode[] = ["N", "G", "V", "H", "F"];

// Rating tints — reuse the warm palette used by the class-mode matrix so
// the two grids feel like cousins. Mapped from low (clay) to high (sage).
export const RATING_BG: Record<IepRating, string> = {
  1: "var(--color-clay-soft)",
  2: "var(--color-clay)",
  3: "var(--color-butter)",
  4: "var(--color-sage-soft)",
  5: "var(--color-sage)",
};

export const RATING_FG: Record<IepRating, string> = {
  1: "var(--color-terracotta-deep)",
  2: "var(--color-ink)",
  3: "var(--color-ink)",
  4: "var(--color-sage-deep)",
  5: "var(--color-ink)",
};

export type IepGoal = {
  id: string;
  domain: IepDomain;
  name: string;
};

export type IepComment = {
  id: string;
  text: string;
  createdAt: string;
  author?: string;
};

/** Current state of an IEP item (one student × one goal). Unlike the prior
 *  history-of-entries shape, this collapses to a single live record plus a
 *  comments thread — matching the spec's "3 inline fields + notes" model. */
export type IepItemState = {
  rating: IepRating | null;
  successCount: number | null;
  promptingCode: PromptingCode | null;
  comments: IepComment[];
  updatedAt: string | null;
  updatedBy?: string;
};

/** Map: studentId → goalId → IepItemState */
export type IepStateByStudent = Record<string, Record<string, IepItemState>>;

export function emptyIepItem(): IepItemState {
  return {
    rating: null,
    successCount: null,
    promptingCode: null,
    comments: [],
    updatedAt: null,
  };
}

// -----------------------------------------------------------------------------
// Seed goals — 2–3 per domain so the page has something to look at on first
// load. The UI doesn't yet support adding/editing goals; teachers/therapists
// will configure these through admin in a follow-up.
// -----------------------------------------------------------------------------

let _gid = 0;
const g = (domain: IepDomain, name: string): IepGoal => ({
  id: `g-${++_gid}`,
  domain,
  name,
});

export const IEP_GOALS: IepGoal[] = [
  g("Sensory integration", "Tolerates noisy environments for 10+ minutes"),
  g("Sensory integration", "Accepts deep pressure input on request"),
  g("Sensory integration", "Transitions between sensory zones without distress"),

  g("Social skills", "Initiates greeting with a peer"),
  g("Social skills", "Takes turns in a 2-player game"),
  g("Social skills", "Recognises and names a peer's emotion"),

  g("Language and communication skills", "Requests a preferred item using 3+ words"),
  g("Language and communication skills", "Answers a yes/no question"),
  g("Language and communication skills", "Follows a 2-step verbal direction"),

  g("Academics", "Identifies numerals 1–10"),
  g("Academics", "Matches uppercase letter to its sound"),
  g("Academics", "Sorts objects by 2 attributes"),

  g("Fine motor skills", "Holds pencil with tripod grasp"),
  g("Fine motor skills", "Cuts along a straight line"),
  g("Fine motor skills", "Strings 5 beads independently"),

  g("Gross motor skills", "Walks up stairs alternating feet"),
  g("Gross motor skills", "Catches a ball from 2m away"),
  g("Gross motor skills", "Balances on one foot for 5 seconds"),

  g("Self-help skills", "Removes coat and hangs it up"),
  g("Self-help skills", "Washes hands following 5-step sequence"),
  g("Self-help skills", "Uses utensils for full meal"),
];

export function goalsByDomain(): Record<IepDomain, IepGoal[]> {
  const out = Object.fromEntries(IEP_DOMAINS.map((d) => [d, [] as IepGoal[]])) as Record<
    IepDomain,
    IepGoal[]
  >;
  for (const goal of IEP_GOALS) out[goal.domain].push(goal);
  return out;
}

// -----------------------------------------------------------------------------
// Seed states + comments for a couple of children so the empty state isn't
// the only thing a teacher sees when they first open the page.
// -----------------------------------------------------------------------------

const daysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

const seedComment = (text: string, daysOffset: number, author?: string): IepComment => ({
  id: `c-${daysOffset}-${Math.random().toString(36).slice(2, 8)}`,
  text,
  createdAt: daysAgo(daysOffset),
  author,
});

function buildSeed(): IepStateByStudent {
  const out: IepStateByStudent = {};
  const setItem = (
    studentId: string,
    goalId: string,
    rating: IepRating,
    successCount: number,
    prompt: PromptingCode,
    comments: IepComment[],
    daysOffset = 0
  ) => {
    out[studentId] = out[studentId] || {};
    out[studentId][goalId] = {
      rating,
      successCount,
      promptingCode: prompt,
      comments,
      updatedAt: daysAgo(daysOffset),
      updatedBy: "Ms. Lena",
    };
  };

  // Ada — early progress on a couple of goals.
  setItem(
    "ada",
    "g-1",
    3,
    7,
    "V",
    [
      seedComment(
        "Stayed in lunchroom through full meal — used noise-cancelling headphones.",
        0,
        "Ms. Lena"
      ),
      seedComment("Started covering ears halfway through gym class.", 5, "Ms. Lena"),
    ],
    0
  );
  setItem(
    "ada",
    "g-7",
    4,
    8,
    "G",
    [seedComment("Used 4-word request at lunch: 'more apple juice please'.", 1, "Ms. Lena")],
    1
  );
  setItem(
    "ada",
    "g-13",
    3,
    6,
    "V",
    [seedComment("Tripod grasp held for full page.", 0, "Ms. Lena")],
    0
  );

  // Diego — further along on academics + self-help.
  setItem("dgo", "g-10", 5, 10, "N", [], 0);
  setItem(
    "dgo",
    "g-19",
    4,
    8,
    "G",
    [seedComment("Hung coat up without prompting on arrival.", 0, "Ms. Lena")],
    0
  );

  // Levi — earliest stages.
  setItem(
    "levi",
    "g-4",
    1,
    2,
    "H",
    [seedComment("Smiled when peer waved — one second of mutual gaze.", 1, "Ms. Lena")],
    1
  );

  return out;
}

export const INITIAL_IEP_STATE: IepStateByStudent = buildSeed();
