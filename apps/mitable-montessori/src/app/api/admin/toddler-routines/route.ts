import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-auth";
import { auditLog } from "@/lib/audit/log";
import { ensureDefaultToddlerRoutines, isToddlerRoutineCategory } from "@/lib/toddler-routines";
import { createAdminClient } from "@/utils/supabase/admin";

function rowToDto(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    category: row.category as string,
    label: row.label as string,
    sortOrder: row.sort_order as number,
    isActive: row.is_active as boolean,
  };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const supabase = createAdminClient();
  await ensureDefaultToddlerRoutines(supabase, auth.user.schoolId);
  const { data, error } = await supabase
    .from("toddler_routine_options")
    .select("id, category, label, sort_order, is_active")
    .eq("school_id", auth.user.schoolId)
    .order("category")
    .order("sort_order")
    .order("label");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ options: (data ?? []).map(rowToDto) });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  if (!isToddlerRoutineCategory(body?.category) || !label || label.length > 120) {
    return NextResponse.json({ error: "Choose a section and enter a name" }, { status: 400 });
  }
  const supabase = createAdminClient();
  const { data: last } = await supabase
    .from("toddler_routine_options")
    .select("sort_order")
    .eq("school_id", auth.user.schoolId)
    .eq("category", body.category)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from("toddler_routine_options")
    .insert({
      school_id: auth.user.schoolId,
      category: body.category,
      label,
      sort_order: ((last?.sort_order as number | undefined) ?? 0) + 10,
    })
    .select("id, category, label, sort_order, is_active")
    .single();
  if (error) {
    const duplicate = error.code === "23505";
    return NextResponse.json(
      { error: duplicate ? "That option already exists" : error.message },
      { status: duplicate ? 409 : 500 }
    );
  }
  await auditLog({
    actor_id: auth.user.userId,
    actor_role: "admin",
    action: "toddler_routine_option.create",
    target_table: "toddler_routine_options",
    target_id: data.id as string,
    metadata: { category: body.category, label },
  });
  return NextResponse.json({ option: rowToDto(data) });
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const id = typeof body?.id === "string" ? body.id : "";
  const update: Record<string, unknown> = {};
  if (typeof body?.label === "string") {
    const label = body.label.trim();
    if (!label || label.length > 120) {
      return NextResponse.json({ error: "Enter a name" }, { status: 400 });
    }
    update.label = label;
  }
  if (typeof body?.isActive === "boolean") update.is_active = body.isActive;
  if (typeof body?.sortOrder === "number" && Number.isInteger(body.sortOrder)) {
    update.sort_order = body.sortOrder;
  }
  if (!id || Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("toddler_routine_options")
    .update(update)
    .eq("id", id)
    .eq("school_id", auth.user.schoolId)
    .select("id, category, label, sort_order, is_active")
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.code === "23505" ? "That option already exists" : "Option not found" },
      { status: error?.code === "23505" ? 409 : 404 }
    );
  }
  await auditLog({
    actor_id: auth.user.userId,
    actor_role: "admin",
    action: "toddler_routine_option.update",
    target_table: "toddler_routine_options",
    target_id: id,
    metadata: update,
  });
  return NextResponse.json({ option: rowToDto(data) });
}
