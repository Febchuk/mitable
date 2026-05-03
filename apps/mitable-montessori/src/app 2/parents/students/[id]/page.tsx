import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export default async function StudentHome({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/parents/login");

  const { data: student } = await supabase
    .from("students")
    .select("id, first_name, last_name, preferred_name, archived_at")
    .eq("id", id)
    .maybeSingle();
  if (!student || (student as { archived_at: string | null }).archived_at) notFound();

  const display =
    (student as { preferred_name: string | null }).preferred_name ||
    `${(student as { first_name: string }).first_name} ${(student as { last_name: string }).last_name}`;

  return (
    <div className="space-y-6 py-4">
      <header className="space-y-1">
        <Link href="/parents" className="text-xs text-ink/40">
          ← All children
        </Link>
        <h1 className="font-display text-2xl">{display}</h1>
      </header>
      <nav className="grid grid-cols-3 gap-2 text-center text-sm">
        <Link
          href={`/parents/students/${id}/attendance`}
          className="rounded-lg border border-ink/10 px-3 py-3 hover:bg-ink/5"
        >
          Attendance
        </Link>
        <Link
          href={`/parents/students/${id}/progress`}
          className="rounded-lg border border-ink/10 px-3 py-3 hover:bg-ink/5"
        >
          Progress
        </Link>
        <Link
          href={`/parents/students/${id}/reports`}
          className="rounded-lg border border-ink/10 px-3 py-3 hover:bg-ink/5"
        >
          Reports
        </Link>
      </nav>
    </div>
  );
}
