// @vitest-environment jsdom
import * as React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TeacherEditor } from "./teacher-editor";
void React;
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("saves a name and ends only the selected class assignment", async () => {
  const fetchMock = vi.fn(
    async (_url: unknown, init?: RequestInit) =>
      new Response(
        JSON.stringify(
          init?.method
            ? { ok: true }
            : {
                classrooms: [{ id: "c1", name: "Red" }],
                assignments: [{ id: "a1", classroom_id: "c1", classroom_role: "support" }],
              }
        ),
        { status: 200 }
      )
  );
  vi.stubGlobal("fetch", fetchMock);
  render(
    <TeacherEditor
      teacher={{ id: "t1", firstName: "Old", lastName: "Name" }}
      onClose={vi.fn()}
      onChanged={vi.fn()}
    />
  );
  await screen.findByLabelText("Red (support)");
  fireEvent.change(screen.getByLabelText("First name"), { target: { value: "New" } });
  fireEvent.click(screen.getByRole("button", { name: "Save name" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("saved"));
  const nameCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
  expect(JSON.parse(nameCall![1]!.body as string)).toEqual({ firstName: "New", lastName: "Name" });
  fireEvent.click(screen.getByLabelText("Red (support)"));
  await waitFor(() =>
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(true)
  );
  const removal = fetchMock.mock.calls.find(([, init]) => init?.method === "DELETE");
  expect(JSON.parse(removal![1]!.body as string).assignment_id).toBe("a1");
});
