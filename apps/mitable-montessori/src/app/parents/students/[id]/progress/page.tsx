import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export default async function ProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/parents/login");

  const { data: rows } = await supabase
    .from("student_progress")
    .select("status, updated_at, curriculum_subtopics(name, curriculum_topics(name))")
    .eq("student_id", id);

  const grouped = new Map<string, Array<{ name: string; status: string }>>();
  for (const row of rows ?? []) {
    const r = row as {
      status: string;
      curriculum_subtopics:
        | { name: string; curriculum_topics: { name: string } | { name: string }[] | null }
        | { name: string; curriculum_topics: { name: string } | { name: string }[] | null }[]
        | null;
    };
    const sub = Array.isArray(r.curriculum_subtopics)
      ? r.curriculum_subtopics[0]
      : r.curriculum_subtopics;
    if (!sub) continue;
    const topic = Array.isArray(sub.curriculum_topics)
      ? sub.curriculum_topics[0]
      : sub.curriculum_topics;
    const topicName = topic?.name ?? "Other";
    const list = grouped.get(topicName) ?? [];
    list.push({ name: sub.name, status: r.status });
    grouped.set(topicName, list);
  }

  const sections = Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="space-y-6 py-4">
      <h2 className="font-display text-xl">Progress</h2>
      {sections.length === 0 ? (
        <p className="text-sm text-ink/50">No progress logged yet.</p>
      ) : (
        sections.map(([topic, items]) => (
          <section key={topic} className="space-y-2">
            <h3 className="font-display text-sm uppercase tracking-wide text-ink/40">{topic}</h3>
            <ul className="divide-y divide-ink/5 rounded-lg border border-ink/10">
              {items.map((it) => (
                <li
                  key={it.name}
                  className="flex items-center justify-between gap-3 px-4 py-2 text-sm"
                >
                  <span>{it.name}</span>
                  <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs">{it.status}</span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
