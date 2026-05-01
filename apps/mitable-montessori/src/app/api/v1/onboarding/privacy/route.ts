import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { auditLog } from "@/lib/audit/log";

export async function POST() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("users")
    .update({ privacy_acknowledged_at: now })
    .eq("id", user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // Best-effort audit; we don't know the role here without another query — pass 'system'.
  await auditLog({
    actor_id: user.id,
    actor_role: "system",
    action: "privacy_acknowledged",
    target_table: "users",
    target_id: user.id,
  });
  return NextResponse.json({ acknowledged_at: now });
}
