import { adminWriteRoute } from "@/lib/admin/route-helper";
import { CreateCurriculumTopicSchema } from "@/lib/schemas/admin";
import { createCurriculumTopic } from "@/lib/admin/crud";

export async function POST(req: Request) {
  return adminWriteRoute(
    req,
    CreateCurriculumTopicSchema,
    "admin_create_topic",
    async (input, ctx) => {
      const id = await createCurriculumTopic(ctx, input);
      return { id };
    }
  );
}
