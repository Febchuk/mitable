import { NextResponse } from "next/server";
import { getClassroomProgress } from "@/lib/queries/classroom-progress";
import { requireUser } from "@/lib/api/auth";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const result = await getClassroomProgress();
  return NextResponse.json(result);
}
