import { adminWriteRoute } from "@/lib/admin/route-helper";
import { CreateCurriculumSubtopicSchema } from "@/lib/schemas/admin";
import { createCurriculumSubtopic } from "@/lib/admin/crud";

export async function POST(req: Request) {
  return adminWriteRoute(
    req,
    CreateCurriculumSubtopicSchema,
    "admin_create_subtopic",
    async (input, ctx) => {
      const id = await createCurriculumSubtopic(ctx, input);
      return { id };
    }
  );
}
