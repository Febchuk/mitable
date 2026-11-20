type ActiveRow = { sort_order: number; is_active?: boolean };
type Topic = ActiveRow & { curriculum_subtopics: ActiveRow[] };
type Subject = ActiveRow & { curriculum_topics: Topic[] };

/** Hide archived rows from current curricula while retaining their historical references. */
export function activeCurriculumTree<T extends Subject>(subjects: T[]): T[] {
  return subjects
    .filter((subject) => subject.is_active !== false)
    .map((subject) => ({
      ...subject,
      curriculum_topics: (subject.curriculum_topics ?? [])
        .filter((topic) => topic.is_active !== false)
        .map((topic) => ({
          ...topic,
          curriculum_subtopics: (topic.curriculum_subtopics ?? []).filter(
            (lesson) => lesson.is_active !== false
          ),
        })),
    }));
}
