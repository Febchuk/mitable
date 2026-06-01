"use client";

import type { ReportDetail as ReportDetailRow } from "@/lib/queries/reports";
import { ReportDetail } from "./index";

export function ReportWorkspace({
  report,
  backHref = "/app/reports",
}: {
  report: ReportDetailRow;
  backHref?: string;
}) {
  // Report editing always lives in the floating "Ask Mitable" pill (ChatDock on
  // desktop, full-screen route on mobile) — no in-page drawer.
  return <ReportDetail report={report} backToReportsHref={backHref} chatMode="dock" />;
}
