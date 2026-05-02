"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { CHILDREN, findChild, initialsFor } from "@/components/montessori/data";
import { PageHeader, cardHeaderStyle, cardStyle } from "@/components/montessori/page-header";
import { Avatar, HandCheck, HandUnderline } from "@/components/montessori/primitives";
import { useMontessori } from "@/components/montessori/store";

const TODAY_LABEL = "Tuesday · April 30";

export default function TodayClient({ firstName }: { firstName: string | null }) {
  const store = useMontessori();
  const router = useRouter();
  const presentKids = CHILDREN.filter((c) => c.present);
  const observations = store.chat.filter((m) => m.type === "observation");
  const captured = observations.slice(-4).reverse();
  const drafts = store.reports.filter((r) => r.status === "draft");

  const goChat = () => {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      store.setWebChatMode("open");
    } else {
      router.push("/app/chat");
    }
  };

  const greetingName = firstName?.trim() || "there";

  return (
    <div>
      {/* Mobile-only header — replaces the desktop "Today" PageHeader */}
      <div
        className="lg:hidden"
        style={{
          padding: "26px 22px 10px",
        }}
      >
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
          The work cycle started 22 minutes ago.
        </div>
      </div>

      {/* Desktop header — hidden on mobile, where the block above takes its place */}
      <div className="hidden lg:block">
        <PageHeader
          overline={TODAY_LABEL}
          title="Today"
          subtitle="Work cycle started 22 minutes ago."
        />
      </div>

      <div
        className="lg:grid lg:grid-cols-[2fr_1fr] lg:gap-8"
        style={{ padding: "16px 24px 60px" }}
      >
        <div>
          <button
            type="button"
            className="tap"
            onClick={() => router.push("/app/roster")}
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
                Primrose Room
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
                  of {CHILDREN.length} children present
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

          {store.pendingObs > 0 && (
            <button
              type="button"
              className="tap anim-fade-in"
              onClick={goChat}
              style={{
                width: "100%",
                textAlign: "left",
                background: "var(--color-terracotta-soft)",
                border: "1px solid #E8C0AE",
                borderRadius: 16,
                padding: 16,
                marginTop: 14,
                display: "flex",
                alignItems: "center",
                gap: 14,
                cursor: "pointer",
              }}
            >
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 15,
                    color: "var(--color-ink)",
                    marginBottom: 2,
                  }}
                >
                  {store.pendingObs} observation{store.pendingObs > 1 ? "s" : ""} awaiting in chat
                </div>
                <div style={{ fontSize: 13, color: "var(--color-ink-secondary)" }}>
                  Tap chat below to review and approve.
                </div>
              </div>
              <ChevronRight size={18} strokeWidth={1.5} />
            </button>
          )}

          {/* Mobile-only: section label sits OUTSIDE the card */}
          <div
            className="lg:hidden label-cap"
            style={{
              color: "var(--color-ink-muted)",
              padding: "22px 4px 10px",
            }}
          >
            Captured today
          </div>

          <div style={{ ...cardStyle, marginTop: 0 }} className="lg:!mt-[18px]">
            {/* Desktop-only: in-card header with summary count */}
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
                {observations.length} observations · {store.pendingObs} awaiting in chat
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
                Nothing yet. Tap chat to capture an observation.
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
                    <>
                      {/* Mobile: small "pending" pill */}
                      <span
                        className="lg:hidden"
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
                      {/* Desktop: "in chat ↗" link to open the chat dock */}
                      <button
                        type="button"
                        className="tap hidden lg:inline-flex"
                        onClick={goChat}
                        style={{
                          alignItems: "center",
                          gap: 4,
                          fontSize: 12,
                          color: "var(--color-terracotta-deep)",
                          background: "var(--color-terracotta-soft)",
                          borderRadius: 8,
                          padding: "4px 10px",
                          fontWeight: 500,
                          border: 0,
                          flexShrink: 0,
                        }}
                      >
                        in chat
                        <ArrowUpRight size={12} strokeWidth={1.75} />
                      </button>
                    </>
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
                Drafts
              </div>
              <span style={{ fontSize: 12, color: "var(--color-ink-muted)" }}>
                {drafts.length} daily reports
              </span>
            </div>
            {drafts.length === 0 && (
              <div
                style={{
                  padding: 24,
                  fontSize: 13,
                  color: "var(--color-ink-muted)",
                  textAlign: "center",
                }}
              >
                All caught up.
              </div>
            )}
            {drafts.map((d) => {
              const child = findChild(d.childId);
              return (
                <div
                  key={d.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "14px 18px",
                    borderTop: "1px solid var(--color-border)",
                  }}
                >
                  <Avatar
                    initials={child ? initialsFor(child.name) : "··"}
                    tone={child ? child.tone : "clay"}
                    size={28}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{child ? child.name : ""}</div>
                    <div style={{ fontSize: 11, color: "var(--color-ink-muted)" }}>
                      Daily report · {d.when}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="tap"
                    onClick={() => store.approveReport(d.id)}
                    style={{
                      background: "var(--color-terracotta)",
                      color: "var(--color-surface)",
                      border: 0,
                      borderRadius: 8,
                      padding: "5px 10px",
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    Send
                  </button>
                </div>
              );
            })}
          </div>
          <div
            style={{
              marginTop: 18,
              padding: 22,
              background: "var(--color-surface)",
              borderRadius: 14,
              border: "1px solid var(--color-border)",
            }}
          >
            <div
              className="font-display"
              style={{ fontSize: 24, color: "var(--color-ink)", lineHeight: 1.15 }}
            >
              Take your time.
            </div>
            <div style={{ marginTop: 4, marginBottom: 10 }}>
              <HandUnderline width={120} color="var(--color-terracotta)" />
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--color-ink-secondary)",
                lineHeight: 1.55,
              }}
            >
              Tap <em>Ask Mitable</em> any time — by voice, photo, or note. Nothing syncs until you
              approve.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
