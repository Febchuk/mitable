"use client";

import * as React from "react";
import { ToastBus } from "../primitives";
import type { StudentProfile } from "@/lib/queries/student-profile";
import type { AxisWithAssessment, WholeChildObservation } from "@/lib/queries/whole-child";
import { ActivityView } from "./activity";
import {
  ChildPageHeader,
  NewObservationModal,
  ViewToggle,
  type PageView,
} from "./child-page-header";
import { CurriculumView } from "./curriculum";
import { useIsMobile } from "./use-is-mobile";
import { WholeChildView } from "./whole-child";
import "./child-detail.css";

export type ChildDetailProps = {
  profile: StudentProfile;
  axes: AxisWithAssessment[];
  observations: WholeChildObservation[];
};

export function ChildDetail({ profile, axes, observations }: ChildDetailProps) {
  const mobile = useIsMobile();
  const [pageView, setPageView] = React.useState<PageView>("whole");
  const [newObsOpen, setNewObsOpen] = React.useState(false);

  return (
    <div className="cd-root">
      <ChildPageHeader
        profile={profile}
        mobile={mobile}
        onNewObservation={() => setNewObsOpen(true)}
        onGenerateReport={() =>
          ToastBus.push({ message: "Report drafting from this view is coming soon" })
        }
      />
      <ViewToggle value={pageView} onChange={setPageView} mobile={mobile} />
      {pageView === "whole" && (
        <WholeChildView mobile={mobile} profile={profile} axes={axes} observations={observations} />
      )}
      {pageView === "curriculum" && <CurriculumView mobile={mobile} />}
      {pageView === "activity" && <ActivityView mobile={mobile} />}
      <NewObservationModal
        open={newObsOpen}
        pageView={pageView}
        onClose={() => setNewObsOpen(false)}
        mobile={mobile}
      />
    </div>
  );
}
