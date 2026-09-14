import { adminWriteRoute } from "@/lib/admin/route-helper";
import { duplicateCurriculum } from "@/lib/admin/crud";
import { DuplicateCurriculumSchema } from "@/lib/schemas/admin";

export async function POST(req: Request) {
  return adminWriteRoute(
    req,
    DuplicateCurriculumSchema,
    "admin_duplicate_curriculum",
    async (input, ctx) => {
      const id = await duplicateCurriculum(ctx, input);
      return { id, meta: { source_curriculum_id: input.curriculum_id } };
    }
  );
}
