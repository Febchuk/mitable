import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { auditLog } from "@/lib/audit/log";
import { firstIssue, sessionClient, testsDisabledResponse } from "@/lib/tests/api";
import {
  generateLoginCode,
  generateStudentPassword,
  studentLoginEmail,
} from "@/lib/tests/student-login";
import { createAdminClient } from "@/utils/supabase/admin";

const IssueLoginsSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1).max(100),
});

/**
 * Creates a student's login, or gives an existing one a new password. Passwords
 * are never stored by us, so this response is the only time anyone sees them.
 */
export async function POST(req: Request) {
  const disabled = testsDisabledResponse();
  if (disabled) return disabled;
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const parsed = IssueLoginsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });

  // Read with the caller's session first: this is what limits a teacher to the
  // students in their own classrooms before the service role is used.
  const supabase = await sessionClient();
  const { data: students } = await supabase
    .from("students")
    .select("id, school_id")
    .in("id", parsed.data.studentIds)
    .eq("school_id", auth.user.schoolId)
    .is("archived_at", null);
  const visible = (students ?? []) as { id: string; school_id: string }[];
  if (visible.length !== parsed.data.studentIds.length)
    return NextResponse.json({ error: "Student access denied" }, { status: 403 });

  const admin = createAdminClient();
  const { data: existingRows, error: existingError } = await admin
    .from("student_logins")
    .select("student_id, auth_user_id, login_code")
    .in("student_id", parsed.data.studentIds);
  if (existingError)
    return NextResponse.json({ error: "Could not load student logins" }, { status: 500 });
  const existing = new Map(
    (
      (existingRows ?? []) as { student_id: string; auth_user_id: string; login_code: string }[]
    ).map((row) => [row.student_id, row])
  );

  const logins: { studentId: string; loginCode: string; password: string }[] = [];
  for (const student of visible) {
    const password = generateStudentPassword();
    const current = existing.get(student.id);
    if (current) {
      const { error } = await admin.auth.admin.updateUserById(current.auth_user_id, { password });
      if (error) return partialFailure(logins);
      logins.push({ studentId: student.id, loginCode: current.login_code, password });
      continue;
    }

    const loginCode = generateLoginCode();
    const created = await admin.auth.admin.createUser({
      email: studentLoginEmail(loginCode),
      password,
      email_confirm: true,
    });
    if (created.error || !created.data.user) return partialFailure(logins);
    const { error } = await admin.from("student_logins").insert({
      student_id: student.id,
      school_id: student.school_id,
      auth_user_id: created.data.user.id,
      login_code: loginCode,
      created_by_user_id: auth.user.userId,
    });
    if (error) {
      await admin.auth.admin.deleteUser(created.data.user.id);
      return partialFailure(logins);
    }
    logins.push({ studentId: student.id, loginCode, password });
  }

  await auditLog({
    actor_id: auth.user.userId,
    actor_role: auth.user.role,
    action: "student_logins.issue",
    target_table: "student_logins",
    metadata: { student_count: logins.length },
  });
  return NextResponse.json({ logins });
}

/** Earlier passwords have already changed, so they must still reach the teacher. */
function partialFailure(logins: { studentId: string; loginCode: string; password: string }[]) {
  return NextResponse.json(
    { error: "Some logins could not be created. Try again for the rest.", logins },
    { status: 502 }
  );
}
