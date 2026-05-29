/**
 * Shared definitions for classroom student groups ("teams" within a classroom).
 * Used by the admin config UI, the admin API, and the teacher Progress grid so
 * the color palette and value validation stay in one place.
 */

/** Group color keys map 1:1 to the avatar Tone palette / design tokens. */
export const GROUP_COLORS = ["terracotta", "sage", "butter", "blue", "clay"] as const;

export type GroupColor = (typeof GROUP_COLORS)[number];

export const DEFAULT_GROUP_COLOR: GroupColor = "terracotta";

/** Human label + the CSS custom property that paints the swatch. */
export const GROUP_COLOR_META: Record<GroupColor, { label: string; cssVar: string }> = {
  terracotta: { label: "Terracotta", cssVar: "var(--color-terracotta)" },
  sage: { label: "Sage", cssVar: "var(--color-sage)" },
  butter: { label: "Butter", cssVar: "var(--color-butter)" },
  blue: { label: "Blue", cssVar: "var(--color-dusty-blue)" },
  clay: { label: "Clay", cssVar: "var(--color-clay)" },
};

export function isGroupColor(value: unknown): value is GroupColor {
  return typeof value === "string" && (GROUP_COLORS as readonly string[]).includes(value);
}

export function normalizeGroupColor(value: unknown): GroupColor {
  return isGroupColor(value) ? value : DEFAULT_GROUP_COLOR;
}

export type ClassroomGroup = {
  id: string;
  name: string;
  color: GroupColor;
  sortOrder: number;
};
