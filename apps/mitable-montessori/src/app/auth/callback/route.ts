import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { appHomePathForRole, teacherAppHomePath } from "@/lib/feature-flags";
import { safeAuthRedirect } from "@/lib/auth/password-reset";
import { getAppUrl } from "@/lib/utils/app-url";
import { safeParentRedirect } from "@/lib/parents/redirect";

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
  const { searchParams } = req.nextUrl;
  // Build redirects against the canonical public origin — NOT req.nextUrl.origin.
  // Behind Railway's proxy this server handler sees the container-internal host
  // (http://localhost:8080, the runtime $PORT), which would otherwise be baked
  // into the redirect and strand users on a dead localhost link.
  const origin = getAppUrl(req);
  const code = searchParams.get("code");
  const defaultHome = "/";
  const requested = searchParams.get("redirect") ?? defaultHome;
  const safeRedirect = safeAuthRedirect(requested, defaultHome);
  const requestedPage = new URL(safeRedirect, origin);
  const failureRedirect = (message: string) => {
    if (
      requestedPage.pathname === "/update-password" &&
      requestedPage.searchParams.get("audience") === "parent"
    ) {
      const retry = new URL("/forgot-password?audience=parent&error=recovery_expired", origin);
      const destination = safeParentRedirect(requestedPage.searchParams.get("redirect"));
      if (destination) retry.searchParams.set("redirect", destination);
      return NextResponse.redirect(retry);
    }
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(message)}`, origin));
  };

  if (!code) {
    return failureRedirect("no_code");
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return failureRedirect(error.message);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return failureRedirect("no_user");
  }

  // Recovery sessions belong to either staff or guardians. They must reach
  // the password form before any staff-profile or signup routing.
  if (new URL(safeRedirect, origin).pathname === "/update-password") {
    return NextResponse.redirect(new URL(safeRedirect, origin));
  }
  const { data: guardian } = await supabase
    .from("guardians")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (guardian && (safeRedirect.startsWith("/parents/") || safeRedirect === "/")) {
    return NextResponse.redirect(new URL(safeRedirect === "/" ? "/parents" : safeRedirect, origin));
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
