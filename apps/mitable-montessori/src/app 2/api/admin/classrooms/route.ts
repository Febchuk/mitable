import { adminWriteRoute } from "@/lib/admin/route-helper";
import { CreateClassroomSchema } from "@/lib/schemas/admin";
import { createClassroom } from "@/lib/admin/crud";

export async function POST(req: Request) {
  return adminWriteRoute(
    req,
    CreateClassroomSchema,
    "admin_create_classroom",
    async (input, ctx) => {
      const id = await createClassroom(ctx, input);
      return { id };
    }
  );
}
