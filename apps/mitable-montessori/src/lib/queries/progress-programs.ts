/** Pure module — safe to import from both server and client components.
 *  Lives separate from `classroom-progress.ts` so the client-side Progress
 *  route can pull in the labels + type without dragging `next/headers` into
 *  a "use client" bundle. */

export type ProgressProgram = "montessori" | "iep" | "speech";

/** UI labels for the Progress mode switcher. */
export const PROGRAM_LABEL: Record<ProgressProgram, string> = {
  montessori: "Montessori",
  iep: "IEP",
  speech: "Speech",
};

/** Canonical UI order for tabs, regardless of how data was stored. */
export const PROGRAM_ORDER: ProgressProgram[] = ["montessori", "iep", "speech"];
