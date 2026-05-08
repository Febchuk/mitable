import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { ReportDocument, type ReportPdfData } from "./report-template";

export async function generateReportPdf(data: ReportPdfData): Promise<{
  buffer: Buffer;
  filename: string;
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(ReportDocument, { data }) as any;
  const buffer = await renderToBuffer(element);

  const safeName = data.studentName.replace(/[^a-zA-Z0-9]/g, "-");
  const dateSlug = data.reportDate
    ? new Date(data.reportDate).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const filename = `${safeName}-${data.reportType}-Report-${dateSlug}.pdf`;

  return { buffer: Buffer.from(buffer), filename };
}
