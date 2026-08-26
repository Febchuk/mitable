import { adminWriteRoute } from "@/lib/admin/route-helper";
import {
  LinkGuardianSchema,
  PatchStudentGuardianSchema,
  UnlinkGuardianSchema,
} from "@/lib/schemas/admin";
import {
  linkGuardianToStudent,
  unlinkGuardianFromStudent,
  updateGuardianLink,
} from "@/lib/admin/crud";

export async function POST(req: Request) {
  return adminWriteRoute(req, LinkGuardianSchema, "admin_link_guardian", async (input, ctx) => {
    const id = await linkGuardianToStudent(ctx, input);
    return { id };
  });
}

export async function PATCH(req: Request) {
  return adminWriteRoute(
    req,
    PatchStudentGuardianSchema,
    "admin_update_student_guardian",
    async (input, ctx) => {
      await updateGuardianLink(ctx, input);
      return { id: input.guardian_id, meta: { student_id: input.student_id } };
    }
  );
}

export async function DELETE(req: Request) {
  return adminWriteRoute(req, UnlinkGuardianSchema, "admin_unlink_guardian", async (input, ctx) => {
    await unlinkGuardianFromStudent(ctx, input.student_id, input.guardian_id);
    return { id: input.guardian_id, meta: { student_id: input.student_id } };
  });
}
