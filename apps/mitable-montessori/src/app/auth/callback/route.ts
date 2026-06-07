import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { appHomePathForRole, teacherAppHomePath } from "@/lib/feature-flags";

/**
 * OAuth callback. Supabase Auth redirects here with `?code=...` after Google
 * sign-in. We exchange it for a session, then route the user based on whether
 * they already have a `users` row tied to a school:
 *   - has row → continue to original `redirect` target (default teacher home)
 *   - no row  → bounce to /signup?provider=google&email=... so they finish
 *     creating their school
 *
 * The `redirect` query param is whatever the caller (login or signup page)
 * encoded. We sanitize it to ensure it's same-origin.
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get("code");
  const defaultHome = "/";
  const requested = searchParams.get("redirect") ?? defaultHome;
  const safeRedirect = requested.startsWith("/") ? requested : defaultHome;

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=no_code", origin));
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, origin)
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login?error=no_user", origin));
  }

  // Does this auth user have a Mitable users row yet?
  const { data: profile } = await supabase
    .from("users")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile) {
    const teacherDefault = teacherAppHomePath();
    const destination =
      safeRedirect === "/" || safeRedirect === teacherDefault
        ? appHomePathForRole(profile.role as "admin" | "teacher")
        : safeRedirect;
    return NextResponse.redirect(new URL(destination, origin));
  }

  // First-time Google user — bounce them to /signup with their email prefilled.
  const signupUrl = new URL("/signup", origin);
  signupUrl.searchParams.set("provider", "google");
  if (user.email) signupUrl.searchParams.set("email", user.email);
  return NextResponse.redirect(signupUrl);
}
