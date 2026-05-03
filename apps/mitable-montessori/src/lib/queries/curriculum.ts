import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export type CurriculumStatus = "introduced" | "practicing" | "mastered" | "na";

export type SubtopicProgress = {
  subtopicId: string;
  name: string;
  topicName: string;
  status: CurriculumStatus;
  comment: string | null;
  /** ISO date the subtopic first transitioned into each status. */
  introducedAt: string | null;
  practicingAt: string | null;
  masteredAt: string | null;
  updatedAt: string;
};

export type CurriculumByTopic = {
  topicId: string;
  topicName: string;
  subtopics: SubtopicProgress[];
};

type ProgressRow = {
  id: string;
  curriculum_subtopic_id: string;
  status: CurriculumStatus;
  comment: string | null;
  updated_at: string;
  curriculum_subtopics: {
    id: string;
    name: string;
    sort_order: number;
    topic_id: string;
    curriculum_topics: { id: string; name: string; sort_order: number } | null;
  } | null;
};

type HistoryRow = {
  curriculum_subtopic_id: string;
  new_status: CurriculumStatus | null;
  changed_at: string;
};

/** Returns the curriculum tree (topic → subtopics) with the student's progress merged in. */
export async function listCurriculumProgress(studentId: string): Promise<CurriculumByTopic[]> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [progressResp, historyResp] = await Promise.all([
    supabase
      .from("student_progress")
      .select(
        "id, curriculum_subtopic_id, status, comment, updated_at, curriculum_subtopics(id, name, sort_order, topic_id, curriculum_topics(id, name, sort_order))"
      )
      .eq("student_id", studentId)
      .returns<ProgressRow[]>(),
    supabase
      .from("student_progress_history")
      .select("curriculum_subtopic_id, new_status, changed_at")
      .eq("student_id", studentId)
      .order("changed_at", { ascending: true })
      .returns<HistoryRow[]>(),
  ]);

  // Build a "first time we saw status X" map per subtopic.
  type FirstSeen = Partial<Record<CurriculumStatus, string>>;
  const firstSeen = new Map<string, FirstSeen>();
  for (const h of historyResp.data ?? []) {
    if (!h.new_status) continue;
    const prev = firstSeen.get(h.curriculum_subtopic_id) ?? {};
    if (!prev[h.new_status]) {
      prev[h.new_status] = h.changed_at;
      firstSeen.set(h.curriculum_subtopic_id, prev);
    }
  }

  // Group by topic.
  const byTopic = new Map<string, CurriculumByTopic>();
  for (const row of progressResp.data ?? []) {
    const sub = row.curriculum_subtopics;
    const topic = sub?.curriculum_topics;
    if (!sub || !topic) continue;

    const seen = firstSeen.get(row.curriculum_subtopic_id) ?? {};
    const subProgress: SubtopicProgress = {
      subtopicId: sub.id,
      name: sub.name,
      topicName: topic.name,
      status: row.status,
      comment: row.comment,
      introducedAt: seen.introduced ?? null,
      practicingAt: seen.practicing ?? null,
      masteredAt: seen.mastered ?? null,
      updatedAt: row.updated_at,
    };

    const existing = byTopic.get(topic.id);
    if (existing) {
      existing.subtopics.push(subProgress);
    } else {
      byTopic.set(topic.id, {
        topicId: topic.id,
        topicName: topic.name,
        subtopics: [subProgress],
      });
    }
  }

  // Sort topics by their sort_order (we need to look it up — pull from any row).
  const topicSortOrder = new Map<string, number>();
  for (const row of progressResp.data ?? []) {
    const topic = row.curriculum_subtopics?.curriculum_topics;
    if (topic) topicSortOrder.set(topic.id, topic.sort_order);
  }
  const subtopicSortOrder = new Map<string, number>();
  for (const row of progressResp.data ?? []) {
    const sub = row.curriculum_subtopics;
    if (sub) subtopicSortOrder.set(sub.id, sub.sort_order);
  }

  const result = Array.from(byTopic.values()).sort(
    (a, b) => (topicSortOrder.get(a.topicId) ?? 0) - (topicSortOrder.get(b.topicId) ?? 0)
  );
  for (const t of result) {
    t.subtopics.sort(
      (a, b) =>
        (subtopicSortOrder.get(a.subtopicId) ?? 0) - (subtopicSortOrder.get(b.subtopicId) ?? 0)
    );
  }
  return result;
}
