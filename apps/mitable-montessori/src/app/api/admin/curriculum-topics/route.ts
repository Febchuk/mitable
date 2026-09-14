import { z } from "zod";
import { adminWriteRoute } from "@/lib/admin/route-helper";
import {
  CreateCurriculumTopicSchema,
  SetTopicMarkingSchemaSchema,
  UpdateCurriculumTopicSchema,
} from "@/lib/schemas/admin";
import {
  createCurriculumTopic,
  renameCurriculumTopic,
  reorderCurriculumTopics,
  setTopicMarkingSchema,
} from "@/lib/admin/crud";

const PatchCurriculumTopicSchema = z.union([
  SetTopicMarkingSchemaSchema,
  UpdateCurriculumTopicSchema,
]);

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

export async function PATCH(req: Request) {
  return adminWriteRoute(
    req,
    PatchCurriculumTopicSchema,
    "admin_update_curriculum_topic",
    async (input, ctx) => {
      if ("action" in input && input.action === "rename") {
        await renameCurriculumTopic(ctx, input.topic_id, input.name);
        return { id: input.topic_id, meta: { action: input.action } };
      }
      if ("action" in input && input.action === "reorder") {
        await reorderCurriculumTopics(ctx, input.subject_id, input.topic_ids);
        return { id: input.subject_id, meta: { action: input.action } };
      }
      await setTopicMarkingSchema(ctx, input);
      return {
        id: input.topic_id,
        meta: { marking_schema: input.marking_schema },
      };
    }
  );
}
