import { getAttendanceDay } from "@/lib/queries/attendance-day";
import { isValidDateString, localDateString } from "@/lib/queries/attendance-day-model";
import AttendanceClient from "./attendance-client";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const date = params.date && isValidDateString(params.date) ? params.date : localDateString();
  const data = await getAttendanceDay(date);
  return <AttendanceClient data={data} />;
}
