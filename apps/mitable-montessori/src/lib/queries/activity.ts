import { cookies } from "next/headers";
import { getCurrentUserContext } from "@/lib/app/active-classroom";
import { createClient } from "@/utils/supabase/server";
import { getAxesForSchool } from "./axes";
import type { AxisLevel } from "./whole-child";

export type CurriculumTransition = "introduced" | "practicing" | "mastered";

/** A teacher entry in the activity feed — either a curriculum or whole-child event. */
export type ActivityFeedEntry =
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
 * RLS on both source tables confines results to students the caller can see.
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

  const [eventsResp, obsResp, axes] = await Promise.all([
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
    getAxesForSchool(schoolId),
  ]);

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

  return [...curriculumEntries, ...wholeChildEntries].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
}
