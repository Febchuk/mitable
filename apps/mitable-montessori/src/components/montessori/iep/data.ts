// IEP types — narrow scales used by the comment bar and grid components.
//
// Domain names and item lists used to live here as static seeds. They now
// come from the per-child plan stored in iep_domains / iep_items (admin
// curriculum → IEP tab) and are loaded via /api/v1/iep/plan. The teacher view
// owns its loaded state; this file is just the shared type lexicon.

export type IepRating = 1 | 2 | 3 | 4 | 5;
export type PromptingCode = "N" | "G" | "V" | "H" | "F";

/** Domain names are admin-configured strings now (not a closed enum). */
export type IepDomain = string;

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

// Rating tints — kept for the comment-bar picker, where the active chip
// gets coloured to give feedback. Not used by the inline row anymore.
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

/** Current state of an IEP item (one student × one goal). */
export type IepItemState = {
  rating: IepRating | null;
  successCount: number | null;
  promptingCode: PromptingCode | null;
  comments: IepComment[];
  updatedAt: string | null;
  updatedBy?: string;
};

export function emptyIepItem(): IepItemState {
  return {
    rating: null,
    successCount: null,
    promptingCode: null,
    comments: [],
    updatedAt: null,
  };
}
