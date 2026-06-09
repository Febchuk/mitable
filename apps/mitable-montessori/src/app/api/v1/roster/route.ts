import { NextResponse } from "next/server";
import {
  listClassroomRoster,
  listAllTeacherClassroomsRoster,
  listRosterForTeacherClassroom,
} from "@/lib/queries/roster";
import { requireUser } from "@/lib/api/auth";

export async function GET(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  // `?scope=all` unions children across every classroom the teacher leads
  // (used by the New report picker); default stays the active classroom.
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope");
  const classroomId = url.searchParams.get("classroomId");
  const result =
    classroomId != null && classroomId.length > 0
      ? await listRosterForTeacherClassroom(classroomId)
      : scope === "all"
        ? await listAllTeacherClassroomsRoster()
        : await listClassroomRoster();
  return NextResponse.json(result);
}
