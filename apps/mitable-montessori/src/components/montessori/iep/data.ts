// IEP progress mode — types, scales, helpers, and a small seed.
//
// MVP scope:
//   * student-scoped instead of class-scoped
//   * structured storage (band, count, prompt, note) with a derived display code
//   * seed goals only — UI for adding new goals comes later
//
// All types are deliberately narrow strings so the cell-code helpers can
// stay total. See `formatIepCode()` for the display rule.

export type PerformanceBand = "I" | "E" | "P" | "C" | "S";
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

export const PERFORMANCE_LABEL: Record<PerformanceBand, string> = {
  I: "Introduced",
  E: "Emerging",
  P: "Progressing",
  C: "Consistent",
  S: "Self-sufficient",
};

export const PERFORMANCE_BANDS: PerformanceBand[] = ["I", "E", "P", "C", "S"];

export const PROMPTING_LABEL: Record<PromptingCode, string> = {
  N: "None",
  G: "Gestural",
  V: "Verbal",
  H: "Partial physical",
  F: "Full physical",
};

export const PROMPTING_CODES: PromptingCode[] = ["N", "G", "V", "H", "F"];

// Performance band tints — reuse the same warm palette used by the
// class-mode matrix so the two grids feel like cousins.
export const PERFORMANCE_BG: Record<PerformanceBand, string> = {
  I: "var(--color-clay-soft)",
  E: "var(--color-clay)",
  P: "var(--color-butter)",
  C: "var(--color-sage-soft)",
  S: "var(--color-sage)",
};

export const PERFORMANCE_FG: Record<PerformanceBand, string> = {
  I: "var(--color-terracotta-deep)",
  E: "var(--color-ink)",
  P: "var(--color-ink)",
  C: "var(--color-sage-deep)",
  S: "var(--color-ink)",
};

export type IepGoal = {
  id: string;
  domain: IepDomain;
  name: string;
};

export type IepEntry = {
  id: string;
  studentId: string;
  goalId: string;
  domain: IepDomain;
  performanceBand: PerformanceBand;
  /** 0–10 (clamp at the edit boundary). */
  successCount: number;
  promptingCode: PromptingCode;
  note?: string;
  /** ISO timestamp. */
  recordedAt: string;
  recordedBy?: string;
};

/** Map: studentId → goalId → entries (newest first). */
export type IepByStudent = Record<string, Record<string, IepEntry[]>>;

/** "P7V", "C8G", "S10N", "E3H" — same shape regardless of count digits. */
export function formatIepCode(
  e: Pick<IepEntry, "performanceBand" | "successCount" | "promptingCode">
): string {
  const count = Math.max(0, Math.min(10, Math.round(e.successCount)));
  return `${e.performanceBand}${count}${e.promptingCode}`;
}

// -----------------------------------------------------------------------------
// Seed goals — 2–3 per domain so the grid has something to look at on first
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
// Seed entries for a couple of children so the empty state isn't the *only*
// thing a teacher sees when they first open the page.
// -----------------------------------------------------------------------------

const daysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

const seedEntry = (
  studentId: string,
  goalId: string,
  domain: IepDomain,
  band: PerformanceBand,
  count: number,
  prompt: PromptingCode,
  daysOffset: number,
  note?: string
): IepEntry => ({
  id: `e-${studentId}-${goalId}-${daysOffset}`,
  studentId,
  goalId,
  domain,
  performanceBand: band,
  successCount: count,
  promptingCode: prompt,
  note,
  recordedAt: daysAgo(daysOffset),
  recordedBy: "Ms. Lena",
});

function buildSeed(): IepByStudent {
  const out: IepByStudent = {};
  const push = (e: IepEntry) => {
    out[e.studentId] = out[e.studentId] || {};
    out[e.studentId][e.goalId] = out[e.studentId][e.goalId] || [];
    out[e.studentId][e.goalId].push(e);
  };

  // Ada — early progress on a couple of goals.
  push(seedEntry("ada", "g-1", "Sensory integration", "P", 7, "V", 0));
  push(seedEntry("ada", "g-1", "Sensory integration", "P", 5, "V", 2));
  push(seedEntry("ada", "g-1", "Sensory integration", "E", 4, "G", 5));
  push(seedEntry("ada", "g-7", "Language and communication skills", "C", 8, "G", 1));
  push(seedEntry("ada", "g-7", "Language and communication skills", "C", 7, "N", 4));
  push(
    seedEntry("ada", "g-13", "Fine motor skills", "P", 6, "V", 0, "Tripod grasp held for full page")
  );

  // Diego — further along on academics + self-help.
  push(seedEntry("dgo", "g-10", "Academics", "S", 10, "N", 0));
  push(seedEntry("dgo", "g-10", "Academics", "S", 9, "N", 3));
  push(seedEntry("dgo", "g-19", "Self-help skills", "C", 8, "G", 0));
  push(seedEntry("dgo", "g-19", "Self-help skills", "P", 6, "V", 4));

  // Levi — earliest stages.
  push(seedEntry("levi", "g-4", "Social skills", "I", 2, "H", 1));
  push(seedEntry("levi", "g-13", "Fine motor skills", "E", 3, "H", 0));

  // Sort newest first per goal.
  for (const sid of Object.keys(out)) {
    for (const gid of Object.keys(out[sid])) {
      out[sid][gid].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
    }
  }
  return out;
}

export const INITIAL_IEP_BY_STUDENT: IepByStudent = buildSeed();
