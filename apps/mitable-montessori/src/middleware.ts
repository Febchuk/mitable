import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/middleware";
import { getAppUrl } from "@/lib/utils/app-url";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/manifest.webmanifest",
  "/sw.js",
  "/fonts",
  "/offline",
  "/auth/callback",
  "/parents/claim",
  "/teachers/claim",
  "/parents/login",
  "/api/health",
  "/api/v1/auth",
  // External integrations authenticate in their route handler with an API key,
  // rather than a browser session. Let them reach that handler so failures are
  // JSON 401/403 responses instead of browser-login redirects.
  "/api/public/v1",
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

  // API handlers authenticate their own cookie, bearer-token or integration-key requests.
  // Keep their JSON errors intact rather than turning them into HTML login redirects.
  if (!user && !pathname.startsWith("/api/") && !isPublic(pathname)) {
    // Railway can expose the container host here. Keep parent email links on
    // the configured public app, never localhost:8080.
    const url = new URL(getAppUrl(request));
    const requestedDestination = `${pathname}${request.nextUrl.search}`;
    url.pathname =
      pathname === "/parents" || pathname.startsWith("/parents/") ? "/parents/login" : "/login";
    url.search = "";
    url.searchParams.set("redirect", requestedDestination);
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
