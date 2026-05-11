import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireUser } from "@/lib/api/auth";

export type IepPlanComment = {
  id: string;
  itemId: string;
  body: string;
  authorId: string | null;
  createdAt: string;
};

export type IepPlanItem = {
  id: string;
  domainId: string;
  name: string;
  position: number;
  rating: number | null;
  successCount: number | null;
  promptingCode: "N" | "G" | "V" | "H" | "F" | null;
  updatedAt: string | null;
  comments: IepPlanComment[];
};

export type IepPlanDomain = {
  id: string;
  name: string;
  position: number;
  items: IepPlanItem[];
};

/**
 * Loads the full IEP plan for one child with current state + comments per
 * item. Mirrors the shape the teacher view used to compute from in-memory
 * seeds. Auth: teacher must be able to see this student via RLS; admin must
 * be in the same school.
 */
export async function GET(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const studentId = url.searchParams.get("studentId");
  if (!studentId) {
    return NextResponse.json({ error: "studentId required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: student } = await supabase
    .from("students")
    .select("id, school_id")
    .eq("id", studentId)
    .maybeSingle();
  if (!student || (student.school_id as string) !== auth.user.schoolId) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  const [{ data: domainRows }, { data: itemRows }, { data: stateRows }, { data: commentRows }] =
    await Promise.all([
      supabase
        .from("iep_domains")
        .select("id, name, position")
        .eq("student_id", studentId)
        .is("archived_at", null)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("iep_items")
        .select("id, domain_id, name, position")
        .eq("student_id", studentId)
        .is("archived_at", null)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("iep_item_states")
        .select("item_id, rating, success_count, prompting_code, updated_at")
        .eq("student_id", studentId),
      supabase
        .from("iep_comments")
        .select("id, item_id, body, author_id, created_at")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false }),
    ]);

  const stateByItem = new Map<
    string,
    {
      rating: number | null;
      successCount: number | null;
      promptingCode: string | null;
      updatedAt: string | null;
    }
  >();
  for (const r of stateRows ?? []) {
    stateByItem.set(r.item_id as string, {
      rating: (r.rating as number | null) ?? null,
      successCount: (r.success_count as number | null) ?? null,
      promptingCode: (r.prompting_code as string | null) ?? null,
      updatedAt: (r.updated_at as string | null) ?? null,
    });
  }
  const commentsByItem = new Map<string, IepPlanComment[]>();
  for (const c of commentRows ?? []) {
    const arr = commentsByItem.get(c.item_id as string) ?? [];
    arr.push({
      id: c.id as string,
      itemId: c.item_id as string,
      body: c.body as string,
      authorId: (c.author_id as string | null) ?? null,
      createdAt: c.created_at as string,
    });
    commentsByItem.set(c.item_id as string, arr);
  }

  const itemsByDomain = new Map<string, IepPlanItem[]>();
  for (const it of itemRows ?? []) {
    const state = stateByItem.get(it.id as string);
    const item: IepPlanItem = {
      id: it.id as string,
      domainId: it.domain_id as string,
      name: it.name as string,
      position: (it.position as number) ?? 0,
      rating: state?.rating ?? null,
      successCount: state?.successCount ?? null,
      promptingCode: (state?.promptingCode as IepPlanItem["promptingCode"]) ?? null,
      updatedAt: state?.updatedAt ?? null,
      comments: commentsByItem.get(it.id as string) ?? [],
    };
    const arr = itemsByDomain.get(it.domain_id as string) ?? [];
    arr.push(item);
    itemsByDomain.set(it.domain_id as string, arr);
  }

  const plan: IepPlanDomain[] = (domainRows ?? []).map((d) => ({
    id: d.id as string,
    name: d.name as string,
    position: (d.position as number) ?? 0,
    items: itemsByDomain.get(d.id as string) ?? [],
  }));
  return NextResponse.json({ domains: plan });
}
