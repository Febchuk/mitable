// IEP types — standardized scales used by the comment bar and grid components.
//
// Progress scale replaces the old 1–5 rating.
// Accuracy (0–100 %) replaces the old 0–10 success count.
// Prompting uses the full 7-level therapist hierarchy.

export type IepProgress = "M" | "SP" | "IP" | "NP" | "NI";
export type PromptingCode = "I" | "VS" | "GE" | "VB" | "MO" | "PP" | "FP";

export type IepDomain = string;

export const IEP_PROGRESS_VALUES: IepProgress[] = ["M", "SP", "IP", "NP", "NI"];

export const IEP_PROGRESS_LABEL: Record<IepProgress, string> = {
  M: "Mastered",
  SP: "Sufficient Progress",
  IP: "Insufficient Progress",
  NP: "No Progress",
  NI: "Not Introduced",
};

export const IEP_PROGRESS_SHORT: Record<IepProgress, string> = {
  M: "Mastered",
  SP: "Suff. Progress",
  IP: "Insuff. Progress",
  NP: "No Progress",
  NI: "Not Introduced",
};

export const IEP_PROGRESS_BG: Record<IepProgress, string> = {
  M: "var(--color-sage)",
  SP: "var(--color-sage-soft)",
  IP: "var(--color-butter)",
  NP: "var(--color-clay)",
  NI: "var(--color-clay-soft)",
};

export const IEP_PROGRESS_FG: Record<IepProgress, string> = {
  M: "var(--color-ink)",
  SP: "var(--color-sage-deep)",
  IP: "var(--color-ink)",
  NP: "var(--color-ink)",
  NI: "var(--color-terracotta-deep)",
};

export const PROMPTING_CODES: PromptingCode[] = ["I", "VS", "GE", "VB", "MO", "PP", "FP"];

export const PROMPTING_LABEL: Record<PromptingCode, string> = {
  I: "Independent",
  VS: "Visual",
  GE: "Gesture",
  VB: "Verbal",
  MO: "Model",
  PP: "Partial Physical",
  FP: "Full Physical",
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

/** Current state of an IEP item (one student × one goal). */
export type IepItemState = {
  progress: IepProgress | null;
  accuracy: number | null;
  prompting: PromptingCode | null;
  comments: IepComment[];
  updatedAt: string | null;
  updatedBy?: string;
};

export function emptyIepItem(): IepItemState {
  return {
    progress: null,
    accuracy: null,
    prompting: null,
    comments: [],
    updatedAt: null,
  };
}
