import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";

/** Keep old tabs/bookmarked requests from sending non-report parent emails. */
export async function POST() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  return NextResponse.json(
    {
      error:
        "Attendance emails are disabled. Parents can view attendance in the portal. Share important updates in a report.",
    },
    { status: 409 }
  );
}
