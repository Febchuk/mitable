// Shared types between the attendance-day server query and the client
// component. Kept in their own file so the client can import them without
// pulling in `next/headers` (which would crash at build time on the client).

export type AttendanceDayStatus = "present" | "absent" | null;

export type AttendanceDayStudent = {
  id: string;
  fullName: string;
  preferredName: string | null;
  status: AttendanceDayStatus;
  comment: string | null;
  /** "HH:MM" (24h) or null. Only meaningful when status = "present". */
  arrivalTime: string | null;
};

export type AttendanceDayData = {
  classroomId: string | null;
  classroomName: string | null;
  /** ISO calendar date, "YYYY-MM-DD". */
  date: string;
  students: AttendanceDayStudent[];
};

/** Calendar day in the user's local timezone, "YYYY-MM-DD". */
export function localDateString(d: Date = new Date()): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Returns true if `s` is a "YYYY-MM-DD" calendar date. */
export function isValidDateString(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime());
}

/** Add `delta` days to a "YYYY-MM-DD" calendar date. */
export function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return localDateString(new Date(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
}
