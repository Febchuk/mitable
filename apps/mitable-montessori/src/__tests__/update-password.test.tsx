// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import UpdatePasswordPage from "@/app/update-password/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/auth/auth-hero", () => ({
  AuthHero: () => null,
  AuthHeroMobile: () => null,
}));

vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: { updateUser: vi.fn(), signOut: vi.fn() },
  }),
}));

void React;

afterEach(() => cleanup());

describe("UpdatePasswordPage", () => {
  it("shows or hides both password fields together", () => {
    render(<UpdatePasswordPage />);

    const newPassword = screen.getByLabelText("New password") as HTMLInputElement;
    const confirmation = screen.getByLabelText("Confirm new password") as HTMLInputElement;
    expect(newPassword.type).toBe("password");
    expect(confirmation.type).toBe("password");

    fireEvent.click(screen.getAllByRole("button", { name: "Show passwords" })[0]);
    expect(newPassword.type).toBe("text");
    expect(confirmation.type).toBe("text");

    fireEvent.click(screen.getAllByRole("button", { name: "Hide passwords" })[1]);
    expect(newPassword.type).toBe("password");
    expect(confirmation.type).toBe("password");
  });
});
