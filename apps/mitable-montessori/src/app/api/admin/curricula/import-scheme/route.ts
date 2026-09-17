import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { requireAdmin } from "@/lib/api/admin-auth";
import { auditLog } from "@/lib/audit/log";
import { previewSchemeImport } from "@/lib/admin/scheme-import";
import { getCurriculumTree } from "@/lib/queries/curriculum-tree";
import { createClient } from "@/utils/supabase/server";

const Schema = z
  .object({
    curriculum_id: z.string().uuid(),
    subjects: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(200),
          topics: z.array(z.string().trim().min(1).max(200)).min(1).max(500),
        })
      )
      .min(1)
      .max(100),
    dry_run: z.boolean(),
    preview_signature: z.string().length(64).optional(),
  })
  .refine((data) => data.subjects.reduce((sum, subject) => sum + subject.topics.length, 0) <= 500, {
    message: "An import can contain at most 500 topics.",
  });

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Check the subjects and topics in the preview." },
      { status: 400 }
    );

  const supabase = createClient(await cookies());
  const input = parsed.data;
  try {
    const tree = await getCurriculumTree(supabase, {
      curriculumId: input.curriculum_id,
      schoolId: auth.user.schoolId,
    });
    if (!tree) return NextResponse.json({ error: "Curriculum not found." }, { status: 404 });
    const preview = previewSchemeImport(input.subjects, tree);
    const signature = createHash("sha256")
      .update(JSON.stringify({ curriculumId: input.curriculum_id, subjects: input.subjects, tree }))
      .digest("hex");

    if (input.dry_run) return NextResponse.json({ ok: true, preview, signature });
    if (!input.preview_signature || input.preview_signature !== signature) {
      return NextResponse.json(
        {
          error:
            "The curriculum or import changed since your preview. Review it again before saving.",
        },
        { status: 409 }
      );
    }

    const { data, error } = await supabase.rpc("import_curriculum_scheme", {
      p_curriculum_id: input.curriculum_id,
      p_subjects: input.subjects,
    });
    if (error) {
      const status = error.code === "42501" ? 403 : error.code === "22023" ? 400 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }
    const result = data as { subjectsAdded: number; topicsAdded: number; lessonsAdded: number };
    await auditLog({
      actor_id: auth.user.userId,
      actor_role: auth.user.role,
      action: "admin_import_curriculum_scheme",
      target_table: "curricula",
      target_id: input.curriculum_id,
      metadata: {
        subjects_added: result.subjectsAdded,
        topics_added: result.topicsAdded,
        lessons_added: result.lessonsAdded,
      },
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not import scheme." },
      { status: 500 }
    );
  }
}
