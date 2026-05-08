/** Pure module — safe to import from both server and client components.
 *  Lives separate from `classroom-progress.ts` so the client-side Progress
 *  route can pull in the labels + type without dragging `next/headers` into
 *  a "use client" bundle. */

export type ProgressProgram = "montessori" | "iep" | "session_notes";

/** UI labels for the Progress mode switcher. The exact strings are part of
 *  the product spec for this iteration — do not localize without a design
 *  pass first. */
export const PROGRAM_LABEL: Record<ProgressProgram, string> = {
  montessori: "Montessori",
  iep: "IEP",
  session_notes: "Session Notes",
};

/** Canonical UI order for tabs, regardless of how data was stored. */
export const PROGRAM_ORDER: ProgressProgram[] = ["montessori", "iep", "session_notes"];
