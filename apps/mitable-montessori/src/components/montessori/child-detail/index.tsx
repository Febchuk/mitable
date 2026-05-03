"use client";

import * as React from "react";
import type { Child } from "../data";
import { ToastBus } from "../primitives";
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

export function ChildDetail({ child }: { child: Child }) {
  const mobile = useIsMobile();
  const [pageView, setPageView] = React.useState<PageView>("whole");
  const [newObsOpen, setNewObsOpen] = React.useState(false);

  const onNewObservation = () => setNewObsOpen(true);
  const onGenerateReport = () => {
    ToastBus.push({ message: "Report drafting from this view is coming soon" });
  };

  return (
    <div className="cd-root">
      <ChildPageHeader
        child={child}
        mobile={mobile}
        onNewObservation={onNewObservation}
        onGenerateReport={onGenerateReport}
      />
      <ViewToggle value={pageView} onChange={setPageView} mobile={mobile} />
      {pageView === "whole" && <WholeChildView mobile={mobile} />}
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
