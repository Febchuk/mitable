import { redirect } from "next/navigation";
import {
  getCurrentUserContext,
  isToddlerClassroomCode,
  listTeacherClassroomsForCurrentUser,
} from "@/lib/app/active-classroom";
import { isValidDateString, localDateString } from "@/lib/queries/attendance-day-model";
import DailyLogClient from "./daily-log-client";

export default async function DailyLogPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; classroom?: string }>;
}) {
  const ctx = await getCurrentUserContext();
  if (ctx?.role !== "teacher") redirect("/app/reports");
  const classrooms = (await listTeacherClassroomsForCurrentUser()).filter((classroom) =>
    isToddlerClassroomCode(classroom.code)
  );
  if (!classrooms.length) redirect("/app/progress");
  const params = await searchParams;
  const date = params.date && isValidDateString(params.date) ? params.date : localDateString();
  const classroomId = classrooms.some((classroom) => classroom.id === params.classroom)
    ? params.classroom!
    : classrooms[0].id;
  return (
    <DailyLogClient
      initialDate={date}
      initialClassroomId={classroomId}
      classrooms={classrooms.map(({ id, name }) => ({ id, name }))}
    />
  );
}
