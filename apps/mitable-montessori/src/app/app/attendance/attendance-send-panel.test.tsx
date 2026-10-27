// @vitest-environment jsdom
import * as React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AttendanceSendPanel } from "./attendance-send-panel";
const confirmation = "a".repeat(64);
const preview = { confirmation, present: 2, absent: 1, unmarked: 1, withoutEmail: 1, emails: 2 };
const fetchMock = vi.fn();
const onBusyChange = vi.fn();
function panel(props = {}) {
  return render(
    <AttendanceSendPanel
      date="2026-10-27"
      classroomIds={["room"]}
      markedCount={3}
      disabled={false}
      onBusyChange={onBusyChange}
      {...props}
    />
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue({ ok: true, json: async () => preview });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("does not offer sending for an empty register or while marks are saving", () => {
  const view = panel({ markedCount: 0 });
  expect(
    (screen.getByRole("button", { name: "Confirm and send to parents" }) as HTMLButtonElement)
      .disabled
  ).toBe(true);
  view.rerender(
    <AttendanceSendPanel
      date="2026-10-27"
      classroomIds={["room"]}
      markedCount={3}
      disabled={true}
      onBusyChange={onBusyChange}
    />
  );
  expect(
    (screen.getByRole("button", { name: "Confirm and send to parents" }) as HTMLButtonElement)
      .disabled
  ).toBe(true);
});
it("reviews saved counts without dispatch, and cancel never sends", async () => {
  panel();
  fireEvent.click(screen.getByRole("button", { name: "Confirm and send to parents" }));
  await screen.findByText("2 present · 1 absent · 1 unmarked");
  expect(screen.getByText(/no linked parent email/)).toBeTruthy();
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty("confirmation");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(onBusyChange).toHaveBeenLastCalledWith(false);
});
it("sends only after explicit confirmation and shows partial failures", async () => {
  panel();
  fireEvent.click(screen.getByRole("button", { name: "Confirm and send to parents" }));
  await screen.findByRole("button", { name: "Send attendance updates" });
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ sent: 1, alreadySent: 0, failed: 1, pending: 0, needsReview: 0 }),
  });
  fireEvent.click(screen.getByRole("button", { name: "Send attendance updates" }));
  await screen.findByText(/1 failed/);
  expect(screen.getByText(/1 email update accepted for delivery/)).toBeTruthy();
  expect(JSON.parse(fetchMock.mock.calls[1][1].body).confirmation).toBe(confirmation);
  await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(false));
});
it("keeps failed sends retryable and never claims success", async () => {
  panel();
  fireEvent.click(screen.getByRole("button", { name: "Confirm and send to parents" }));
  await screen.findByRole("button", { name: "Send attendance updates" });
  fetchMock.mockResolvedValueOnce({
    ok: false,
    json: async () => ({ error: "Attendance changed. Review again." }),
  });
  fireEvent.click(screen.getByRole("button", { name: "Send attendance updates" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByText(/accepted for delivery/)).toBeNull();
  expect(screen.getByRole("button", { name: "Confirm and send to parents" })).toBeTruthy();
});
it("invalidates review if another save begins or fails before confirmation", async () => {
  const view = panel();
  fireEvent.click(screen.getByRole("button", { name: "Confirm and send to parents" }));
  await screen.findByRole("button", { name: "Send attendance updates" });
  view.rerender(
    <AttendanceSendPanel
      date="2026-10-27"
      classroomIds={["room"]}
      markedCount={3}
      disabled={true}
      onBusyChange={onBusyChange}
    />
  );
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Send attendance updates" })).toBeNull()
  );
  expect(screen.getByRole("alert").textContent).toContain("unsaved changes");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(
    (screen.getByRole("button", { name: "Confirm and send to parents" }) as HTMLButtonElement)
      .disabled
  ).toBe(true);
});
