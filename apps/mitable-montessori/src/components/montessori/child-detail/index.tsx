"use client";

import * as React from "react";
import { Pencil, Plus } from "lucide-react";
import {
  ChildEditorDialog,
  GuardianEditorDialog,
  type GuardianEditorValue,
} from "@/components/admin/child-editor-dialog";
import { ToastBus } from "../primitives";
import type { ActivityFeedEntry } from "@/lib/queries/activity";
import type { CurriculumByTopic } from "@/lib/queries/curriculum";
import type { StudentProfile } from "@/lib/queries/student-profile";
import type { AxisWithAssessment, WholeChildObservation } from "@/lib/queries/whole-child";
import { ActivityView } from "./activity";
import { ChildPageHeader, ViewToggle, type PageView } from "./child-page-header";
import { CurriculumView } from "./curriculum";
import { NewObservationModal } from "./new-observation-modal";
import { StudentMediaCapture, StudentMediaLibrary } from "./student-media";
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
  const [mediaCaptureOpen, setMediaCaptureOpen] = React.useState(false);
  const [mediaRefreshKey, setMediaRefreshKey] = React.useState(0);
  const [editOpen, setEditOpen] = React.useState(false);

  return (
    <div className="cd-root">
      <ChildPageHeader
        profile={profile}
        mobile={mobile}
        backHref={rosterBackLink.href}
        backLabel={rosterBackLink.label}
        onAddMedia={() => setMediaCaptureOpen(true)}
        onNewObservation={() => setNewObsOpen(true)}
        onGenerateReport={() =>
          ToastBus.push({ message: "Report drafting from this view is coming soon" })
        }
        onEdit={canManage ? () => setEditOpen(true) : undefined}
      />
      <ViewToggle value={pageView} onChange={setPageView} mobile={mobile} />
      {pageView === "whole" && (
        <WholeChildView mobile={mobile} profile={profile} axes={axes} observations={observations} />
      )}
      {pageView === "curriculum" && <CurriculumView mobile={mobile} topics={curriculum} />}
      {pageView === "activity" && (
        <>
          <StudentMediaLibrary
            studentId={profile.id}
            studentName={profile.preferredName || profile.fullName}
            refreshKey={mediaRefreshKey}
            mobile={mobile}
            onAddMedia={() => setMediaCaptureOpen(true)}
          />
          <ActivityView
            mobile={mobile}
            entries={activity}
            reportsRailBasePath={reportsRailBasePath}
          />
        </>
      )}
      {pageView === "guardians" && <GuardiansView profile={profile} canManage={canManage} />}
      <NewObservationModal
        open={newObsOpen}
        pageView={pageView}
        onClose={() => setNewObsOpen(false)}
        mobile={mobile}
        studentId={profile.id}
        axes={axes}
        curriculum={curriculum}
      />
      <StudentMediaCapture
        open={mediaCaptureOpen}
        studentId={profile.id}
        studentName={profile.preferredName || profile.fullName}
        onClose={() => setMediaCaptureOpen(false)}
        onShared={() => setMediaRefreshKey((key) => key + 1)}
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

function GuardiansView({ profile, canManage }: { profile: StudentProfile; canManage: boolean }) {
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [selectedGuardian, setSelectedGuardian] = React.useState<GuardianEditorValue | null>(null);

  const openAdd = () => {
    setSelectedGuardian(null);
    setEditorOpen(true);
  };

  const openEdit = (guardian: StudentProfile["guardians"][number]) => {
    const nameParts = guardian.name.trim().split(/\s+/);
    setSelectedGuardian({
      id: guardian.id,
      firstName: guardian.firstName ?? nameParts[0] ?? "",
      lastName: guardian.lastName ?? nameParts.slice(1).join(" "),
      email: guardian.email ?? "",
      phone: guardian.phone ?? "",
      preferredContactMethod: guardian.preferredContactMethod ?? "either",
      relationship: (guardian.relationship as GuardianEditorValue["relationship"]) ?? "guardian",
      primary: guardian.primary,
      receivesReports: guardian.receivesReports !== false,
      accountActive: guardian.accountActive ?? false,
    });
    setEditorOpen(true);
  };

  return (
    <section style={{ padding: "28px", maxWidth: 1120, margin: "0 auto", width: "100%" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          alignItems: "start",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div className="label-cap" style={{ color: "var(--color-ink-muted)", marginBottom: 8 }}>
            Guardians
          </div>
          <h2 style={{ margin: 0, fontSize: 22, color: "var(--color-ink)" }}>Family contacts</h2>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--color-ink-secondary)" }}>
            {profile.guardians.length === 0
              ? "No guardians have been added for this child yet."
              : "Contact details, relationship, and report preferences for this child."}
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            className="primary-btn tap"
            onClick={openAdd}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, whiteSpace: "nowrap" }}
          >
            <Plus size={16} strokeWidth={1.8} /> Add guardian
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
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  alignItems: "start",
                }}
              >
                <div style={{ display: "flex", gap: 7, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{guardian.name}</span>
                  <span style={{ color: "var(--color-ink-muted)", fontSize: 12 }}>
                    {guardian.relationship ?? "Guardian"}
                    {guardian.primary ? " · primary contact" : ""}
                  </span>
                </div>
                {canManage ? (
                  <button
                    type="button"
                    className="tap rounded-md p-1.5 text-ink-muted hover:bg-ink/5 hover:text-ink"
                    title={`Edit ${guardian.name}`}
                    aria-label={`Edit ${guardian.name}`}
                    onClick={() => openEdit(guardian)}
                  >
                    <Pencil size={15} strokeWidth={1.7} />
                  </button>
                ) : null}
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
      {canManage ? (
        <GuardianEditorDialog
          open={editorOpen}
          studentId={profile.id}
          guardian={selectedGuardian}
          onOpenChange={setEditorOpen}
          onSaved={() => window.location.reload()}
        />
      ) : null}
    </section>
  );
}
