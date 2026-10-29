// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import GradesClient from "@/app/app/grades/grades-client";
import type { ElementaryGradesPageData } from "@/lib/queries/elementary-grades";
import { ExamGradeSummary } from "@/components/montessori/exam-grade-summary";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/montessori/primitives", () => ({ ToastBus: { push: vi.fn() } }));
const data: ElementaryGradesPageData = {
  classrooms: [{ id: "room", name: "Elementary" }],
  terms: [
    { id: "term", name: "Term II", startDate: "2027-01-01", endDate: "2027-03-31", sortOrder: 0 },
  ],
  students: [{ id: "child", classroomId: "room", name: "Test Student" }],
  grades: [],
  termComments: [],
};
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("enters the three components, calculates the total and saves without a subject letter", async () => {
  fetchMock.mockResolvedValue(
    Response.json({
      grade: {
        id: "grade",
        classroomId: "room",
        studentId: "child",
        termId: "term",
        subject: "Math",
        assessmentName: "End-of-term exam",
        caScore: 31.5,
        classParticipationScore: 18,
        aflScore: 17,
        percentage: 66.5,
        gradeLabel: "",
        comments: null,
        updatedAt: "now",
      },
    })
  );
  render(<GradesClient initialData={data} />);
  fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Math" } });
  fireEvent.change(screen.getByLabelText("CA /40"), { target: { value: "31.5" } });
  fireEvent.change(screen.getByLabelText("Class participation /20"), { target: { value: "18" } });
  fireEvent.change(screen.getByLabelText("AFL /40"), { target: { value: "17" } });
  expect(screen.getByLabelText("Calculated total").textContent).toBe("66.5/100");
  expect(screen.queryByLabelText("Grade equivalent")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Add grade" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(payload).toMatchObject({
    caScore: 31.5,
    classParticipationScore: 18,
    aflScore: 17,
    percentage: 66.5,
    gradeLabel: "",
    termId: "term",
  });
  await screen.findByText("Total 66.5/100");
});
it("opens a legacy result as a total without assigning invented component values", () => {
  render(
    <GradesClient
      initialData={{
        ...data,
        grades: [
          {
            id: "grade",
            classroomId: "room",
            studentId: "child",
            termId: "term",
            subject: "Math",
            assessmentName: "Exam",
            percentage: 86.5,
            gradeLabel: "B+",
            comments: null,
            updatedAt: "now",
          },
        ],
      }}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit grade" }));
  expect((screen.getByLabelText("Scoring") as HTMLSelectElement).value).toBe("total");
  expect((screen.getByLabelText("Total /100") as HTMLInputElement).value).toBe("86.5");
  expect(screen.queryByLabelText("CA /40")).toBeNull();
  expect(screen.getByText("Saved total only — no breakdown recorded")).toBeTruthy();
});
it("saves the teacher-selected overall grade with one comment", async () => {
  fetchMock.mockResolvedValue(
    Response.json({ comment: "A productive term.", overallGradeLabel: "B" })
  );
  render(<GradesClient initialData={data} />);
  fireEvent.change(screen.getByLabelText("Overall grade"), { target: { value: "B" } });
  fireEvent.change(screen.getByLabelText("Comments"), { target: { value: "A productive term." } });
  fireEvent.click(screen.getByRole("button", { name: "Save overall grade and comment" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
    overallGradeLabel: "B",
    comment: "A productive term.",
    termId: "term",
  });
});
it("renders subject numbers and only one overall letter in the report", () => {
  render(
    <ExamGradeSummary
      summary={{
        averagePercentage: 66.5,
        comment: "Term feedback.",
        overallGradeLabel: "B",
        rows: [
          {
            subject: "Math",
            assessmentName: "Term assessment",
            caScore: 31.5,
            classParticipationScore: 18,
            aflScore: 17,
            total: 66.5,
          },
        ],
      }}
    />
  );
  expect(screen.getByRole("columnheader", { name: "CA /40" })).toBeTruthy();
  expect(screen.getByRole("columnheader", { name: "Total /100" })).toBeTruthy();
  expect(screen.getByText(/Overall average: 66.5% · Overall grade: B/)).toBeTruthy();
  expect(screen.queryByRole("columnheader", { name: /grade/i })).toBeNull();
});
