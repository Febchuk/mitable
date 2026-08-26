import { cookies } from "next/headers";
import { getCurrentUserContext } from "@/lib/app/active-classroom";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { getAxesForSchool } from "./axes";
import type { AxisLevel } from "./whole-child";
import { STUDENT_MEDIA_BUCKET, type StudentMediaKind } from "@/lib/media/constants";
import type { ProgressStatus } from "@/lib/progress/marking-schemas";

export type CurriculumTransition = ProgressStatus;

/** A teacher entry in the activity feed — either a curriculum or whole-child event. */
export type ReportStatus =
  | "draft"
  | "submitted_for_review"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "sent";

export type ActivityFeedEntry =
  | {
      kind: "progress";
      id: string;
      subtopicName: string;
      topicName: string;
      comment: string | null;
      transitionToStatus: ProgressStatus;
      authorName: string | null;
      createdAt: string;
      media: ActivityMediaAttachment[];
    }
  | {
      kind: "curriculum";
      id: string;
      subtopicName: string;
      topicName: string;
      comment: string;
      transitionToStatus: CurriculumTransition | null;
      authorName: string | null;
      createdAt: string;
    }
  | {
      kind: "whole-child";
      id: string;
      axisKey: string;
      axisLabel: string;
      fromLevel: AxisLevel | null;
      toLevel: AxisLevel | null;
      note: string;
      authorName: string | null;
      createdAt: string;
    }
  | {
      kind: "report";
      id: string;
      title: string | null;
      reportType: string;
      status: ReportStatus;
      authorName: string | null;
      createdAt: string;
    }
  | {
      kind: "comment";
      id: string;
      note: string;
      authorName: string | null;
      createdAt: string;
    };

export type ActivityMediaAttachment = {
  id: string;
  kind: StudentMediaKind;
  caption: string;
  url: string | null;
};

type CurriculumEventDbRow = {
  id: string;
  comment: string;
  transition_to_status: CurriculumTransition | null;
  created_at: string;
  curriculum_subtopics: {
    name: string;
    curriculum_topics: { name: string } | null;
  } | null;
  users: { first_name: string | null; last_name: string | null } | null;
};

type WholeChildObsDbRow = {
  id: string;
  axis_key: string;
  from_level: AxisLevel | null;
  to_level: AxisLevel | null;
  note: string;
  created_at: string;
  axes: { label: string } | null;
  users: { first_name: string | null; last_name: string | null } | null;
};

type ReportDbRow = {
  id: string;
  title: string | null;
  report_type: string;
  status: ReportStatus;
  created_at: string;
  users: { first_name: string | null; last_name: string | null } | null;
};

type StudentCommentDbRow = {
  id: string;
  comment: string;
  created_at: string;
  users: { first_name: string | null; last_name: string | null } | null;
};

type ProgressHistoryDbRow = {
  id: string;
  new_status: ProgressStatus;
  comment: string | null;
  changed_at: string;
  source_command_id: string | null;
  curriculum_subtopics: {
    name: string;
    curriculum_topics: { name: string } | null;
  } | null;
  users: { first_name: string | null; last_name: string | null } | null;
};

type MediaActivityDbRow = {
  id: string;
  kind: StudentMediaKind;
  caption: string;
  storage_path: string;
  progress_command_id: string | null;
};

function authorName(u: { first_name: string | null; last_name: string | null } | null) {
  if (!u) return null;
  return [u.first_name, u.last_name].filter(Boolean).join(" ") || null;
}

/**
 * Returns a unified activity feed for a student, ordered by created_at desc.
 * Pulls curriculum_events and whole_child_observations in parallel and merges
 * client-side — the row counts are small enough that DB-side UNION isn't worth
 * the schema gymnastics.
 *
 * Curriculum + whole-child use the cookie Supabase client (RLS). Reports use
 * the service-role client with the same school filter pattern as listReports:
 * we only read reports after confirming the caller can read this student row,
 * then filter by students.school_id so staff without users.school_id still see
 * the feed (RLS-only report SELECT was failing for those accounts).
 *
 * `axes` doesn't have an FK from whole_child_observations.axis_key (axes are
 * keyed by `key` text, not `id`), so the join below is a manual lookup against
 * the school's axes table.
 */
