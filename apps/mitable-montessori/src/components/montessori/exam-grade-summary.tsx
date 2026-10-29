import React from "react";
import type { ExamGradeReportSummary } from "@/lib/reports/exam-grades-payload";

export function ExamGradeSummary({ summary }: { summary: ExamGradeReportSummary }) {
  return (
    <div className="space-y-4 text-sm">
      {summary.rows?.length ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[480px] text-left">
            <thead className="bg-muted text-xs text-ink-secondary">
              <tr>
                {["Subject", "CA /40", "Class participation /20", "AFL /40", "Total /100"].map(
                  (label) => (
                    <th key={label} className="px-3 py-2">
                      {label}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {summary.rows.map((row, index) => (
                <tr key={`${row.subject}-${row.assessmentName}-${index}`}>
                  <th scope="row" className="px-3 py-2 font-medium">
                    {row.subject}
                    <span className="block text-xs font-normal text-ink-secondary">
                      {row.assessmentName}
                    </span>
                  </th>
                  {[row.caScore, row.classParticipationScore, row.aflScore, row.total].map(
                    (score, index) => (
                      <td key={index} className="px-3 py-2">
                        {score ?? "—"}
                      </td>
                    )
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="rounded-lg border border-border p-3">
        <p className="font-semibold text-ink">
          Overall average: {summary.averagePercentage}%
          {summary.overallGradeLabel ? ` · Overall grade: ${summary.overallGradeLabel}` : ""}
        </p>
        <p className="mt-2 whitespace-pre-wrap text-ink-secondary">
          Comments: {summary.comment?.trim() || "—"}
        </p>
      </div>
    </div>
  );
}
