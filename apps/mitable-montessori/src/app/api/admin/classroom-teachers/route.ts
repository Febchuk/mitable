import { adminWriteRoute } from "@/lib/admin/route-helper";
import { AssignTeacherSchema } from "@/lib/schemas/admin";
import { assignTeacherToClassroom } from "@/lib/admin/crud";

export async function POST(req: Request) {
  return adminWriteRoute(req, AssignTeacherSchema, "admin_assign_teacher", async (input, ctx) => {
    const id = await assignTeacherToClassroom(ctx, input);
    return { id, meta: { role: input.classroom_role } };
  });
}
