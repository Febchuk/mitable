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
  subjects: [{ classroomId: "room", name: "Math" }],
  gradingScale: null,
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
it("saves a term comment without allowing a manual overall letter", async () => {
  fetchMock.mockResolvedValue(
    Response.json({ comment: "A productive term.", overallGradeLabel: null })
  );
  render(<GradesClient initialData={data} />);
  expect(screen.queryByRole("combobox", { name: "Overall grade" })).toBeNull();
  expect(screen.getByText(/An admin can set the A–D/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Comments"), { target: { value: "A productive term." } });
  fireEvent.click(screen.getByRole("button", { name: "Save comment" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(payload).toMatchObject({ comment: "A productive term.", termId: "term" });
  expect(payload).not.toHaveProperty("overallGradeLabel");
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
it("uses the curriculum subject dropdown and calculates the overall grade from saved scores", () => {
  render(
    <GradesClient
      initialData={{
        ...data,
        gradingScale: { aMin: 80, bMin: 65, cMin: 50 },
        grades: [70, 65].map((percentage, index) => ({
          id: `grade-${index}`,
          classroomId: "room",
          studentId: "child",
          termId: "term",
          subject: index ? "Science" : "Math",
          assessmentName: "Exam",
          percentage,
          gradeLabel: "",
          comments: null,
          updatedAt: "now",
        })),
      }}
    />
  );
  expect(screen.getByRole("combobox", { name: "Subject" }).tagName).toBe("SELECT");
  expect(screen.getByLabelText("Overall average").textContent).toBe("67.5%");
  expect(screen.getByLabelText("Overall grade").textContent).toBe("B");
});
it("does not allow grade entry when the classroom has no curriculum subjects", () => {
  render(<GradesClient initialData={{ ...data, subjects: [] }} />);
  expect((screen.getByRole("combobox", { name: /Subject/ }) as HTMLSelectElement).disabled).toBe(
    true
  );
  expect((screen.getByRole("button", { name: "Add grade" }) as HTMLButtonElement).disabled).toBe(
    true
  );
});
