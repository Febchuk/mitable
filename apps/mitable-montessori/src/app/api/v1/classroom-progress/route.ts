import { NextResponse } from "next/server";
import { getClassroomProgress } from "@/lib/queries/classroom-progress";
import { requireUser } from "@/lib/api/auth";

export async function GET(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const classroomId = new URL(req.url).searchParams.get("classroomId") ?? undefined;
  const result = await getClassroomProgress(classroomId);
  return NextResponse.json(result);
}
