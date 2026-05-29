import { adminWriteRoute } from "@/lib/admin/route-helper";
import {
  CreateClassroomGroupSchema,
  UpdateClassroomGroupSchema,
  DeleteClassroomGroupSchema,
} from "@/lib/schemas/admin";
import { createClassroomGroup, updateClassroomGroup, deleteClassroomGroup } from "@/lib/admin/crud";

export async function POST(req: Request) {
  return adminWriteRoute(
    req,
    CreateClassroomGroupSchema,
    "admin_create_classroom_group",
    async (input, ctx) => {
      const id = await createClassroomGroup(ctx, input);
      return { id, meta: { classroom_id: input.classroom_id } };
    }
  );
}

export async function PATCH(req: Request) {
  return adminWriteRoute(
    req,
    UpdateClassroomGroupSchema,
    "admin_update_classroom_group",
    async (input, ctx) => {
      await updateClassroomGroup(ctx, input);
      return { id: input.group_id };
    }
  );
}

export async function DELETE(req: Request) {
  return adminWriteRoute(
    req,
    DeleteClassroomGroupSchema,
    "admin_delete_classroom_group",
    async (input, ctx) => {
      await deleteClassroomGroup(ctx, input.group_id);
      return { id: input.group_id };
    }
  );
}
