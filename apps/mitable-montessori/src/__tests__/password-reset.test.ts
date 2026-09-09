import { afterEach, describe, expect, it, vi } from "vitest";
import {
  passwordResetAudience,
  passwordResetCallbackUrl,
  safeAuthRedirect,
} from "@/lib/auth/password-reset";

describe("password reset routing", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns staff and parent users to the correct reset form", () => {
    expect(passwordResetAudience(null)).toBe("staff");
    expect(passwordResetAudience("parent")).toBe("parent");
    expect(passwordResetCallbackUrl("https://mitable.ng", "staff")).toBe(
      "https://mitable.ng/auth/callback?redirect=%2Fupdate-password"
    );
    expect(passwordResetCallbackUrl("https://mitable.ng", "parent")).toBe(
      "https://mitable.ng/auth/callback?redirect=%2Fupdate-password%3Faudience%3Dparent"
    );
  });

  it("pins production recovery links to the public app origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");

    expect(passwordResetCallbackUrl("http://localhost:8080", "staff")).toBe(
      "https://www.mitable.ng/auth/callback?redirect=%2Fupdate-password"
    );
  });

  it("accepts only same-origin relative callback redirects", () => {
    expect(safeAuthRedirect("/update-password?audience=parent")).toBe(
      "/update-password?audience=parent"
    );
    expect(safeAuthRedirect("https://attacker.example/reset")).toBe("/");
    expect(safeAuthRedirect("//attacker.example/reset")).toBe("/");
    expect(safeAuthRedirect("/\\attacker.example/reset")).toBe("/");
  });
});
