import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportTemplate, ReportKind } from "@/components/montessori/new-report/mock-data";
import type { SectionMeta, SectionMetaEntry } from "@/lib/report-templates/sections";
import { type ReportingPeriod } from "@/lib/report-templates/admin-dto";
import type { CurriculumStatus } from "@/lib/queries/curriculum";
import { encodeProgressTopic, type ProgressTopicRow } from "@/lib/reports/progress-topic-payload";

/** Legacy sentinel — still accepted when creating reports from old clients. */
export const DEFAULT_REPORT_TEMPLATE_ID = "__default__";

const DEFAULT_ID_PREFIX = "__default:";
const BUILTIN_ID_PREFIX = "__builtin:";

export type DefaultTemplateClassroom = { id: string; name: string };

export type ParsedDefaultReportTemplate = {
  classroomId: string | null;
  kind: ReportKind;
  reportingPeriod: ReportingPeriod;
};

const DEFAULT_KIND_META: Record<
  ReportKind,
  { reportingPeriod: ReportingPeriod; iconTone: ReportTemplate["iconTone"] }
> = {
  Daily: { reportingPeriod: "daily", iconTone: "butter" },
  Major: { reportingPeriod: "end_of_term", iconTone: "sage" },
  Incident: { reportingPeriod: "daily", iconTone: "blue" },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Built-in picker id — classroom is resolved from the child at create time. */
export function buildBuiltinReportTemplateId(kind: ReportKind): string {
  return `${BUILTIN_ID_PREFIX}${kind.toLowerCase()}`;
}

export function buildDefaultReportTemplateId(classroomId: string, kind: ReportKind): string {
  return `${DEFAULT_ID_PREFIX}${kind.toLowerCase()}:${classroomId}`;
}

export function isBuiltinReportTemplateId(id: string | null | undefined): boolean {
  return !!id && id.startsWith(BUILTIN_ID_PREFIX);
}

export function isDefaultReportTemplateId(id: string | null | undefined): boolean {
  if (!id) return false;
  if (id === DEFAULT_REPORT_TEMPLATE_ID) return true;
  if (id.startsWith(BUILTIN_ID_PREFIX)) return true;
  return id.startsWith(DEFAULT_ID_PREFIX);
}

export function parseBuiltinReportTemplateId(
  id: string | null | undefined
): (Omit<ParsedDefaultReportTemplate, "classroomId"> & { classroomId: null }) | null {
  if (!id?.startsWith(BUILTIN_ID_PREFIX)) return null;
  const kindRaw = id.slice(BUILTIN_ID_PREFIX.length);
  const kind =
    kindRaw === "daily"
      ? "Daily"
      : kindRaw === "major"
        ? "Major"
        : kindRaw === "incident"
          ? "Incident"
          : null;
  if (!kind) return null;
  return { classroomId: null, kind, reportingPeriod: DEFAULT_KIND_META[kind].reportingPeriod };
}

export function parseDefaultReportTemplateId(
  id: string | null | undefined
): ParsedDefaultReportTemplate | null {
  const builtin = parseBuiltinReportTemplateId(id);
  if (builtin) return builtin;
  if (!id || id === DEFAULT_REPORT_TEMPLATE_ID) return null;
  const match = id.match(/^__default:(daily|major|incident):(.+)$/i);
  if (!match) return null;
  const classroomId = match[2];
  if (!UUID_RE.test(classroomId)) return null;
  const kind = (match[1][0].toUpperCase() + match[1].slice(1)) as ReportKind;
  if (kind !== "Daily" && kind !== "Major" && kind !== "Incident") return null;
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
  if (kind === "Daily") return "Progress marked in the last day";
  if (kind === "Major") return "Progress since the current term started";
  return "Describe what happened — we'll draft the incident report";
}

/** Virtual template for the new-report type picker (one row per kind). */
export function buildBuiltinReportTemplate(kind: ReportKind): ReportTemplate {
  const meta = DEFAULT_KIND_META[kind];
  return {
    id: buildBuiltinReportTemplateId(kind),
    name: kind === "Major" ? "End-of-term" : kind,
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

export const BUILTIN_REPORT_TEMPLATES: ReportTemplate[] = (
  ["Daily", "Major", "Incident"] as ReportKind[]
).map((kind) => buildBuiltinReportTemplate(kind));

export function defaultReportTemplateForClassroom(
  _classrooms: DefaultTemplateClassroom[],
  _classroomId: string | null | undefined,
  kind: ReportKind = "Daily"
): ReportTemplate {
  return buildBuiltinReportTemplate(kind);
}

export function withDefaultReportTemplates(
  templates: ReportTemplate[],
  _classrooms: DefaultTemplateClassroom[]
): ReportTemplate[] {
  const rest = templates.filter((t) => !isDefaultReportTemplateId(t.id));
  return [...BUILTIN_REPORT_TEMPLATES, ...rest];
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

type SubjectDbRow = {
  id: string;
  name: string;
  sort_order: number;
  curriculum_topics: TopicDbRow[];
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

/** Pull the classroom curriculum tree (subjects → topics → subtopics) in display order. */
async function loadClassroomSubjects(
  supabase: SupabaseClient,
  classroomId: string
): Promise<SubjectDbRow[]> {
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
      "id, name, sort_order, curriculum_topics(id, name, sort_order, curriculum_subtopics(id, name, sort_order))"
    )
    .eq("curriculum_id", curriculumId);

  return [...(data ?? [])]
    .sort((a, b) => ((a.sort_order as number) ?? 0) - ((b.sort_order as number) ?? 0))
    .map((subj) => ({
      id: subj.id as string,
      name: subj.name as string,
      sort_order: (subj.sort_order as number) ?? 0,
      curriculum_topics: [...((subj.curriculum_topics as TopicDbRow[]) ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((t) => ({
          ...t,
          curriculum_subtopics: [...(t.curriculum_subtopics ?? [])].sort(
            (a, b) => a.sort_order - b.sort_order
          ),
        })),
    }));
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

function rowsForSubject(
  subject: SubjectDbRow,
  bySubtopic: Map<string, { status: CurriculumStatus; comment: string | null }>
): ProgressTopicRow[] {
  const rows: ProgressTopicRow[] = [];
  for (const topic of subject.curriculum_topics) {
    for (const st of topic.curriculum_subtopics) {
      const hit = bySubtopic.get(st.id);
      if (!hit || hit.status === "na") continue;
      rows.push({
        subtopicId: st.id,
        name: st.name,
        topicName: topic.name,
        status: hit.status as ProgressTopicRow["status"],
        comment: hit.comment,
      });
    }
  }
  return rows;
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
  const reportingPeriod = args.reportingPeriod ?? "daily";
  const subjects = await loadClassroomSubjects(supabase, args.classroomId);
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

  const subjectsWithActivity = subjects.filter((s) => rowsForSubject(s, bySubtopic).length > 0);

  if (subjectsWithActivity.length === 0) {
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
    for (const subject of subjectsWithActivity) {
      const gridHeading = subject.name;
      const gridSlug = sectionSlug(gridHeading, idx);
      const rows = rowsForSubject(subject, bySubtopic);
      sectionMeta[gridHeading] = { type: "progress_topic", topicId: subject.id };
      sections.push({
        id: `s-${idx}-${gridSlug}`,
        heading: gridHeading,
        paragraphs: [{ id: `p-${idx}-1`, html: encodeProgressTopic(rows) }],
      });
      idx++;

      const commentsHeading = topicCommentsHeading(subject.name);
      const commentsSlug = sectionSlug(commentsHeading, idx);
      sectionGuidance[commentsHeading] = commentSectionGuidance(subject.name);
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
  const subjects = await loadClassroomSubjects(supabase, args.classroomId);
  const subjectById = new Map(subjects.map((s) => [s.id, s] as const));
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
    const subject = subjectById.get(meta.topicId);
    if (!subject) {
      // Legacy: section keyed to a topic id instead of subject
      const topics = subjects.flatMap((s) => s.curriculum_topics);
      const topic = topics.find((t) => t.id === meta.topicId);
      if (!topic) return section;
      const rows = rowsForTopic(topic, bySubtopic);
      return {
        ...section,
        paragraphs: section.paragraphs.map((p, i) =>
          i === 0 ? { ...p, html: encodeProgressTopic(rows) } : p
        ),
      };
    }
    const rows = rowsForSubject(subject, bySubtopic);
    return {
      ...section,
      paragraphs: section.paragraphs.map((p, i) =>
        i === 0 ? { ...p, html: encodeProgressTopic(rows) } : p
      ),
    };
  });
}
