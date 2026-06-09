/**
 * Feature flag helpers. Read flags here so we can swap env → remote config later
 * without touching call sites.
 */

function readPublicFlag(name: string): boolean {
  const raw = process.env[name];
  return raw === "1" || raw === "true";
}

/**
 * When true, teachers land on Reports with the report-first nav (Reports at top,
 * hero CTA list). When false (default), Progress is the home route and nav.
 */
export function reportFirstExperience(): boolean {
  return readPublicFlag("NEXT_PUBLIC_REPORT_FIRST_EXPERIENCE");
}

/** Default post-login path for teachers (admins use /admin/today). */
export function teacherAppHomePath(): string {
  return reportFirstExperience() ? "/app/reports" : "/app/progress";
}

export function adminAppHomePath(): string {
  return "/admin/today";
}

/** Role-aware home after login or visiting `/`. */
export function appHomePathForRole(role: "admin" | "teacher"): string {
  return role === "admin" ? adminAppHomePath() : teacherAppHomePath();
}

/**
 * When true, restores the Today route and the global Ask Mitable chatbot.
 * Progress is always available regardless of this flag.
 */
export function addTodayProgressAndAgent(): boolean {
  return readPublicFlag("NEXT_PUBLIC_ADD_TODAY_PROGRESS_AND_AGENT");
}

export function enableCaptureWorker(): boolean {
  return readPublicFlag("NEXT_PUBLIC_ENABLE_CAPTURE_WORKER");
}

export function enableLocalIntent(): boolean {
  return readPublicFlag("NEXT_PUBLIC_ENABLE_LOCAL_INTENT");
}

/**
 * When true, enables in-class group teams: teachers see the Group filter on
 * Progress; admins see Groups settings and roster assignments on Classrooms.
 * Off by default — most schools just switch between whole classrooms.
 */
export function classroomGroupsEnabled(): boolean {
  return readPublicFlag("NEXT_PUBLIC_CLASSROOM_GROUPS");
}

/**
 * When true, admins can assign Progress programs (Montessori / IEP / Speech) per
 * classroom and teachers see the program switcher. Off by default — classrooms
 * behave as single-program Montessori rooms.
 */
export function classroomProgramsEnabled(): boolean {
  return readPublicFlag("NEXT_PUBLIC_CLASSROOM_PROGRAMS");
}
