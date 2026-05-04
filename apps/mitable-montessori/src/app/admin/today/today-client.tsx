"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { CHILDREN, findChild, initialsFor } from "@/components/montessori/data";
import { PageHeader, cardHeaderStyle, cardStyle } from "@/components/montessori/page-header";
import { Avatar, HandCheck } from "@/components/montessori/primitives";
import { useMontessori } from "@/components/montessori/store";

const TODAY_LABEL = "Tuesday · April 30";

export default function AdminTodayClient({
  firstName,
  schoolName = null,
}: {
  firstName: string | null;
  schoolName?: string | null;
}) {
  const store = useMontessori();
  const router = useRouter();
  const presentKids = CHILDREN.filter((c) => c.present);
  const observations = store.chat.filter((m) => m.type === "observation");
  const captured = observations.slice(-4).reverse();
  const pendingApproval = store.reports.filter((r) => r.status !== "sent");

  const greetingName = firstName?.trim() || "there";
  const attendanceLabel = schoolName ?? "School-wide";

  return (
    <div>
      {/* Mobile-only header */}
      <div className="lg:hidden" style={{ padding: "26px 22px 10px" }}>
        <div className="label-cap" style={{ color: "var(--color-ink-muted)", marginBottom: 10 }}>
          {TODAY_LABEL}
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: 32,
            fontWeight: 700,
            color: "var(--color-ink)",
            letterSpacing: "-0.015em",
            lineHeight: 1.1,
          }}
        >
          Good morning,{" "}
          <span
            className="font-display"
            style={{
              fontWeight: 500,
              fontSize: 38,
              color: "var(--color-terracotta-deep)",
            }}
          >
            {greetingName}
          </span>
        </h1>
        <div
          style={{
            marginTop: 14,
            fontSize: 15,
            color: "var(--color-ink-secondary)",
            lineHeight: 1.45,
          }}
        >
          A snapshot of every classroom today.
        </div>
      </div>

      {/* Desktop header */}
      <div className="hidden lg:block">
        <PageHeader overline={TODAY_LABEL} title="Today" subtitle="Across the school today." />
      </div>

      <div
        className="lg:grid lg:grid-cols-[2fr_1fr] lg:gap-8"
        style={{ padding: "16px 24px 60px" }}
      >
        <div>
          <button
            type="button"
            className="tap"
            onClick={() => router.push("/admin/classrooms")}
            style={{
              width: "100%",
              textAlign: "left",
              ...cardStyle,
              padding: 0,
              cursor: "pointer",
            }}
          >
            <div className="card-header-borderless-mobile" style={cardHeaderStyle}>
              <div className="label-cap" style={{ color: "var(--color-ink-secondary)" }}>
                {attendanceLabel}
              </div>
              <span
                style={{
                  fontSize: 12,
                  color: "var(--color-sage)",
                  fontWeight: 500,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <span className="live-dot" />
                Attendance open
              </span>
            </div>
            <div className="card-body-tight-mobile" style={{ padding: "20px 24px" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span
                  className="font-numeric"
                  style={{ fontSize: 40, fontWeight: 600, color: "var(--color-ink)" }}
                >
                  {presentKids.length}
                </span>
                <span style={{ fontSize: 14, color: "var(--color-ink-secondary)" }}>
                  of {CHILDREN.length} children present across the school
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                {presentKids.map((c) => (
                  <Avatar key={c.id} initials={initialsFor(c.name)} tone={c.tone} size={30} />
                ))}
                {Array.from({ length: CHILDREN.length - presentKids.length }).map((_, k) => (
                  <div
                    key={`a${k}`}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 999,
                      border: "1.5px dashed var(--color-border-strong)",
                      opacity: 0.5,
                    }}
                  />
                ))}
              </div>
            </div>
          </button>

          <div
            className="lg:hidden label-cap"
            style={{ color: "var(--color-ink-muted)", padding: "22px 4px 10px" }}
          >
            Captured today
          </div>

          <div style={{ ...cardStyle, marginTop: 0 }} className="lg:!mt-[18px]">
            <div
              className="hidden lg:flex"
              style={{
                justifyContent: "space-between",
                alignItems: "center",
                padding: "14px 18px",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              <div className="label-cap" style={{ color: "var(--color-ink-secondary)" }}>
                Captured today
              </div>
              <span style={{ fontSize: 12, color: "var(--color-ink-muted)" }}>
                {observations.length} observations
              </span>
            </div>
            {captured.length === 0 && (
              <div
                style={{
                  padding: 20,
                  fontSize: 13,
                  color: "var(--color-ink-muted)",
                  textAlign: "center",
                }}
              >
                Nothing captured yet today.
              </div>
            )}
            {captured.map((r, i) => {
              if (r.type !== "observation") return null;
              const child = findChild(r.childId);
              const isPrivate = r.area === "Private note";
              return (
                <div
                  key={r.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    padding: "14px 18px",
                    borderTop: i ? "1px solid var(--color-border)" : "none",
                  }}
                >
                  <Avatar
                    initials={child ? initialsFor(child.name) : "··"}
                    tone={child ? child.tone : "clay"}
                    size={32}
                  />
                  <div
                    style={{
                      flex: 1,
                      fontSize: 14,
                      color: "var(--color-ink)",
                      minWidth: 0,
                      lineHeight: 1.45,
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600 }}>{child ? child.name : ""}</span>{" "}
                      <span style={{ color: "var(--color-ink-secondary)" }}>{r.body}</span>
                    </div>
                    {(isPrivate || r.subtopic) && (
                      <div
                        style={{
                          marginTop: 2,
                          fontSize: 12,
                          color: "var(--color-ink-muted)",
                        }}
                      >
                        {isPrivate
                          ? "Private note · not shared with family"
                          : `${r.area} · ${r.level}`}
                      </div>
                    )}
                  </div>
                  {r.status === "pending" ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        fontSize: 11,
                        color: "var(--color-terracotta-deep)",
                        background: "var(--color-terracotta-soft)",
                        borderRadius: 999,
                        padding: "3px 10px",
                        fontWeight: 500,
                        flexShrink: 0,
                      }}
                    >
                      pending
                    </span>
                  ) : (
                    <HandCheck color="var(--color-sage)" size={14} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="hidden lg:block">
          <div style={cardStyle}>
            <div style={cardHeaderStyle}>
              <div className="label-cap" style={{ color: "var(--color-ink-secondary)" }}>
                Pending approval
              </div>
              <span style={{ fontSize: 12, color: "var(--color-ink-muted)" }}>
                {pendingApproval.length} report{pendingApproval.length === 1 ? "" : "s"}
              </span>
            </div>
            {pendingApproval.length === 0 ? (
              <div
                style={{
                  padding: 24,
                  fontSize: 13,
                  color: "var(--color-ink-muted)",
                  textAlign: "center",
                }}
              >
                Nothing to review right now.
              </div>
            ) : (
              pendingApproval.map((report, index) => {
                const child = findChild(report.childId);
                return (
                  <div
                    key={report.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "14px 18px",
                      borderTop: index ? "1px solid var(--color-border)" : 0,
                    }}
                  >
                    <Avatar
                      initials={child ? initialsFor(child.name) : "··"}
                      tone={child ? child.tone : "clay"}
                      size={28}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                        {child ? child.name : ""}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--color-ink-muted)" }}>
                        {report.kind} report · {report.when}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button
                        type="button"
                        className="tap"
                        onClick={() => router.push("/admin/reports")}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 3,
                          background: "transparent",
                          color: "var(--color-ink-secondary)",
                          border: "1px solid var(--color-border)",
                          borderRadius: 7,
                          padding: "4px 8px",
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        Review
                      </button>
                      <button
                        type="button"
                        className="tap"
                        onClick={() => store.approveReport(report.id)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 3,
                          background: "var(--color-terracotta)",
                          color: "var(--color-surface)",
                          border: 0,
                          borderRadius: 7,
                          padding: "4px 8px",
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        <Check size={11} strokeWidth={2} /> Approve
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
