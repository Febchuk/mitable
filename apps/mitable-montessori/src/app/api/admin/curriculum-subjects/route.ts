import { adminWriteRoute } from "@/lib/admin/route-helper";
import { CreateCurriculumSubjectSchema } from "@/lib/schemas/admin";
import { createCurriculumSubject } from "@/lib/admin/crud";

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
