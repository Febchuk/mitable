import { adminWriteRoute } from "@/lib/admin/route-helper";
import { CreateGuardianSchema } from "@/lib/schemas/admin";
import { createGuardian } from "@/lib/admin/crud";

export async function POST(req: Request) {
  return adminWriteRoute(req, CreateGuardianSchema, "admin_create_guardian", async (input, ctx) => {
    const id = await createGuardian(ctx, input);
    return { id };
  });
}
