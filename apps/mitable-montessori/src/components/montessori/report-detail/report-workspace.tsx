"use client";

import type { ReportDetail as ReportDetailRow } from "@/lib/queries/reports";
import { addTodayProgressAndAgent } from "@/lib/feature-flags";
import { ReportDetail } from "./index";

export function ReportWorkspace({
  report,
  backHref = "/app/reports",
}: {
  report: ReportDetailRow;
  backHref?: string;
}) {
  const legacyChat = addTodayProgressAndAgent();
  const chatMode = legacyChat ? "dock" : "drawer";

  return <ReportDetail report={report} backToReportsHref={backHref} chatMode={chatMode} />;
}
