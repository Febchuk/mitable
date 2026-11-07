// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import TakeTest from "@/app/student/tests/[id]/take-test";
import type { StudentTest } from "@/lib/tests/queries";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

const test: StudentTest = {
  id: "test",
  title: "Fractions check",
  subject: "Maths",
  instructions: null,
  submissionId: "submission",
  submitted: false,
  answers: {},
  questions: [{ id: "q1", kind: "short_answer", prompt: "Name it", options: null, points: 1 }],
};

const fetchMock = vi.fn();
const submitCalls = () =>
  fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/submit")).length;

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  push.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function typeThenSubmit() {
  render(<TakeTest test={test} />);
  fireEvent.change(screen.getByRole("textbox", { name: "Name it" }), {
    target: { value: "Numerator" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit test" }));
  fireEvent.click(screen.getByRole("button", { name: "Yes, submit" }));
}

it("saves the latest answer before submitting", async () => {
  fetchMock.mockImplementation(async () => Response.json({ ok: true }));
  await typeThenSubmit();
  await waitFor(() => expect(push).toHaveBeenCalledWith("/student"));
  const [saveUrl, saveInit] = fetchMock.mock.calls[0];
  expect(saveUrl).toBe("/api/v1/student/submissions/submission/answers");
  expect(JSON.parse(saveInit.body)).toMatchObject({ questionId: "q1", answerText: "Numerator" });
  expect(String(fetchMock.mock.calls[1][0])).toBe("/api/v1/student/submissions/submission/submit");
});

it("doesn't submit if an answer failed to save", async () => {
  fetchMock.mockRejectedValue(new TypeError("offline"));
  await typeThenSubmit();
  await screen.findByText(/didn't save, so your test wasn't submitted/);
  expect(submitCalls()).toBe(0);
  expect(push).not.toHaveBeenCalled();
  expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Name it" }).value).toBe(
    "Numerator"
  );
});

it("can submit once the connection comes back", async () => {
  fetchMock.mockRejectedValueOnce(new TypeError("offline"));
  await typeThenSubmit();
  await screen.findByText(/didn't save, so your test wasn't submitted/);
  fetchMock.mockImplementation(async () => Response.json({ ok: true }));
  fireEvent.click(screen.getByRole("button", { name: "Submit test" }));
  fireEvent.click(screen.getByRole("button", { name: "Yes, submit" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/student"));
  expect(submitCalls()).toBe(1);
});

it("shows no marks or answer key to the student", () => {
  render(<TakeTest test={test} />);
  expect(screen.queryByText(/correct/i)).toBeNull();
  expect(screen.queryByText(/mark/i)).toBeNull();
});
