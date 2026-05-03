import { adminWriteRoute } from "@/lib/admin/route-helper";
import { CreateUserSchema } from "@/lib/schemas/admin";
import { createUser } from "@/lib/admin/crud";

export async function POST(req: Request) {
  return adminWriteRoute(req, CreateUserSchema, "admin_create_user", async (input, ctx) => {
    const id = await createUser(ctx, input);
    return { id, meta: { role: input.role } };
  });
}
