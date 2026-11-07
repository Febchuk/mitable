import { NextResponse } from "next/server";
import { sessionClient, testsDisabledResponse } from "@/lib/tests/api";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const disabled = testsDisabledResponse();
  if (disabled) return disabled;
  const { id } = await params;
  const supabase = await sessionClient();
  const { error } = await supabase.rpc("submit_test", { p_submission_id: id });
  if (error) return NextResponse.json({ error: "This test can't be submitted" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