export async function listActivityFeed(studentId: string): Promise<ActivityFeedEntry[]> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // Cached per request — reuses the layout's user-context fetch.
  const ctx = await getCurrentUserContext();
  const schoolId = ctx?.schoolId ?? null;

  const [studentResp, eventsResp, obsResp, commentsResp, progressResp, mediaResp, axes] =
    await Promise.all([
      supabase.from("students").select("school_id").eq("id", studentId).maybeSingle(),
      supabase
        .from("curriculum_events")
        .select(
          "id, comment, transition_to_status, created_at, " +
            "curriculum_subtopics(name, curriculum_topics(name)), " +
            "users:author_user_id(first_name, last_name)"
        )
        .eq("student_id", studentId)
        .order("created_at", { ascending: false })
        .limit(100)
        .returns<CurriculumEventDbRow[]>(),
      supabase
        .from("whole_child_observations")
        .select(
          "id, axis_key, from_level, to_level, note, created_at, " +
            "users:author_user_id(first_name, last_name)"
        )
        .eq("student_id", studentId)
        .order("created_at", { ascending: false })
        .limit(100)
        .returns<Omit<WholeChildObsDbRow, "axes">[]>(),
      supabase
        .from("student_comments")
        .select("id, comment, created_at, users:created_by_user_id(first_name, last_name)")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false })
        .limit(100)
        .returns<StudentCommentDbRow[]>(),
      supabase
        .from("student_progress_history")
        .select(
          "id, new_status, comment, changed_at, source_command_id, " +
            "curriculum_subtopics(name, curriculum_topics(name)), " +
            "users:changed_by_user_id(first_name, last_name)"
        )
        .eq("student_id", studentId)
        .order("changed_at", { ascending: false })
        .limit(100)
        .returns<ProgressHistoryDbRow[]>(),
      supabase
        .from("student_media")
        .select("id, kind, caption, storage_path, progress_command_id")
        .eq("student_id", studentId)
        .not("progress_command_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(100)
        .returns<MediaActivityDbRow[]>(),
      getAxesForSchool(schoolId),
    ]);

  const studentSchoolId = (studentResp.data?.school_id as string | undefined) ?? null;

  const admin = createAdminClient();
  const mediaByCommandId = new Map<string, ActivityMediaAttachment[]>();
  await Promise.all(
    (mediaResp.data ?? []).map(async (media) => {
      if (!media.progress_command_id) return;
      const { data: signed } = await admin.storage
        .from(STUDENT_MEDIA_BUCKET)
        .createSignedUrl(media.storage_path, 60 * 60);
      const attachments = mediaByCommandId.get(media.progress_command_id) ?? [];
      attachments.push({
        id: media.id,
        kind: media.kind,
        caption: media.caption,
        url: signed?.signedUrl ?? null,
      });
      mediaByCommandId.set(media.progress_command_id, attachments);
    })
  );
  const reportsResult =
    studentSchoolId != null
      ? await admin
          .from("reports")
          .select(
            "id, title, report_type, status, created_at, students!inner(school_id), " +
              "users:created_by_user_id(first_name, last_name)"
          )
          .eq("student_id", studentId)
          .eq("students.school_id", studentSchoolId)
          .order("created_at", { ascending: false })
          .limit(100)
      : { data: [] as ReportDbRow[], error: null as null };

  const axisLabels = new Map(axes.map((a) => [a.key, a.label]));

  const curriculumEntries: ActivityFeedEntry[] = (eventsResp.data ?? []).map((e) => ({
    kind: "curriculum",
    id: e.id,
    subtopicName: e.curriculum_subtopics?.name ?? "Subtopic",
    topicName: e.curriculum_subtopics?.curriculum_topics?.name ?? "—",
    comment: e.comment,
    transitionToStatus: e.transition_to_status,
    authorName: authorName(e.users),
    createdAt: e.created_at,
  }));

  const progressEntries: ActivityFeedEntry[] = (progressResp.data ?? []).map((p) => ({
    kind: "progress",
    id: p.id,
    subtopicName: p.curriculum_subtopics?.name ?? "Activity",
    topicName: p.curriculum_subtopics?.curriculum_topics?.name ?? "Curriculum",
    comment: p.comment,
    transitionToStatus: p.new_status,
    authorName: authorName(p.users),
    createdAt: p.changed_at,
    media: p.source_command_id ? (mediaByCommandId.get(p.source_command_id) ?? []) : [],
  }));

  const wholeChildEntries: ActivityFeedEntry[] = (obsResp.data ?? []).map((o) => ({
    kind: "whole-child",
    id: o.id,
    axisKey: o.axis_key,
    axisLabel: axisLabels.get(o.axis_key) ?? o.axis_key,
    fromLevel: o.from_level,
    toLevel: o.to_level,
    note: o.note,
    authorName: authorName(o.users),
    createdAt: o.created_at,
  }));

  const reportRows: ReportDbRow[] =
    reportsResult.error != null ? [] : ((reportsResult.data ?? []) as ReportDbRow[]);
  const reportEntries: ActivityFeedEntry[] = reportRows.map((r) => ({
    kind: "report",
    id: r.id,
    title: r.title,
    reportType: r.report_type,
    status: r.status,
    authorName: authorName(r.users),
    createdAt: r.created_at,
  }));

  const commentEntries: ActivityFeedEntry[] = (commentsResp.data ?? []).map((c) => ({
    kind: "comment",
    id: c.id,
    note: c.comment,
    authorName: authorName(c.users),
    createdAt: c.created_at,
  }));

  return [
    ...progressEntries,
    ...curriculumEntries,
    ...wholeChildEntries,
    ...reportEntries,
    ...commentEntries,
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
