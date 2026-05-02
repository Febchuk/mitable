import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

/**
 * Server-side sign-out. Calling supabase.auth.signOut() from the server
 * client clears the auth cookies via Next's cookie jar — the client-side
 * `createClient()` doesn't have access to those cookies in the App Router,
 * so we route logout through here.
 */
export async function POST() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
