import { adminWriteRoute } from "@/lib/admin/route-helper";
import { SetStudentGroupSchema } from "@/lib/schemas/admin";
import { setStudentGroup } from "@/lib/admin/crud";

export async function POST(req: Request) {
  return adminWriteRoute(
    req,
    SetStudentGroupSchema,
    "admin_set_student_group",
    async (input, ctx) => {
      await setStudentGroup(ctx, input);
      return {
        id: input.student_id,
        meta: { classroom_id: input.classroom_id, group_id: input.group_id },
      };
    }
  );
}
