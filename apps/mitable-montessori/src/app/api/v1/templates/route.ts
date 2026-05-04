import { NextResponse } from "next/server";
import { listTemplates } from "@/lib/queries/templates";
import { requireUser } from "@/lib/api/auth";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const templates = await listTemplates();
  return NextResponse.json({ templates });
}
