import { adminWriteRoute } from "@/lib/admin/route-helper";
import { CreateGuardianSchema } from "@/lib/schemas/admin";
import { createGuardian } from "@/lib/admin/crud";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { listParentAccess } from "@/lib/parents/access-directory";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    const parents = await listParentAccess(createAdminClient(), auth.user.schoolId);
    return NextResponse.json({ parents }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load parents" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  return adminWriteRoute(req, CreateGuardianSchema, "admin_create_guardian", async (input, ctx) => {
    const id = await createGuardian(ctx, input);
    return { id };
  });
}
