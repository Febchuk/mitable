import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminWriteRoute } from "@/lib/admin/route-helper";
import {
  CreateSchoolTermSchema,
  UpdateSchoolTermSchema,
  DeleteSchoolTermSchema,
} from "@/lib/schemas/admin";
import { createSchoolTerm, updateSchoolTerm, deleteSchoolTerm } from "@/lib/admin/crud";
import { requireAdmin } from "@/lib/api/admin-auth";
import { createClient } from "@/utils/supabase/server";
import { listSchoolTerms } from "@/lib/queries/school-terms";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  try {
    const terms = await listSchoolTerms(supabase, auth.user.schoolId);
    return NextResponse.json({ terms });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return adminWriteRoute(
    req,
    CreateSchoolTermSchema,
    "admin_create_school_term",
    async (input, ctx) => {
      const id = await createSchoolTerm(ctx, input);
      return { id };
    }
  );
}

export async function PATCH(req: Request) {
  return adminWriteRoute(
    req,
    UpdateSchoolTermSchema,
    "admin_update_school_term",
    async (input, ctx) => {
      const { term_id, ...fields } = input;
      await updateSchoolTerm(ctx, term_id, fields);
      return { id: term_id };
    }
  );
}

export async function DELETE(req: Request) {
  return adminWriteRoute(
    req,
    DeleteSchoolTermSchema,
    "admin_delete_school_term",
    async (input, ctx) => {
      await deleteSchoolTerm(ctx, input.term_id);
      return { id: input.term_id };
    }
  );
}
