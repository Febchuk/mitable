// @vitest-environment jsdom
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChildDetail } from "@/components/montessori/child-detail";
import type { ActivityFeedEntry } from "@/lib/queries/activity";
import type { CurriculumByTopic } from "@/lib/queries/curriculum";
import type { StudentProfile } from "@/lib/queries/student-profile";
import type { AxisWithAssessment, WholeChildObservation } from "@/lib/queries/whole-child";

// Silence the unused-import warning while still pulling React into scope so
// the classic JSX runtime can resolve `React.createElement` in this file.
void React;

afterEach(() => cleanup());

const profile: StudentProfile = {
  id: "test-student-1",
  fullName: "Ada Chen",
  preferredName: null,
  birthDate: "2021-08-14",
  sex: null,
  notes: null,
  classroom: { id: "c1", name: "Hummingbirds" },
  enrollmentStartDate: "2024-09-01",
  primaryTeacher: { id: "u1", name: "Halima Yusuf" },
  guardians: [
    {
      id: "g1",
      name: "Jane Chen",
      relationship: "Mother",
      primary: true,
      contact: "jane@example.com",
    },
  ],
};

const axes: AxisWithAssessment[] = [
  {
    key: "concentration",
    label: "Concentration",
    descriptors: {
      Emerging: "e",
      Practicing: "p",
      Deepening: "d",
      Leading: "l",
    },
    sortOrder: 0,
    level: "Practicing",
    assessedAt: "2026-04-28T00:00:00Z",
  },
];

const observations: WholeChildObservation[] = [];
const curriculum: CurriculumByTopic[] = [];
const activity: ActivityFeedEntry[] = [];

describe("ChildDetail", () => {
  it("renders the child name and the three view tabs", () => {
    render(
      <ChildDetail
        profile={profile}
        axes={axes}
        observations={observations}
        curriculum={curriculum}
        activity={activity}
        reportsRailBasePath="/app/reports"
      />
    );

    expect(screen.getByRole("heading", { level: 1, name: profile.fullName })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Whole child" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Curriculum" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Activity" })).toBeTruthy();
  });

  it("defaults to Activity and switches when another tab is selected", () => {
    render(
      <ChildDetail
        profile={profile}
        axes={axes}
        observations={observations}
        curriculum={curriculum}
        activity={activity}
        reportsRailBasePath="/app/reports"
      />
    );

    const activityTab = screen.getByRole("tab", { name: "Activity" });
    expect(activityTab.getAttribute("aria-selected")).toBe("true");

    const wholeTab = screen.getByRole("tab", { name: "Whole child" });
    fireEvent.click(wholeTab);
    expect(wholeTab.getAttribute("aria-selected")).toBe("true");
    expect(activityTab.getAttribute("aria-selected")).toBe("false");
  });
});
