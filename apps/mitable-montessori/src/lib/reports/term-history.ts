import type { SupabaseClient } from "@supabase/supabase-js";
import type { SectionMeta } from "@/lib/report-templates/sections";
import {
  fieldPayloadToReadableText,
  plainTextToReportParagraphHtml,
} from "./template-field-payload";

type Section = { id: string; heading: string; paragraphs: Array<{ id: string; html: string }> };
type SharedReport = {
  id: string;
  report_type: string;
  report_date: string;
  body: string | null;
  sections: Section[] | null;
  section_meta: SectionMeta | null;
};
export type TermHistoryReportType = "daily" | "sen" | "incident" | "project";
const TYPES: TermHistoryReportType[] = ["incident"];
const LABELS: Record<string, string> = {
  daily: "Daily reports",
  sen: "SEN reports",
  incident: "Incident reports",
  project: "Project letters",
};

/** Compile shared evidence only: unfinished drafts and earlier major reports never become evidence. */
export async function buildTermHistorySections(
  db: SupabaseClient,
  scope: {
    schoolId: string;
    studentId: string;
    periodStart: string;
    periodEnd: string;
  },
  types: TermHistoryReportType[] = TYPES
): Promise<{ sections: Section[]; sectionMeta: SectionMeta }> {
  const reports: SharedReport[] = [];
  const size = 200;
  for (let offset = 0; ; offset += size) {
    const { data, error } = await db
      .from("reports")
      .select(
        "id, report_type, report_date, body, sections, section_meta, students!inner(school_id)"
      )
      .eq("student_id", scope.studentId)
      .eq("students.school_id", scope.schoolId)
      .eq("status", "sent")
      .in("report_type", types)
      .gte("report_date", scope.periodStart)
      .lte("report_date", scope.periodEnd)
      .order("report_date")
      .order("id")
      .range(offset, offset + size - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as unknown as SharedReport[];
    reports.push(...page);
    if (page.length < size) break;
  }
  const sections: Section[] = [];
  const sectionMeta: SectionMeta = {};
  for (const type of types) {
    const sources = reports.filter((report) => report.report_type === type);
    if (!sources.length) continue;
    const heading = `${LABELS[type]} — term highlights`;
    const evidence = new Map<string, { first: string; last: string; count: number }>();
    for (const source of sources) {
      const notes = source.sections?.length
        ? source.sections.flatMap((section) => {
            const meta = source.section_meta?.[section.heading];
            // Progress has its own term grid. Boilerplate and nested term summaries add no evidence.
            if (
              meta?.type === "progress_topic" ||
              meta?.type === "exam_grades" ||
              meta?.type === "hardcoded" ||
              meta?.type === "term_history"
            )
              return [];
            return section.paragraphs
              .map((paragraph) => {
                const text = fieldPayloadToReadableText(paragraph.html).trim();
                return text ? `${section.heading}: ${text}` : "";
              })
              .filter(Boolean);
          })
        : source.body?.trim()
          ? [fieldPayloadToReadableText(source.body).trim()]
          : [];
      // A report may repeat a note in multiple paragraphs; count it once per source.
      for (const text of new Set(notes)) {
        const existing = evidence.get(text);
        if (existing) {
          existing.last = source.report_date;
          existing.count++;
        } else
          evidence.set(text, { first: source.report_date, last: source.report_date, count: 1 });
      }
    }
    const countLine = `${sources.length} ${sources.length === 1 ? "report shared" : "reports shared"} from ${sources[0].report_date} to ${sources[sources.length - 1].report_date}.`;
    const notes = [...evidence].map(([text, dates]) => {
      const date = dates.first === dates.last ? dates.first : `${dates.first}–${dates.last}`;
      return `${date}${dates.count > 1 ? ` (${dates.count} reports)` : ""}: ${text}`;
    });
    sections.push({
      id: `term-history-${type}`,
      heading,
      paragraphs: [
        {
          id: `term-history-${type}-value`,
          html: plainTextToReportParagraphHtml([countLine, ...notes].join("\n\n")),
        },
      ],
    });
    sectionMeta[heading] = { type: "term_history" };
  }
  return { sections, sectionMeta };
}

/** Preserve teacher-added paragraphs while refreshing the compiled first paragraph. */
export function mergeTermHistory(
  current: { sections: Section[]; sectionMeta: SectionMeta },
  built: { sections: Section[]; sectionMeta: SectionMeta }
) {
  const previous = new Map(
    current.sections
      .filter((section) => current.sectionMeta[section.heading]?.type === "term_history")
      .map((section) => [section.heading, section])
  );
  const sections = current.sections.filter(
    (section) => current.sectionMeta[section.heading]?.type !== "term_history"
  );
  const sectionMeta = Object.fromEntries(
    Object.entries(current.sectionMeta).filter(([, meta]) => meta.type !== "term_history")
  ) as SectionMeta;
  for (const section of built.sections) {
    const old = previous.get(section.heading);
    sections.push(
      old
        ? {
            ...old,
            paragraphs: [
              { ...(old.paragraphs[0] ?? section.paragraphs[0]), html: section.paragraphs[0].html },
              ...old.paragraphs.slice(1),
            ],
          }
        : section
    );
  }
  return { sections, sectionMeta: { ...sectionMeta, ...built.sectionMeta } };
}

/** Refresh just the sources chosen by the admin, retaining layout and teacher paragraphs. */
export async function refreshConfiguredTermHistory(
  db: SupabaseClient,
  scope: Parameters<typeof buildTermHistorySections>[1],
  sections: Section[],
  sectionMeta: SectionMeta
): Promise<Section[]> {
  const history = sections.filter(
    (section) => sectionMeta[section.heading]?.type === "term_history"
  );
  if (!history.length) return sections;
  const types = [
    ...new Set(
      history.map((section) => {
        const meta = sectionMeta[section.heading];
        return meta.type === "term_history" ? (meta.reportType ?? "incident") : "incident";
      })
    ),
  ];
  const built = await buildTermHistorySections(db, scope, types);
  return sections.map((section) => {
    const meta = sectionMeta[section.heading];
    if (meta?.type !== "term_history") return section;
    const source = built.sections.find(
      (item) => item.id === `term-history-${meta.reportType ?? "incident"}`
    );
    return {
      ...section,
      paragraphs: [
        {
          id: section.paragraphs[0]?.id ?? `${section.id}-value`,
          html: source?.paragraphs[0].html ?? "",
        },
        ...section.paragraphs.slice(1),
      ],
    };
  });
}
