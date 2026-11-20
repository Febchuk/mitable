import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const state = vi.hoisted(() => ({
  guardian: true,
  exchangeError: null as null | { message: string },
  queries: [] as string[],
}));
vi.mock("next/headers", () => ({ cookies: async () => ({}) }));
vi.mock("@/utils/supabase/server", () => ({
  createClient: () => ({
    auth: {
      exchangeCodeForSession: async () => ({ error: state.exchangeError }),
      getUser: async () => ({ data: { user: { id: "qa", email: "qa@example.invalid" } } }),
    },
    from: (table: string) => {
      state.queries.push(table);
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({
          data: table === "guardians" && state.guardian ? { id: "guardian" } : null,
        }),
      };
      return q;
    },
  }),
}));
import { GET } from "@/app/auth/callback/route";
beforeEach(() => {
  state.guardian = true;
  state.exchangeError = null;
  state.queries = [];
});
it("routes a guardian recovery session straight to its password form and retains the report destination", async () => {
  const destination =
    "/update-password?audience=parent&redirect=%2Fparents%2Freports%2Fqa%3Fchild%3Dchild";
  const response = await GET(
    new NextRequest(
      `http://localhost/auth/callback?code=qa&redirect=${encodeURIComponent(destination)}`
    )
  );
  const url = new URL(response.headers.get("location")!);
  expect(url.pathname + url.search).toBe(destination);
  expect(state.queries).toEqual([]);
});
it("takes an existing guardian to the requested report instead of school signup", async () => {
  const response = await GET(
    new NextRequest("http://localhost/auth/callback?code=qa&redirect=%2Fparents%2Freports%2Fqa")
  );
  expect(new URL(response.headers.get("location")!).pathname).toBe("/parents/reports/qa");
  expect(state.queries).toEqual(["guardians"]);
});
it("keeps an expired parent recovery link in the parent flow and retains the report", async () => {
  state.exchangeError = { message: "Code expired" };
  const destination = "/update-password?audience=parent&redirect=%2Fparents%2Freports%2Fqa";
  const response = await GET(
    new NextRequest(
      `http://localhost/auth/callback?code=expired&redirect=${encodeURIComponent(destination)}`
    )
  );
  const url = new URL(response.headers.get("location")!);
  expect(url.pathname).toBe("/forgot-password");
  expect(url.searchParams.get("audience")).toBe("parent");
  expect(url.searchParams.get("error")).toBe("recovery_expired");
  expect(url.searchParams.get("redirect")).toBe("/parents/reports/qa");
});
it("does not let an external redirect escape the app", async () => {
  const response = await GET(
    new NextRequest(
      "http://localhost/auth/callback?code=qa&redirect=https%3A%2F%2Fattacker.example"
    )
  );
  expect(new URL(response.headers.get("location")!).pathname).toBe("/parents");
});
