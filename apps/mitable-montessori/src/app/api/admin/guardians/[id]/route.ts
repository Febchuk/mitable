import { NextResponse } from "next/server";
import { adminWriteRoute } from "@/lib/admin/route-helper";
import { updateGuardian } from "@/lib/admin/crud";
import { UpdateGuardianSchema } from "@/lib/schemas/admin";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid guardian id" }, { status: 400 });
  }
  return adminWriteRoute(
    req,
    UpdateGuardianSchema,
    "admin_update_guardian",
    async (input, adminCtx) => {
      await updateGuardian(adminCtx, id, input);
      return { id };
    }
  );
}
