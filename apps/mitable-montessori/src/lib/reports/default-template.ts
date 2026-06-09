import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportTemplate, ReportKind } from "@/components/montessori/new-report/mock-data";
import type { SectionMeta, SectionMetaEntry } from "@/lib/report-templates/sections";
import { REPORTING_PERIOD_LABEL, type ReportingPeriod } from "@/lib/report-templates/admin-dto";
import type { CurriculumStatus } from "@/lib/queries/curriculum";
import { encodeProgressTopic, type ProgressTopicRow } from "@/lib/reports/progress-topic-payload";

/** Legacy sentinel — still accepted when creating reports from old clients. */
export const DEFAULT_REPORT_TEMPLATE_ID = "__default__";

const DEFAULT_ID_PREFIX = "__default:";
const DEFAULT_KINDS: ReportKind[] = ["Daily", "Major"];

export type DefaultTemplateClassroom = { id: string; name: string };

export type ParsedDefaultReportTemplate = {
  classroomId: string;
  kind: ReportKind;
  reportingPeriod: ReportingPeriod;
};

const DEFAULT_KIND_META: Record<
  ReportKind,
  { reportingPeriod: ReportingPeriod; iconTone: ReportTemplate["iconTone"] }
> = {
  Daily: { reportingPeriod: "daily", iconTone: "butter" },
  Major: { reportingPeriod: "weekly", iconTone: "sage" },
  Incident: { reportingPeriod: "daily", iconTone: "blue" },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildDefaultReportTemplateId(classroomId: string, kind: ReportKind): string {
  return `${DEFAULT_ID_PREFIX}${kind.toLowerCase()}:${classroomId}`;
}

export function isDefaultReportTemplateId(id: string | null | undefined): boolean {
  if (!id) return false;
  if (id === DEFAULT_REPORT_TEMPLATE_ID) return true;
  return id.startsWith(DEFAULT_ID_PREFIX);
}

export function parseDefaultReportTemplateId(
  id: string | null | undefined
): ParsedDefaultReportTemplate | null {
  if (!id || id === DEFAULT_REPORT_TEMPLATE_ID) return null;
  const match = id.match(/^__default:(daily|major):(.+)$/i);
  if (!match) return null;
  const classroomId = match[2];
  if (!UUID_RE.test(classroomId)) return null;
  const kind = (match[1][0].toUpperCase() + match[1].slice(1)) as ReportKind;
  if (kind !== "Daily" && kind !== "Major") return null;
  return {
    classroomId,
    kind,
    reportingPeriod: DEFAULT_KIND_META[kind].reportingPeriod,
  };
}

export function reportingPeriodForDefaultKind(kind: ReportKind): ReportingPeriod {
  return DEFAULT_KIND_META[kind].reportingPeriod;
}

function defaultKindLabelInName(kind: ReportKind): string {
  if (kind === "Major") return "End-of-term";
  return kind;
}

export function defaultReportTemplateName(className: string, kind: ReportKind): string {
  const label = className.trim() || "Classroom";
  return `${label} — ${defaultKindLabelInName(kind)}`;
}

export function defaultReportTemplateDescription(kind: ReportKind): string {
  const period = REPORTING_PERIOD_LABEL[DEFAULT_KIND_META[kind].reportingPeriod];
  return `Progress marks from this classroom · ${period} lookback`;
}

/** Virtual template pinned at the top of the picker for one classroom + kind. */
export function buildDefaultReportTemplate(
  classroom: DefaultTemplateClassroom,
  kind: ReportKind
): ReportTemplate {
  const meta = DEFAULT_KIND_META[kind];
  return {
    id: buildDefaultReportTemplateId(classroom.id, kind),
    name: defaultReportTemplateName(classroom.name, kind),
    description: defaultReportTemplateDescription(kind),
    kind,
    sections: ["Practical Life", "Practical Life — Comments"],
    sectionMeta: {
      "Practical Life": { type: "progress_topic", topicId: "__preview__" },
      "Practical Life — Comments": { type: "text" },
    },
    logoUrl: null,
    iconTone: meta.iconTone,
  };
}

/** Daily + end-of-term (Major) defaults for every classroom the teacher leads. */
export function buildDefaultReportTemplatesForClassrooms(
  classrooms: DefaultTemplateClassroom[]
): ReportTemplate[] {
  const sorted = [...classrooms].sort((a, b) => a.name.localeCompare(b.name));
  const out: ReportTemplate[] = [];
  for (const room of sorted) {
    for (const kind of DEFAULT_KINDS) {
      out.push(buildDefaultReportTemplate(room, kind));
    }
  }
  return out;
}

export function defaultReportTemplateForClassroom(
  classrooms: DefaultTemplateClassroom[],
  classroomId: string | null | undefined,
  kind: ReportKind = "Daily"
): ReportTemplate {
  const room = (classroomId ? classrooms.find((c) => c.id === classroomId) : null) ??
    classrooms[0] ?? { id: "unknown", name: "Classroom" };
  return buildDefaultReportTemplate(room, kind);
}

export function withDefaultReportTemplates(
  templates: ReportTemplate[],
  classrooms: DefaultTemplateClassroom[]
): ReportTemplate[] {
  const rest = templates.filter((t) => !isDefaultReportTemplateId(t.id));
  return [...buildDefaultReportTemplatesForClassrooms(classrooms), ...rest];
}

/** @deprecated Use withDefaultReportTemplates */
export function withDefaultReportTemplate(
  templates: ReportTemplate[],
  className: string
): ReportTemplate[] {
  return withDefaultReportTemplates(templates, [{ id: "unknown", name: className }]);
}

export function topicCommentsHeading(topicName: string): string {
  return `${topicName} — Comments`;
}

export { isTopicCommentsHeading } from "@/lib/reports/default-classroom-report";

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
    reportingPeriod?: ReportingPeriod;
  }
): Promise<DefaultTemplateBuildResult> {
  const reportingPeriod = args.reportingPeriod ?? "weekly";
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
    reportingPeriod,
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
