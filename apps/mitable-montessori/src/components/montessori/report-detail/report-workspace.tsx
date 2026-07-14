"use client";

import type { ReportDetail as ReportDetailRow } from "@/lib/queries/reports";
import { ReportDetail } from "./index";

export function ReportWorkspace({
  report,
  backHref = "/app/reports",
  variant = "teacher",
}: {
  report: ReportDetailRow;
  backHref?: string;
  variant?: "teacher" | "admin";
}) {
  // Report editing always lives in the floating "Ask Mitable" pill (ChatDock on
  // desktop, full-screen route on mobile) — no in-page drawer.
  return (
    <ReportDetail report={report} backToReportsHref={backHref} variant={variant} chatMode="dock" />
  );
}
