// @vitest-environment jsdom

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ParentPortalShell } from "@/components/parents/parent-portal-shell";

const navigation = vi.hoisted(() => ({
  pathname: "/parents/reports",
  search: "child=student-1",
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
  useRouter: () => ({ push: navigation.push }),
}));

const children = [
  { id: "student-1", name: "Avery Stone", receivesReports: true },
  { id: "student-2", name: "Ben Stone", receivesReports: true },
];

function renderPortal() {
  return render(
    <ParentPortalShell firstName="Jordan" email="jordan@example.com" linkedChildren={children}>
      <div>Selected child content</div>
    </ParentPortalShell>
  );
}

describe("parent portal child switcher", () => {
  afterEach(() => {
    cleanup();
    navigation.push.mockReset();
    navigation.pathname = "/parents/reports";
    navigation.search = "child=student-1";
  });

  it("switches the reports list to the selected child", () => {
    renderPortal();

    fireEvent.change(screen.getByLabelText("Child whose data you are viewing"), {
      target: { value: "student-2" },
    });

    expect(navigation.push).toHaveBeenCalledWith("/parents/reports?child=student-2");
  });

  it("leaves an open report and opens the selected child's report list", () => {
    navigation.pathname = "/parents/reports/report-for-student-1";
    renderPortal();

    fireEvent.change(screen.getByLabelText("Child whose data you are viewing"), {
      target: { value: "student-2" },
    });

    expect(navigation.push).toHaveBeenCalledWith("/parents/reports?child=student-2");
  });

  it("preserves the current parent section and unrelated query state", () => {
    navigation.pathname = "/parents/progress";
    navigation.search = "child=student-1&view=timeline";
    renderPortal();

    fireEvent.change(screen.getByLabelText("Child whose data you are viewing"), {
      target: { value: "student-2" },
    });

    expect(navigation.push).toHaveBeenCalledWith("/parents/progress?child=student-2&view=timeline");
  });
});
