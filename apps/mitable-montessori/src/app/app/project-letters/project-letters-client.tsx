"use client";
import * as React from "react";
import Link from "next/link";
import { NewReportTrigger } from "@/components/montessori/new-report";
import type { ReportListRowV2 } from "@/lib/queries/reports";
export function ProjectLettersClient({ letters }: { letters: ReportListRowV2[] }) {
  const kinds = React.useMemo(() => ["Project" as const], []);
  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="font-display text-3xl">Project letters</h1>
      <p className="mt-2 text-sm text-ink-secondary">
        Write and send a separate letter to each child’s family.
      </p>
      <div className="mt-5">
        <NewReportTrigger kinds={kinds} />
      </div>
      <div className="mt-6 divide-y divide-border rounded-xl border border-border bg-surface">
        {letters.length === 0 && <p className="p-5 text-sm">No project letters yet.</p>}
        {letters.map((letter) => (
          <Link
            className="block p-4 hover:bg-canvas"
            key={letter.id}
            href={`/app/reports/${letter.id}`}
          >
            <span className="font-medium">{letter.studentName}</span> ·{" "}
            {letter.title ?? "Project letter"}
            <span className="ml-3 text-sm text-ink-secondary">
              {letter.status.replaceAll("_", " ")}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
