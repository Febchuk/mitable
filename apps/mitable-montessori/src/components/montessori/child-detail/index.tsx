"use client";

import * as React from "react";
import { ChildEditorDialog } from "@/components/admin/child-editor-dialog";
import { ToastBus } from "../primitives";
import type { ActivityFeedEntry } from "@/lib/queries/activity";
import type { CurriculumByTopic } from "@/lib/queries/curriculum";
import type { StudentProfile } from "@/lib/queries/student-profile";
import type { AxisWithAssessment, WholeChildObservation } from "@/lib/queries/whole-child";
import { ActivityView } from "./activity";
import { ChildPageHeader, ViewToggle, type PageView } from "./child-page-header";
import { CurriculumView } from "./curriculum";
import { NewObservationModal } from "./new-observation-modal";
import { useIsMobile } from "./use-is-mobile";
import { WholeChildView } from "./whole-child";
import "./child-detail.css";

export type ChildDetailProps = {
  profile: StudentProfile;
  axes: AxisWithAssessment[];
  observations: WholeChildObservation[];
  curriculum: CurriculumByTopic[];
  activity: ActivityFeedEntry[];
  /** Base path for report links from the activity feed (teacher vs admin rail). */
  reportsRailBasePath: string;
  /** Back link in the page header (roster vs admin classrooms, etc.). */
  rosterBackLink?: { href: string; label: string };
  /** Only admins can change child and guardian records. */
  canManage?: boolean;
};

export function ChildDetail({
  profile,
  axes,
  observations,
  curriculum,
  activity,
  reportsRailBasePath,
  rosterBackLink = { href: "/app/roster", label: "All children" },
  canManage = false,
}: ChildDetailProps) {
  const mobile = useIsMobile();
  const [pageView, setPageView] = React.useState<PageView>("activity");
  const [newObsOpen, setNewObsOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);

  return (
    <div className="cd-root">
      <ChildPageHeader
        profile={profile}
        mobile={mobile}
        backHref={rosterBackLink.href}
        backLabel={rosterBackLink.label}
        onNewObservation={() => setNewObsOpen(true)}
        onGenerateReport={() =>
          ToastBus.push({ message: "Report drafting from this view is coming soon" })
        }
        onEdit={canManage ? () => setEditOpen(true) : undefined}
      />
      <GuardianDetails profile={profile} canManage={canManage} onEdit={() => setEditOpen(true)} />
      <ViewToggle value={pageView} onChange={setPageView} mobile={mobile} />
      {pageView === "whole" && (
        <WholeChildView mobile={mobile} profile={profile} axes={axes} observations={observations} />
      )}
      {pageView === "curriculum" && <CurriculumView mobile={mobile} topics={curriculum} />}
      {pageView === "activity" && (
        <ActivityView
          mobile={mobile}
          entries={activity}
          reportsRailBasePath={reportsRailBasePath}
        />
      )}
      <NewObservationModal
        open={newObsOpen}
        pageView={pageView}
        onClose={() => setNewObsOpen(false)}
        mobile={mobile}
        studentId={profile.id}
        axes={axes}
        curriculum={curriculum}
      />
      {canManage ? (
        <ChildEditorDialog
          open={editOpen}
          studentId={profile.id}
          onOpenChange={setEditOpen}
          onSaved={() => window.location.reload()}
        />
      ) : null}
    </div>
  );
}

function GuardianDetails({
  profile,
  canManage,
  onEdit,
}: {
  profile: StudentProfile;
  canManage: boolean;
  onEdit: () => void;
}) {
  return (
    <section
      style={{
        padding: "18px 28px",
        borderBottom: "1px solid var(--color-border)",
        background: "var(--color-canvas)",
      }}
    >
      <div
        style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start" }}
      >
        <div>
          <div className="label-cap" style={{ color: "var(--color-ink-muted)" }}>
            Guardians
          </div>
          <p style={{ margin: "5px 0 0", fontSize: 13, color: "var(--color-ink-secondary)" }}>
            {profile.guardians.length === 0
              ? "No guardian details have been added yet."
              : `${profile.guardians.length} ${profile.guardians.length === 1 ? "guardian" : "guardians"} linked to this child.`}
          </p>
        </div>
        {canManage ? (
          <button type="button" className="ghost-btn tap" onClick={onEdit}>
            Edit guardians
          </button>
        ) : null}
      </div>
      {profile.guardians.length > 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
            gap: 10,
            marginTop: 14,
          }}
        >
          {profile.guardians.map((guardian) => (
            <div
              key={guardian.id}
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: 12,
                padding: "12px 14px",
                background: "var(--color-surface)",
              }}
            >
              <div style={{ display: "flex", gap: 7, alignItems: "baseline", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{guardian.name}</span>
                <span style={{ color: "var(--color-ink-muted)", fontSize: 12 }}>
                  {guardian.relationship ?? "Guardian"}
                  {guardian.primary ? " · primary contact" : ""}
                </span>
              </div>
              {guardian.email ? (
                <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--color-ink-secondary)" }}>
                  {guardian.email}
                </div>
              ) : null}
              {guardian.phone ? (
                <div style={{ marginTop: 3, fontSize: 12.5, color: "var(--color-ink-secondary)" }}>
                  {guardian.phone}
                </div>
              ) : null}
              <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--color-ink-muted)" }}>
                {guardian.accountActive
                  ? "Parent account active"
                  : guardian.receivesReports !== false
                    ? "Eligible for reports"
                    : "Reports turned off"}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
