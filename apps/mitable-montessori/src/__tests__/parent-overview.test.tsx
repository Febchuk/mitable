// @vitest-environment jsdom

import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ParentOverview } from "@/components/parents/parent-overview";

describe("parent overview", () => {
  it("shows activity immediately and keeps the empty whole-child assessment hidden", () => {
    render(
      <ParentOverview
        profile={{
          id: "student-1",
          fullName: "Avery Stone",
          preferredName: null,
          birthDate: null,
          sex: null,
          notes: null,
          classroom: null,
          enrollmentStartDate: null,
          primaryTeacher: null,
          guardians: [],
        }}
        activity={[
          {
            id: "activity-1",
            kind: "learning",
            title: "Learning update",
            detail: "Worked with the pink tower.",
            createdAt: "2026-09-11T12:00:00Z",
          },
        ]}
      />
    );

    expect(screen.getByRole("heading", { name: "Learning and shared updates" })).toBeTruthy();
    expect(screen.getByText("Learning update")).toBeTruthy();
    expect(screen.queryByText("Whole child")).toBeNull();
  });
});
