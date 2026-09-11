import { afterEach, describe, expect, it, vi } from "vitest";
import { getAppUrl } from "@/lib/utils/app-url";

describe("getAppUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("prefers the NEXT_PUBLIC_APP_URL pin and trims trailing slashes", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.mitable.ng/");
    expect(getAppUrl(new Request("http://localhost:8080/auth/callback"))).toBe(
      "https://www.mitable.ng"
    );
  });

  it("never leaks the Railway-internal origin into production redirects", () => {
    // Reproduces the bug: behind Railway's proxy a server handler sees
    // http://localhost:8080 ($PORT) as the request origin, and a top-level
    // navigation carries no Origin header.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");

    expect(getAppUrl(new Request("http://localhost:8080/auth/callback?code=abc"))).toBe(
      "https://www.mitable.ng"
    );
  });

  it("still trusts the request origin in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");

    expect(getAppUrl(new Request("http://localhost:3000/auth/callback"))).toBe(
      "http://localhost:3000"
    );
  });
});
