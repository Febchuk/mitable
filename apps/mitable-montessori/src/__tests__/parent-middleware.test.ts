import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const state = vi.hoisted(() => ({ user: null as null | { id: string; email: string } }));
vi.mock("@/utils/supabase/middleware", () => ({
  createClient: () => ({
    supabase: { auth: { getUser: async () => ({ data: { user: state.user } }) } },
    supabaseResponse: NextResponse.next(),
  }),
}));
import { middleware } from "@/middleware";
beforeEach(() => {
  state.user = null;
});
afterEach(() => vi.unstubAllEnvs());
it("keeps Railway redirects on the public app instead of the internal container port", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
  const response = await middleware(
    new NextRequest("http://localhost:8080/parents/reports/qa?child=child")
  );
  expect(new URL(response.headers.get("location")!).origin).toBe("https://www.mitable.ng");
});
it("keeps the exact report and child when a signed-out parent needs to sign in", async () => {
  const response = await middleware(
    new NextRequest("https://www.mitable.ng/parents/reports/qa?child=child")
  );
  const next = new URL(response.headers.get("location")!);
  expect(next.pathname).toBe("/parents/login");
  expect(next.searchParams.get("redirect")).toBe("/parents/reports/qa?child=child");
});
it.each([
  "/forgot-password?audience=parent",
  "/manifest.webmanifest",
  "/sw.js",
  "/fonts/dm-sans-latin-400.woff2",
  "/teachers/claim",
  "/parents/claim",
  "/api/public/v1/students",
  "/api/v1/reports/send",
])("allows %s to reach its own authentication flow", async (path) => {
  expect(
    (await middleware(new NextRequest(`https://www.mitable.ng${path}`))).headers.get("location")
  ).toBeNull();
});
it("routes the parent home to parent login, and strips spoofed identity headers", async () => {
  expect(
    new URL(
      (await middleware(new NextRequest("https://www.mitable.ng/parents"))).headers.get("location")!
    ).pathname
  ).toBe("/parents/login");
  const response = await middleware(
    new NextRequest("https://www.mitable.ng/parents/login", {
      headers: {
        "x-mitable-auth-user-id": "forged",
        "x-mitable-auth-user-email": "forged@example.invalid",
      },
    })
  );
  expect(response.headers.get("x-middleware-request-x-mitable-auth-user-id")).toBeNull();
});
