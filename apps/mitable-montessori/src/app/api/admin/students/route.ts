import { adminWriteRoute } from "@/lib/admin/route-helper";
import { CreateStudentSchema } from "@/lib/schemas/admin";
import { createStudent, AdminError } from "@/lib/admin/crud";

export async function POST(req: Request) {
  return adminWriteRoute(req, CreateStudentSchema, "admin_create_student", async (input, ctx) => {
    const { classroom_id, ...studentFields } = input;
    const id = await createStudent(ctx, studentFields);
    if (classroom_id) {
      const start = new Date().toISOString().slice(0, 10);
      const { error } = await ctx.supabase.from("student_classroom_enrollments").insert({
        student_id: id,
        classroom_id,
        start_date: start,
        end_date: null,
        is_primary: true,
      });
      if (error) throw new AdminError(error.message, "db_error");
    }
    return { id, meta: classroom_id ? { classroom_id } : undefined };
  });
}
