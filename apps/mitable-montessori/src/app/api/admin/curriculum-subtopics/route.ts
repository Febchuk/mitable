import { adminWriteRoute } from "@/lib/admin/route-helper";
import {
  CreateCurriculumSubtopicSchema,
  UpdateCurriculumSubtopicSchema,
} from "@/lib/schemas/admin";
import {
  createCurriculumSubtopic,
  renameCurriculumSubtopic,
  reorderCurriculumSubtopics,
} from "@/lib/admin/crud";

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

export async function PATCH(req: Request) {
  return adminWriteRoute(
    req,
    UpdateCurriculumSubtopicSchema,
    "admin_update_curriculum_lesson",
    async (input, ctx) => {
      if (input.action === "rename") {
        await renameCurriculumSubtopic(ctx, input.subtopic_id, input.name);
        return { id: input.subtopic_id, meta: { action: input.action } };
      }
      await reorderCurriculumSubtopics(ctx, input.topic_id, input.subtopic_ids);
      return { id: input.topic_id, meta: { action: input.action } };
    }
  );
}
