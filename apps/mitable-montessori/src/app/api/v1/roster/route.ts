import { NextResponse } from "next/server";
import { listClassroomRoster } from "@/lib/queries/roster";
import { requireUser } from "@/lib/api/auth";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const result = await listClassroomRoster();
  return NextResponse.json(result);
}
