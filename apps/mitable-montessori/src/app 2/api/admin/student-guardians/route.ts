import { adminWriteRoute } from "@/lib/admin/route-helper";
import { LinkGuardianSchema } from "@/lib/schemas/admin";
import { linkGuardianToStudent } from "@/lib/admin/crud";

export async function POST(req: Request) {
  return adminWriteRoute(req, LinkGuardianSchema, "admin_link_guardian", async (input, ctx) => {
    const id = await linkGuardianToStudent(ctx, input);
    return { id };
  });
}
