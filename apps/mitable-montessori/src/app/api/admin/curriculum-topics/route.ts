import { adminWriteRoute } from "@/lib/admin/route-helper";
import { CreateCurriculumTopicSchema, SetTopicMarkingSchemaSchema } from "@/lib/schemas/admin";
import { createCurriculumTopic, setTopicMarkingSchema } from "@/lib/admin/crud";

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
    SetTopicMarkingSchemaSchema,
    "admin_set_topic_marking_schema",
    async (input, ctx) => {
      await setTopicMarkingSchema(ctx, input);
      return {
        id: input.topic_id,
        meta: { marking_schema: input.marking_schema },
      };
    }
  );
}
