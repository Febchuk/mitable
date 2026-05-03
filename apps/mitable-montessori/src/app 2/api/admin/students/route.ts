import { adminWriteRoute } from "@/lib/admin/route-helper";
import { CreateStudentSchema } from "@/lib/schemas/admin";
import { createStudent } from "@/lib/admin/crud";

export async function POST(req: Request) {
  return adminWriteRoute(req, CreateStudentSchema, "admin_create_student", async (input, ctx) => {
    const id = await createStudent(ctx, input);
    return { id };
  });
}
