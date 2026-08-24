import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/middleware";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/signup",
  "/auth/callback",
  "/parents/claim",
  "/parents/login",
  "/api/health",
  "/api/v1/auth",
  "/api/schools/register",
];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  const { supabase, supabaseResponse } = createClient(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const requestHeaders = new Headers(request.headers);
  // Never trust these if they arrived from the browser. They are only set
  // below after Supabase has verified the session for this request.
  requestHeaders.delete("x-mitable-auth-user-id");
  requestHeaders.delete("x-mitable-auth-user-email");
  if (user) {
    requestHeaders.set("x-mitable-auth-user-id", user.id);
    if (user.email) requestHeaders.set("x-mitable-auth-user-email", user.email);
  }

  const withSessionCookies = (response: NextResponse) => {
    supabaseResponse.cookies
      .getAll()
      .forEach(({ name, value, ...options }) => response.cookies.set(name, value, options));
    return response;
  };

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.startsWith("/parents/") ? "/parents/login" : "/login";
    url.searchParams.set("redirect", pathname);
    return withSessionCookies(NextResponse.redirect(url));
  }

  return withSessionCookies(
    NextResponse.next({
      request: { headers: requestHeaders },
    })
  );
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
