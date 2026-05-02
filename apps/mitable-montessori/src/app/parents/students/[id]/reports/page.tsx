import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export default async function ReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/parents/login");

  const { data: reports } = await supabase
    .from("reports")
    .select("id, report_type, period_start, period_end, title, body, sent_at")
    .eq("student_id", id)
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(50);

  const list = (reports ?? []) as Array<{
    id: string;
    report_type: "daily" | "major";
    period_start: string | null;
    period_end: string | null;
    title: string | null;
    body: string | null;
    sent_at: string | null;
  }>;

  return (
    <div className="space-y-4 py-4">
      <h2 className="font-display text-xl">Reports</h2>
      {list.length === 0 ? (
        <p className="text-sm text-ink/50">
          No reports sent to you yet. They&apos;ll appear here once approved by the school.
        </p>
      ) : (
        <ul className="space-y-3">
          {list.map((r) => (
            <li key={r.id} className="rounded-lg border border-ink/10 bg-canvas p-4 shadow-sm">
              <header className="flex items-baseline justify-between gap-2">
                <h3 className="font-display text-base">{r.title ?? "(untitled)"}</h3>
                <span className="text-[11px] uppercase tracking-wide text-ink/40">
                  {r.report_type}
                </span>
              </header>
              {r.period_start && r.period_end ? (
                <p className="mt-1 text-[11px] text-ink/50">
                  {r.period_start} → {r.period_end}
                </p>
              ) : null}
              {r.body ? (
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{r.body}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
