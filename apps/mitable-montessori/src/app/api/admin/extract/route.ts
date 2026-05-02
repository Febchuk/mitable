import { NextResponse } from "next/server";
import { z } from "zod";
import { auditLog } from "@/lib/audit/log";
import { getAnthropic, HAIKU_MODEL } from "@/lib/anthropic/client";
import { requireAdmin } from "@/lib/api/admin-auth";
import { extractEntityFields } from "@/lib/admin/extraction";

const RequestSchema = z.object({
  entity: z.enum(["student", "guardian", "classroom", "subtopic"]),
  description: z.string().min(1).max(2000),
});

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await extractEntityFields({
      entity: parsed.data.entity,
      description: parsed.data.description,
      anthropic: getAnthropic(),
      model: HAIKU_MODEL,
    });
    await auditLog({
      actor_id: auth.user.userId,
      actor_role: auth.user.role,
      action: "admin_extract_form",
      metadata: { entity: parsed.data.entity },
    });
    return NextResponse.json({ ok: true, fields: result.fields });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
