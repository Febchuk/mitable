import { adminWriteRoute } from "@/lib/admin/route-helper";
import { EndStudentEnrollmentSchema, EnrollStudentSchema } from "@/lib/schemas/admin";
import { endStudentEnrollment, enrollStudentInClassroom } from "@/lib/admin/crud";

export async function POST(req: Request) {
  return adminWriteRoute(req, EnrollStudentSchema, "admin_enroll_student", async (input, ctx) => {
    const start = input.start_date ?? new Date().toISOString().slice(0, 10);
    const id = await enrollStudentInClassroom(ctx, {
      student_id: input.student_id,
      classroom_id: input.classroom_id,
      start_date: start,
    });
    return {
      id,
      meta: { student_id: input.student_id, classroom_id: input.classroom_id },
    };
  });
}

export async function DELETE(req: Request) {
  return adminWriteRoute(
    req,
    EndStudentEnrollmentSchema,
    "admin_end_student_enrollment",
    async (input, ctx) => {
      const id = await endStudentEnrollment(ctx, input);
      return {
        id,
        meta: { student_id: input.student_id, classroom_id: input.classroom_id },
      };
    }
  );
}
