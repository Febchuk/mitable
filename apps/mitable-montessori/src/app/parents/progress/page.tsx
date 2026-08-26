import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getParentPortalContext, selectedParentChild } from "@/lib/parents/portal";
import { createClient } from "@/utils/supabase/server";
import {
  PROGRESS_STATUSES,
  STATUS_LABEL,
  statusToMark,
  type ProgressStatus,
} from "@/lib/progress/marking-schemas";

function progressLabel(status: string): string {
  if (!PROGRESS_STATUSES.includes(status as ProgressStatus)) return status;
  return STATUS_LABEL[statusToMark(status as ProgressStatus)];
}

export default async function ParentProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ child?: string }>;
}) {
  const portal = await getParentPortalContext();
  if (!portal) redirect("/parents/login");
  const child = selectedParentChild(portal.children, (await searchParams).child);
  if (!child) notFound();

  const supabase = createClient(await cookies());
  const { data } = await supabase
    .from("student_progress")
    .select("status, updated_at, curriculum_subtopics(name, curriculum_topics(name))")
    .eq("student_id", child.id);

  const grouped = new Map<string, Array<{ name: string; status: string }>>();
  for (const row of data ?? []) {
    const progress = row as {
      status: string;
      curriculum_subtopics:
        | { name: string; curriculum_topics: { name: string } | { name: string }[] | null }
        | { name: string; curriculum_topics: { name: string } | { name: string }[] | null }[]
        | null;
    };
    const subtopic = Array.isArray(progress.curriculum_subtopics)
      ? progress.curriculum_subtopics[0]
      : progress.curriculum_subtopics;
    if (!subtopic) continue;
    const topic = Array.isArray(subtopic.curriculum_topics)
      ? subtopic.curriculum_topics[0]
      : subtopic.curriculum_topics;
    const items = grouped.get(topic?.name ?? "Other") ?? [];
    items.push({ name: subtopic.name, status: progress.status });
    grouped.set(topic?.name ?? "Other", items);
  }

  return (
    <div className="max-w-3xl">
      <p className="label-cap text-ink-muted">{child.name}</p>
      <h1 className="mt-1 font-display text-3xl">Progress</h1>
      {grouped.size === 0 ? (
        <p className="mt-7 text-sm text-ink-secondary">No progress has been logged yet.</p>
      ) : (
        <div className="mt-7 space-y-6">
          {Array.from(grouped.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([topic, items]) => (
              <section key={topic}>
                <h2 className="label-cap mb-2 text-ink-muted">{topic}</h2>
                <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                  {items.map((item) => (
                    <li
                      key={item.name}
                      className="flex items-center justify-between gap-4 px-5 py-3.5"
                    >
                      <span className="text-sm font-medium text-ink">{item.name}</span>
                      <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-ink-secondary">
                        {progressLabel(item.status)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </div>
      )}
    </div>
  );
}
