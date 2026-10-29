// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ParentDirectoryPage from "@/app/admin/parents/page";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/visibility/reveal-hidden", () => ({ adminFetch: mocks.fetch }));
const parents = [
  {
    id: "registered",
    name: "Jordan Stone",
    email: "jordan@example.com",
    phone: null,
    status: "registered",
    inviteExpiresAt: null,
    children: [{ id: "child", name: "Avery Stone" }],
  },
  {
    id: "new",
    name: "Sam Reed",
    email: "sam@example.com",
    phone: null,
    status: "not_invited",
    inviteExpiresAt: null,
    children: [],
  },
];
beforeEach(() => {
  mocks.fetch
    .mockReset()
    .mockImplementation(
      async (_url: string, init?: RequestInit) =>
        new Response(JSON.stringify(init?.method === "POST" ? { ok: true } : { parents }))
    );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("searches by child and filters parents who still need an invitation", async () => {
  render(<ParentDirectoryPage />);
  await screen.findByText("Jordan Stone");
  fireEvent.change(screen.getByLabelText("Search parents"), { target: { value: "Avery" } });
  expect(screen.queryByText("Sam Reed")).toBeNull();
  fireEvent.change(screen.getByLabelText("Search parents"), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText("Filter parent access"), {
    target: { value: "not_invited" },
  });
  expect(screen.queryByText("Jordan Stone")).toBeNull();
  expect(screen.getByText("Sam Reed")).toBeTruthy();
});
it("requires the admin to confirm the recipient before sending a reset", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<ParentDirectoryPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Send password reset" }));
  expect(confirm).toHaveBeenCalledWith("Send a password reset link to jordan@example.com?");
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: "Send password reset" }));
  await screen.findByRole("status");
  expect(mocks.fetch).toHaveBeenCalledWith("/api/admin/guardians/registered/reset-password", {
    method: "POST",
  });
});
it("shows a failed send without reporting success", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<ParentDirectoryPage />);
  await screen.findByText("Sam Reed");
  mocks.fetch.mockResolvedValueOnce(
    new Response(JSON.stringify({ error: "Email unavailable" }), { status: 500 })
  );
  fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Email unavailable"));
  expect(screen.queryByRole("status")).toBeNull();
});
