/** Rating rows from TLP's sample end-of-term report (shared by email, 12 August 2026). */
export const TERM_SKILL_GROUPS = [
  {
    label: "Work and Study Habits",
    options: ["Inadequate", "Adequate", "Excellent"],
    items: [
      "Stays on task",
      "Follows verbal directions",
      "Follows written directions",
      "Completes class work within the allotted time",
      "Completes homework",
      "Works well in a group",
      "Works well independently",
      "Maintains a neat work area",
      "Care for materials",
      "Makes proper use of time",
    ],
  },
  {
    label: "Social and Emotional Growth",
    options: ["Rarely", "Sometimes", "Frequently", "Always"],
    items: [
      "Works and plays well with others",
      "Demonstrates self-confidence",
      "Displays courtesy and consideration",
      "Accepts responsibility",
      "Participates in group discussions",
      "Respects others",
      "Respects property",
      "Listens to others",
      "Demonstrates trustworthiness",
      "Adjusts easily to new situations",
      "Cooperates willingly",
      "Practices self-control",
    ],
  },
  {
    label: "Self-development Report",
    options: ["Basic", "Developing", "Mature"],
    items: ["Emotional Behaviour", "Level of Independence"],
  },
  {
    label: "General Report Comments",
    options: ["No", "Sometimes", "Yes", "Not Applicable"],
    items: [
      "Parent Teacher Conference Attended",
      "Punctual",
      "Is progressing well within current learning team",
      "Will progress to the next learning team next term",
      "Will progress to the next segment next term",
    ],
  },
] as const;
const PREFIX = "__MITABLE_TERM_SKILLS_V1__";
export type TermSkillRatings = Record<string, string>;

export function termSkillsForDisplay(html: string) {
  let ratings: Record<string, unknown> = {};
  if (html.startsWith(PREFIX)) {
    try {
      const parsed = JSON.parse(html.slice(PREFIX.length));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) ratings = parsed;
    } catch {
      /* Unrated until a teacher supplies valid choices. */
    }
  }
  return TERM_SKILL_GROUPS.map((group, groupIndex) => ({
    label: group.label,
    rows: group.items.map((label, index) => {
      const id = `${groupIndex}-${index}`;
      const options: string[] = [...group.options];
      // The source form offers N/A only for the last three general-report rows.
      if (groupIndex === 3 && index < 2) options.pop();
      const value =
        typeof ratings[id] === "string" && options.includes(ratings[id] as string)
          ? (ratings[id] as string)
          : null;
      return { id, label, options, value };
    }),
  }));
}

export function encodeTermSkills(ratings: TermSkillRatings) {
  const clean = Object.fromEntries(
    termSkillsForDisplay(PREFIX + JSON.stringify(ratings)).flatMap((group) =>
      group.rows.flatMap((row) => (row.value ? [[row.id, row.value]] : []))
    )
  );
  return PREFIX + JSON.stringify(clean);
}
export function isTermSkillsPayload(html: string) {
  return html.startsWith(PREFIX);
}
export function termSkillsToReadableText(html: string) {
  return termSkillsForDisplay(html)
    .map((group) =>
      [group.label, ...group.rows.map((row) => `${row.label}: ${row.value ?? "Not rated"}`)].join(
        "\n"
      )
    )
    .join("\n\n");
}
export function termSkillsSection() {
  return {
    id: "term-skills",
    heading: "Skills report",
    paragraphs: [{ id: "term-skills-ratings", html: encodeTermSkills({}) }],
  };
}
