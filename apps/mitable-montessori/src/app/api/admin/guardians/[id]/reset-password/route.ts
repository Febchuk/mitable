import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { passwordResetCallbackUrl } from "@/lib/auth/password-reset";
import { getAppUrl } from "@/lib/utils/app-url";
import { auditLog } from "@/lib/audit/log";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const db = createAdminClient();
  const { data: guardian, error } = await db
    .from("guardians")
    .select("id, email, auth_user_id")
    .eq("id", id)
    .eq("school_id", auth.user.schoolId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not load parent" }, { status: 500 });
  if (!guardian) return NextResponse.json({ error: "Parent not found" }, { status: 404 });
  if (!guardian.auth_user_id || !guardian.email)
    return NextResponse.json(
      { error: "This parent needs an invitation before a password reset" },
      { status: 409 }
    );
  const { data: account, error: accountError } = await db.auth.admin.getUserById(
    guardian.auth_user_id
  );
  if (
    accountError ||
    !account.user ||
    account.user.email?.toLowerCase() !== guardian.email.trim().toLowerCase()
  ) {
    return NextResponse.json(
      {
        error:
          "The saved parent email does not match a linked account. Check their details before resetting access.",
      },
      { status: 409 }
    );
  }
  const { error: resetError } = await db.auth.resetPasswordForEmail(account.user.email!, {
    redirectTo: passwordResetCallbackUrl(getAppUrl(req), "parent"),
  });
  if (resetError) return NextResponse.json({ error: resetError.message }, { status: 500 });
  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: "admin_reset_parent_password",
    target_table: "guardians",
    target_id: id,
  });
  return NextResponse.json({ ok: true });
}
