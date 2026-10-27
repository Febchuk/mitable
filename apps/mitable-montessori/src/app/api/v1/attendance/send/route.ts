import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { getAppUrl } from "@/lib/utils/app-url";
import { auditLog } from "@/lib/audit/log";
import {
  AttendanceSendError,
  loadAttendanceSendPlan,
  dispatchAttendancePlan,
} from "@/lib/attendance/parent-notifications";

const schema = z.object({
  date: z.string().date(),
  classroomIds: z.array(z.string().uuid()).min(1).max(50),
  confirmation: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Choose a valid date and classroom" }, { status: 400 });
  try {
    const db = createAdminClient();
    const { date, confirmation } = parsed.data;
    const plan = await loadAttendanceSendPlan(
      db,
      auth.user,
      date,
      [...new Set(parsed.data.classroomIds)],
      getAppUrl()
    );
    const summary = {
      present: plan.present,
      absent: plan.absent,
      unmarked: plan.unmarked,
      withoutEmail: plan.withoutEmail,
      emails: plan.deliveries.length,
    };
    if (!confirmation) return NextResponse.json({ ...summary, confirmation: plan.confirmation });
    if (confirmation !== plan.confirmation)
      return NextResponse.json(
        {
          error:
            "Attendance or parent details changed. Review the saved register again before sending.",
        },
        { status: 409 }
      );
    if (!process.env.RESEND_API_KEY?.trim())
      return NextResponse.json(
        {
          error:
            "Email sending is not configured. Attendance is saved; ask an administrator to enable parent emails.",
        },
        { status: 503 }
      );
    const delivery = await dispatchAttendancePlan(db, plan);
    await auditLog({
      actor_id: auth.user.userId,
      actor_role: auth.user.role,
      action: "attendance.send",
      target_table: "attendance_parent_deliveries",
      metadata: { date, classroom_ids: parsed.data.classroomIds, ...summary, ...delivery },
    });
    return NextResponse.json({ ...summary, ...delivery });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof AttendanceSendError
            ? error.message
            : "Could not prepare parent attendance updates. Please try again.",
      },
      { status: error instanceof AttendanceSendError ? error.status : 500 }
    );
  }
}
