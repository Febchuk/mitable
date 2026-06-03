import { NextResponse } from "next/server";
import { listClassroomRoster, listAllTeacherClassroomsRoster } from "@/lib/queries/roster";
import { requireUser } from "@/lib/api/auth";

export async function GET(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  // `?scope=all` unions children across every classroom the teacher leads
  // (used by the New report picker); default stays the active classroom.
  const scope = new URL(req.url).searchParams.get("scope");
  const result =
    scope === "all" ? await listAllTeacherClassroomsRoster() : await listClassroomRoster();
  return NextResponse.json(result);
}
