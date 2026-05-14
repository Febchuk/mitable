"use client";

import * as React from "react";
import { Search } from "lucide-react";
import {
  RosterListView,
  ageFromBirthDate,
  formatEnrolled,
  type RosterListViewRow,
} from "@/components/roster/roster-list-view";
import { Input } from "@/components/ui/input";

type ApiStudent = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  birthDate: string | null;
  guardianCount: number;
  enrolledEarliest: string | null;
  classrooms: Array<{ id: string; name: string }>;
};

async function apiJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

function mapApiToRows(students: ApiStudent[]): RosterListViewRow[] {
  const sorted = [...students].sort(
    (a, b) =>
      a.firstName.localeCompare(b.firstName, undefined, { sensitivity: "base" }) ||
      a.lastName.localeCompare(b.lastName, undefined, { sensitivity: "base" }) ||
      a.id.localeCompare(b.id)
  );

  return sorted.map((s) => {
    const full = `${s.firstName} ${s.lastName}`.trim();
    const display = (s.preferredName?.trim() || full).trim();
    const classroomsLine =
      s.classrooms.length > 0 ? s.classrooms.map((c) => c.name).join(", ") : "—";
    const pref = s.preferredName?.trim() ?? "";
    const searchHaystack = [full, display, pref, classroomsLine]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return {
      id: s.id,
      href: `/app/children/${s.id}?from=admin-roster`,
      displayName: display,
      initialsSource: display,
      age: ageFromBirthDate(s.birthDate),
      enrolledAt: formatEnrolled(s.enrolledEarliest),
      guardianCount: s.guardianCount,
      classroomsLine,
      searchHaystack,
    };
  });
}

export default function AdminSchoolRosterPage() {
  const [allRows, setAllRows] = React.useState<RosterListViewRow[]>([]);
  const [search, setSearch] = React.useState("");
  const [loadState, setLoadState] = React.useState<"loading" | "idle" | "error">("loading");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadState("loading");
      setError(null);
      try {
        const data = await apiJson<{ students: ApiStudent[] }>("/api/admin/school-roster");
        if (cancelled) return;
        setAllRows(mapApiToRows(data.students ?? []));
        setLoadState("idle");
      } catch (e) {
        if (!cancelled) {
          setLoadState("error");
          setError(e instanceof Error ? e.message : "Could not load roster");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const q = search.trim().toLowerCase();
  const visibleRows = React.useMemo(() => {
    if (!q) return allRows;
    return allRows.filter((r) => (r.searchHaystack ?? "").includes(q));
  }, [allRows, q]);

  if (loadState === "loading") {
    return (
      <div style={{ padding: 48, textAlign: "center", color: "var(--color-ink-muted)" }}>
        Loading roster…
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div style={{ padding: 48 }}>
        <p style={{ color: "var(--color-status-error, #b42318)" }}>{error}</p>
      </div>
    );
  }

  const total = allRows.length;
  const shown = visibleRows.length;
  const overline =
    q && total > 0
      ? `Whole school · ${shown} of ${total} ${total === 1 ? "child" : "children"}`
      : `Whole school · ${total} ${total === 1 ? "child" : "children"}`;

  const emptyMessage =
    total === 0
      ? "No children in this school yet. Add them from Classrooms."
      : "No children match this search. Try a different name or classroom.";

  return (
    <RosterListView
      overline={overline}
      title="Roster"
      rows={visibleRows}
      emptyMessage={emptyMessage}
      toolbar={
        <div style={{ padding: "28px 24px 12px" }}>
          <div style={{ position: "relative", maxWidth: 400 }}>
            <Search
              size={15}
              strokeWidth={1.5}
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--color-ink-muted)",
                pointerEvents: "none",
              }}
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or classroom…"
              className="h-10 bg-canvas"
              style={{ paddingLeft: 32 }}
              aria-label="Search roster"
            />
          </div>
        </div>
      }
    />
  );
}
