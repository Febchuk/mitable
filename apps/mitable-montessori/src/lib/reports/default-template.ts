import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportTemplate } from "@/components/montessori/new-report/mock-data";
import type { SectionMeta, SectionMetaEntry } from "@/lib/report-templates/sections";
import { DEFAULT_REPORTING_PERIOD, type ReportingPeriod } from "@/lib/report-templates/admin-dto";
import type { CurriculumStatus } from "@/lib/queries/curriculum";
import { encodeProgressTopic, type ProgressTopicRow } from "@/lib/reports/progress-topic-payload";

/** Sentinel id — always injected client-side; never stored in report_templates. */
export const DEFAULT_REPORT_TEMPLATE_ID = "__default__";

export function isDefaultReportTemplateId(id: string | null | undefined): boolean {
  return id === DEFAULT_REPORT_TEMPLATE_ID;
}

export function defaultReportTemplateName(className: string): string {
  const label = className.trim() || "Classroom";
  return `Default report - ${label}`;
}

/** Virtual template pinned at the top of the picker for the active classroom. */
export function buildDefaultReportTemplate(className: string): ReportTemplate {
  return {
    id: DEFAULT_REPORT_TEMPLATE_ID,
    name: defaultReportTemplateName(className),
    description: "Progress marks from this classroom, grouped by topic",
    kind: "Major",
    sections: ["Practical Life", "Practical Life — Comments"],
    sectionMeta: {
      "Practical Life": { type: "progress_topic", topicId: "__preview__" },
      "Practical Life — Comments": { type: "text" },
    },
    logoUrl: null,
    iconTone: "sage",
  };
}

export function withDefaultReportTemplate(
  templates: ReportTemplate[],
  className: string
): ReportTemplate[] {
  const rest = templates.filter((t) => t.id !== DEFAULT_REPORT_TEMPLATE_ID);
  return [buildDefaultReportTemplate(className), ...rest];
}

export function topicCommentsHeading(topicName: string): string {
  return `${topicName} — Comments`;
}

export function isTopicCommentsHeading(heading: string): boolean {
  return heading.endsWith(" — Comments");
}

export function commentSectionGuidance(topicName: string): string {
  return `Write 1–2 warm paragraphs about ${topicName} for this child during the report period. Use progress marks and teacher notes from the read tools. Reference specific materials by token when you can. If nothing was captured for this area, say so in one honest sentence.`;
}

type ReportSection = {
  id: string;
  heading: string;
  paragraphs: { id: string; html: string }[];
};

type TopicDbRow = {
  id: string;
  name: string;
  sort_order: number;
  curriculum_subtopics: Array<{ id: string; name: string; sort_order: number }>;
};

type HistoryRow = {
  curriculum_subtopic_id: string;
  new_status: string | null;
  comment: string | null;
  changed_at: string;
};

const ACTIVE_STATUSES = new Set(["introduced", "practicing", "mastered"]);

function sectionSlug(heading: string, i: number): string {
  return (
    heading
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || `section-${i}`
  );
}

/** Pull the classroom curriculum tree (topics → subtopics) in display order. */
async function loadClassroomTopics(
  supabase: SupabaseClient,
  classroomId: string
): Promise<TopicDbRow[]> {
  const { data: classroom } = await supabase
    .from("classrooms")
    .select("curriculum_id")
    .eq("id", classroomId)
    .maybeSingle();
  const curriculumId = (classroom?.curriculum_id as string | null) ?? null;
  if (!curriculumId) return [];

  const { data } = await supabase
    .from("curriculum_subjects")
    .select(
      "id, sort_order, curriculum_topics(id, name, sort_order, curriculum_subtopics(id, name, sort_order))"
    )
    .eq("curriculum_id", curriculumId);

  const topics: TopicDbRow[] = [];
  const subjects = [...(data ?? [])].sort(
    (a, b) => ((a.sort_order as number) ?? 0) - ((b.sort_order as number) ?? 0)
  );
  for (const subj of subjects) {
    const topicList = [...((subj.curriculum_topics as TopicDbRow[]) ?? [])].sort(
      (a, b) => a.sort_order - b.sort_order
    );
    for (const t of topicList) {
      topics.push({
        ...t,
        curriculum_subtopics: [...(t.curriculum_subtopics ?? [])].sort(
          (a, b) => a.sort_order - b.sort_order
        ),
      });
    }
  }
  return topics;
}

/** Latest I/P/M mark per subtopic within the report window. */
async function loadPeriodProgressBySubtopic(
  supabase: SupabaseClient,
  studentId: string,
  periodStart: string,
  periodEnd: string
): Promise<Map<string, { status: CurriculumStatus; comment: string | null }>> {
  const periodEndDay = `${periodEnd}T23:59:59.999`;
  const { data } = await supabase
    .from("student_progress_history")
    .select("curriculum_subtopic_id, new_status, comment, changed_at")
    .eq("student_id", studentId)
    .gte("changed_at", periodStart)
    .lte("changed_at", periodEndDay)
    .order("changed_at", { ascending: true });

  const out = new Map<string, { status: CurriculumStatus; comment: string | null }>();
  for (const row of (data ?? []) as HistoryRow[]) {
    const status = row.new_status;
    if (!status || !ACTIVE_STATUSES.has(status)) continue;
    const comment = row.comment?.trim() || null;
    out.set(row.curriculum_subtopic_id, {
      status: status as CurriculumStatus,
      comment,
    });
  }
  return out;
}

