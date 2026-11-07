import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { studentTestsEnabled } from "@/lib/feature-flags";
import { createClient } from "@/utils/supabase/server";

export function testsDisabledResponse(): NextResponse | null {
  return studentTestsEnabled() ? null : NextResponse.json({ error: "Not found" }, { status: 404 });
}

/** Uses the caller's session, so row level security applies to every query. */
export async function sessionClient() {
  return createClient(await cookies());
}

export function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Invalid request";
}
