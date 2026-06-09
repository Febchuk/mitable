"use client";

import * as React from "react";
import Link from "next/link";
import { Search, Users } from "lucide-react";
import { PageHeader } from "@/components/montessori/page-header";
import { Avatar } from "@/components/montessori/primitives";
import { initialsFor } from "@/components/montessori/data";
import { toneFor } from "@/components/roster/roster-list-view";
import { useMontessori } from "@/components/montessori/store";
import { Input } from "@/components/ui/input";
import {
  adminSplitDetailScrollStyle,
  adminSplitDetailStyle,
  adminSplitGridStyle,
  adminSplitPageStyle,
  adminSplitRailScrollStyle,
  adminSplitRailStyle,
} from "@/components/admin/split-pane-layout";

type RosterRow = {
  id: string;
  fullName: string;
  preferredName: string | null;
  age: string | null;
  enrolledAt: string | null;
  guardianCount: number;
};

export function TeacherClassroomsView() {
  const { classrooms } = useMontessori();
  const sorted = React.useMemo(
    () => [...classrooms].sort((a, b) => a.name.localeCompare(b.name)),
    [classrooms]
  );
  const [selectedId, setSelectedId] = React.useState<string | null>(sorted[0]?.id ?? null);
  const [rows, setRows] = React.useState<RosterRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [search, setSearch] = React.useState("");

  React.useEffect(() => {
    if (!selectedId && sorted[0]?.id) setSelectedId(sorted[0].id);
  }, [selectedId, sorted]);

  React.useEffect(() => {
    if (!selectedId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetch(`/api/v1/roster?classroomId=${encodeURIComponent(selectedId)}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((data: { rows?: RosterRow[] }) => {
        if (cancelled) return;
        setRows(data.rows ?? []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const selected = sorted.find((c) => c.id === selectedId) ?? null;
  const filter = search.trim().toLowerCase();
  const visible = filter ? rows.filter((r) => r.fullName.toLowerCase().includes(filter)) : rows;

  return (
    <div style={adminSplitPageStyle}>
      <div style={{ flexShrink: 0 }}>
        <PageHeader title="Classroom" subtitle="Your classroom rosters." />
      </div>

      <div style={adminSplitGridStyle}>
        <aside style={adminSplitRailStyle}>
          <div
            style={{
              flexShrink: 0,
              padding: "14px 16px",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <div className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
              Classrooms
            </div>
          </div>
          <div className="scroll-quiet" style={adminSplitRailScrollStyle}>
            {sorted.length === 0 ? (
              <div
                style={{ padding: "18px 16px", fontSize: 13, color: "var(--color-ink-secondary)" }}
              >
                No classroom assignments yet.
              </div>
            ) : (
              sorted.map((classroom, index) => {
                const active = classroom.id === selectedId;
                return (
                  <button
                    key={classroom.id}
                    type="button"
                    className="tap"
                    onClick={() => setSelectedId(classroom.id)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "14px 16px",
                      border: 0,
                      borderTop: index ? "1px solid var(--color-border)" : 0,
                      background: active ? "var(--color-terracotta-soft)" : "transparent",
                      textAlign: "left",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--color-ink)" }}>
                        {classroom.name}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {selected ? (
          <section style={adminSplitDetailStyle}>
            <div className="scroll-quiet" style={adminSplitDetailScrollStyle}>
              <div
                style={{
                  padding: "18px 20px",
                  borderBottom: "1px solid var(--color-border)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h2
                    style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "var(--color-ink)" }}
                  >
                    {selected.name}
                  </h2>
                  <div
                    style={{ fontSize: 12.5, color: "var(--color-ink-secondary)", marginTop: 3 }}
                  >
                    {rows.length} {rows.length === 1 ? "child" : "children"}
                  </div>
                </div>
                {rows.length > 0 ? (
                  <div
                    style={{ position: "relative", width: 220, maxWidth: "100%", flexShrink: 0 }}
                  >
                    <Search
                      size={15}
                      strokeWidth={1.5}
                      style={{
                        position: "absolute",
                        left: 10,
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "var(--color-ink-muted)",
                      }}
                    />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search children"
                      style={{ paddingLeft: 32 }}
                    />
                  </div>
                ) : null}
              </div>

              {loading ? (
                <div style={{ padding: 28, textAlign: "center", color: "var(--color-ink-muted)" }}>
                  Loading roster…
                </div>
              ) : rows.length === 0 ? (
                <div
                  style={{
                    padding: "48px 24px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 12,
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 999,
                      background: "var(--color-muted)",
                      color: "var(--color-ink-muted)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Users size={26} strokeWidth={1.4} />
                  </div>
                  <p style={{ margin: 0, fontSize: 14, color: "var(--color-ink-secondary)" }}>
                    No children in this classroom yet.
                  </p>
                </div>
              ) : (
                <div>
                  <div
                    className="hidden lg:grid"
                    style={{
                      gridTemplateColumns: "1.8fr 0.5fr 0.8fr",
                      padding: "12px 20px",
                      borderBottom: "1px solid var(--color-border)",
                    }}
                  >
                    {["Child", "Age", "Enrolled"].map((header) => (
                      <div
                        key={header}
                        className="label-cap"
                        style={{ color: "var(--color-ink-muted)" }}
                      >
                        {header}
                      </div>
                    ))}
                  </div>
                  {visible.map((child, index) => {
                    const display = child.preferredName?.trim() || child.fullName;
                    const tone = toneFor(child.id);
                    return (
                      <Link
                        key={child.id}
                        href={`/app/children/${child.id}`}
                        className="tap"
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1.8fr 0.5fr 0.8fr",
                          padding: "12px 20px",
                          borderTop: index ? "1px solid var(--color-border)" : 0,
                          textDecoration: "none",
                          color: "inherit",
                          alignItems: "center",
                        }}
                      >
                        <span
                          style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}
                        >
                          <Avatar initials={initialsFor(display)} tone={tone} size={36} />
                          <span style={{ fontWeight: 600, fontSize: 14 }}>{display}</span>
                        </span>
                        <span style={{ fontSize: 13, color: "var(--color-ink-secondary)" }}>
                          {child.age ?? "—"}
                        </span>
                        <span style={{ fontSize: 13, color: "var(--color-ink-secondary)" }}>
                          {child.enrolledAt ?? "—"}
                        </span>
                      </Link>
                    );
                  })}
                  {visible.length === 0 ? (
                    <div
                      style={{
                        padding: 28,
                        textAlign: "center",
                        fontSize: 13,
                        color: "var(--color-ink-muted)",
                      }}
                    >
                      No children match this search.
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </section>
        ) : (
          <section style={adminSplitDetailStyle}>
            <div style={{ padding: 40, textAlign: "center", color: "var(--color-ink-secondary)" }}>
              Select a classroom to view its roster.
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