function rowsForTopic(
  topic: TopicDbRow,
  bySubtopic: Map<string, { status: CurriculumStatus; comment: string | null }>
): ProgressTopicRow[] {
  const rows: ProgressTopicRow[] = [];
  for (const st of topic.curriculum_subtopics) {
    const hit = bySubtopic.get(st.id);
    if (!hit || hit.status === "na") continue;
    rows.push({
      subtopicId: st.id,
      name: st.name,
      status: hit.status as ProgressTopicRow["status"],
      comment: hit.comment,
    });
  }
  return rows;
}

export type DefaultTemplateBuildResult = {
  sections: ReportSection[];
  sectionMeta: SectionMeta;
  sectionGuidance: Record<string, string>;
  reportingPeriod: ReportingPeriod;
};

/**
 * Build report sections for the classroom default report template.
 * Grid sections are filled from progress history; comment sections start empty
 * for the drafting agent.
 */
export async function buildDefaultReportSections(
  supabase: SupabaseClient,
  args: {
    classroomId: string;
    studentId: string;
    periodStart: string;
    periodEnd: string;
  }
): Promise<DefaultTemplateBuildResult> {
  const topics = await loadClassroomTopics(supabase, args.classroomId);
  const bySubtopic = await loadPeriodProgressBySubtopic(
    supabase,
    args.studentId,
    args.periodStart,
    args.periodEnd
  );

  const sections: ReportSection[] = [];
  const sectionMeta: SectionMeta = {};
  const sectionGuidance: Record<string, string> = {};
  let idx = 0;

  const topicsWithActivity = topics.filter((t) => rowsForTopic(t, bySubtopic).length > 0);

  if (topicsWithActivity.length === 0) {
    const heading = "Curriculum progress";
    const slug = sectionSlug(heading, idx);
    sectionMeta[heading] = { type: "progress_topic", topicId: "__none__" };
    sections.push({
      id: `s-${idx}-${slug}`,
      heading,
      paragraphs: [{ id: `p-${idx}-1`, html: encodeProgressTopic([]) }],
    });
    idx++;
  } else {
    for (const topic of topicsWithActivity) {
      const gridHeading = topic.name;
      const gridSlug = sectionSlug(gridHeading, idx);
      const rows = rowsForTopic(topic, bySubtopic);
      sectionMeta[gridHeading] = { type: "progress_topic", topicId: topic.id };
      sections.push({
        id: `s-${idx}-${gridSlug}`,
        heading: gridHeading,
        paragraphs: [{ id: `p-${idx}-1`, html: encodeProgressTopic(rows) }],
      });
      idx++;

      const commentsHeading = topicCommentsHeading(topic.name);
      const commentsSlug = sectionSlug(commentsHeading, idx);
      sectionGuidance[commentsHeading] = commentSectionGuidance(topic.name);
      sections.push({
        id: `s-${idx}-${commentsSlug}`,
        heading: commentsHeading,
        paragraphs: [{ id: `p-${idx}-1`, html: "" }],
      });
      idx++;
    }
  }

  return {
    sections,
    sectionMeta,
    sectionGuidance,
    reportingPeriod: DEFAULT_REPORTING_PERIOD,
  };
}

/** Re-query progress history and refresh grid section paragraphs in-place. */
export async function refreshDefaultTemplateProgressSections(
  supabase: SupabaseClient,
  args: {
    classroomId: string;
    studentId: string;
    periodStart: string;
    periodEnd: string;
    sections: ReportSection[];
    sectionMeta: SectionMeta;
  }
): Promise<ReportSection[]> {
  const topics = await loadClassroomTopics(supabase, args.classroomId);
  const topicById = new Map(topics.map((t) => [t.id, t] as const));
  const bySubtopic = await loadPeriodProgressBySubtopic(
    supabase,
    args.studentId,
    args.periodStart,
    args.periodEnd
  );

  return args.sections.map((section) => {
    const meta = args.sectionMeta[section.heading] as SectionMetaEntry | undefined;
    if (meta?.type !== "progress_topic") return section;
    if (meta.topicId === "__none__") {
      return {
        ...section,
        paragraphs: section.paragraphs.map((p, i) =>
          i === 0 ? { ...p, html: encodeProgressTopic([]) } : p
        ),
      };
    }
    const topic = topicById.get(meta.topicId);
    if (!topic) return section;
    const rows = rowsForTopic(topic, bySubtopic);
    return {
      ...section,
      paragraphs: section.paragraphs.map((p, i) =>
        i === 0 ? { ...p, html: encodeProgressTopic(rows) } : p
      ),
    };
  });
}
