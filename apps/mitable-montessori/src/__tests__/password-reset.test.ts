import { describe, expect, it } from "vitest";
import {
  passwordResetAudience,
  passwordResetCallbackUrl,
  safeAuthRedirect,
} from "@/lib/auth/password-reset";

describe("password reset routing", () => {
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

  it("accepts only same-origin relative callback redirects", () => {
    expect(safeAuthRedirect("/update-password?audience=parent")).toBe(
      "/update-password?audience=parent"
    );
    expect(safeAuthRedirect("https://attacker.example/reset")).toBe("/");
    expect(safeAuthRedirect("//attacker.example/reset")).toBe("/");
    expect(safeAuthRedirect("/\\attacker.example/reset")).toBe("/");
  });
});
