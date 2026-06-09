import { getAttendanceDay } from "@/lib/queries/attendance-day";
import {
  ALL_CLASSROOMS_ID,
  isValidDateString,
  localDateString,
} from "@/lib/queries/attendance-day-model";
import AttendanceClient from "./attendance-client";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; classroom?: string }>;
}) {
  const params = await searchParams;
  const date = params.date && isValidDateString(params.date) ? params.date : localDateString();
  const classroom = params.classroom ?? ALL_CLASSROOMS_ID;
  const data = await getAttendanceDay(date, classroom);
  return <AttendanceClient data={data} />;
}
