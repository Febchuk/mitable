import { NextResponse } from "next/server";
import { listCapturedTodayByChild } from "@/lib/queries/captured-today";
import { requireUser } from "@/lib/api/auth";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const counts = await listCapturedTodayByChild();
  return NextResponse.json({ counts });
}
