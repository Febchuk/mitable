"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import type { ReportPdfData } from "@/lib/pdf/report-template";
import { ReportDocument } from "@/lib/pdf/report-template";

const DEBOUNCE_MS = 600;

const PDFViewer = dynamic(
  () => import("@react-pdf/renderer").then((m) => ({ default: m.PDFViewer })),
  {
    ssr: false,
    loading: () => <PdfSkeleton />,
  }
);

function PdfSkeleton() {
  return (
    <div className="rd-pdf-skeleton" aria-hidden>
      <div className="rd-pdf-skeleton-band" />
      <div className="rd-pdf-skeleton-body">
        <div className="rd-pdf-skeleton-line" style={{ width: "60%" }} />
        <div className="rd-pdf-skeleton-line" style={{ width: "85%" }} />
        <div className="rd-pdf-skeleton-line" style={{ width: "75%" }} />
        <div className="rd-pdf-skeleton-line" style={{ width: "90%" }} />
      </div>
    </div>
  );
}

class PreviewErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: unknown) {
    console.warn("[pdf-preview] render failed:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="rd-pdf-preview-error">
          <p>Preview unavailable. Switch back to Editor to continue editing.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export function PdfPreviewPane({ data }: { data: ReportPdfData }) {
  // Debounce: only swap the displayed data after the user pauses editing for
  // DEBOUNCE_MS. Avoids rebuilding the PDF on every keystroke.
  const [displayData, setDisplayData] = React.useState<ReportPdfData>(data);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setDisplayData(data);
      timer.current = null;
    }, DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [data]);

  return (
    <div className="rd-pdf-preview">
      <PreviewErrorBoundary>
        <PDFViewer showToolbar={false} width="100%" height="100%" className="rd-pdf-preview-iframe">
          <ReportDocument data={displayData} />
        </PDFViewer>
      </PreviewErrorBoundary>
    </div>
  );
}
