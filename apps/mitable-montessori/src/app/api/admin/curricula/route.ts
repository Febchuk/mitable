import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminWriteRoute } from "@/lib/admin/route-helper";
import { CreateCurriculumSchema, SetCurriculumActiveSchema } from "@/lib/schemas/admin";
import { createCurriculum, setCurriculumActive } from "@/lib/admin/crud";
import { requireAdmin } from "@/lib/api/admin-auth";
import { createClient } from "@/utils/supabase/server";
import { normalizeCurriculumFramework } from "@/lib/queries/curriculum-tree";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data, error } = await supabase
    .from("curricula")
    .select("id, name, framework, is_active")
    .eq("school_id", auth.user.schoolId)
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const curricula = (data ?? []).map((row) => ({
    ...row,
    framework: normalizeCurriculumFramework(row.framework as string),
  }));
  return NextResponse.json({ curricula });
}

export async function POST(req: Request) {
  return adminWriteRoute(
    req,
    CreateCurriculumSchema,
    "admin_create_curriculum",
    async (input, ctx) => {
      const id = await createCurriculum(ctx, input);
      return { id };
    }
  );
}

export async function PATCH(req: Request) {
  return adminWriteRoute(
    req,
    SetCurriculumActiveSchema,
    "admin_set_curriculum_active",
    async (input, ctx) => {
      await setCurriculumActive(ctx, input.curriculum_id, input.is_active);
      return { id: input.curriculum_id, meta: { is_active: input.is_active } };
    }
  );
}
