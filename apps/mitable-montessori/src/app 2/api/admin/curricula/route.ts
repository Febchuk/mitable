import { adminWriteRoute } from "@/lib/admin/route-helper";
import { CreateCurriculumSchema } from "@/lib/schemas/admin";
import { createCurriculum } from "@/lib/admin/crud";

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
