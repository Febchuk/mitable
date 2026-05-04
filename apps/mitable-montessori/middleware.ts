import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/middleware";

const PUBLIC_PATHS = ["/", "/login", "/api/health", "/api/v1/auth"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  const { supabase, supabaseResponse } = createClient(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Unacknowledged-privacy gate: authenticated /app/* and /admin/* should
  // redirect through onboarding first if the user hasn't acknowledged.
  if (user && (pathname.startsWith("/app") || pathname.startsWith("/admin"))) {
    const { data: profile } = await supabase
      .from("users")
      .select("privacy_acknowledged_at")
      .eq("id", user.id)
      .maybeSingle();
    if (profile && !profile.privacy_acknowledged_at) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding/privacy";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
