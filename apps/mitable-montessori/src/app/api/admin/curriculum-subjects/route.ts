import { z } from "zod";
import { removeCurriculumSubject } from "@/lib/admin/crud";
import { adminWriteRoute } from "@/lib/admin/route-helper";
import { CreateCurriculumSubjectSchema, UpdateCurriculumSubjectSchema } from "@/lib/schemas/admin";
import {
  createCurriculumSubject,
  renameCurriculumSubject,
  reorderCurriculumSubjects,
} from "@/lib/admin/crud";

export async function POST(req: Request) {
  return adminWriteRoute(
    req,
    CreateCurriculumSubjectSchema,
    "admin_create_subject",
    async (input, ctx) => {
      const id = await createCurriculumSubject(ctx, input);
      return { id };
    }
  );
}

export async function PATCH(req: Request) {
  return adminWriteRoute(
    req,
    UpdateCurriculumSubjectSchema,
    "admin_update_curriculum_subject",
    async (input, ctx) => {
      if (input.action === "rename") {
        await renameCurriculumSubject(ctx, input.subject_id, input.name);
        return { id: input.subject_id, meta: { action: input.action } };
      }
      await reorderCurriculumSubjects(ctx, input.curriculum_id, input.subject_ids);
      return { id: input.curriculum_id, meta: { action: input.action } };
    }
  );
}

export async function DELETE(req: Request) {
  return adminWriteRoute(
    req,
    z.object({ subject_id: z.string().uuid() }),
    "admin_remove_curriculum_subject",
    async (input, ctx) => {
      await removeCurriculumSubject(ctx, input.subject_id);
      return { id: input.subject_id };
    }
  );
}
