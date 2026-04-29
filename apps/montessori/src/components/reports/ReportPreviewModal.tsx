"use client";

import * as React from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth/AuthContext";
import { useCurriculum, useReport } from "@/lib/query/montessoriQueries";
import type { Classroom, Report, Student, Teacher } from "@/types";

interface ReportPreviewModalProps {
  report: Report | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: Student[];
  classrooms: Classroom[];
  teachers?: Teacher[];
}

export function ReportPreviewModal({
  report,
  open,
  onOpenChange,
  students,
  classrooms,
  teachers,
}: ReportPreviewModalProps) {
  const { me } = useAuth();
  const curriculum = useCurriculum();
  const domains = curriculum.data?.domains ?? [];

  // The list endpoint /api/montessori/reports omits `sections` to keep the
  // payload small; only the detail endpoint /reports/:id returns them.
  // Fetch the full record when the modal is open so the section narratives
  // actually render.
  const fullReport = useReport(open && report ? report.id : null);
  const detailed: Report | null = fullReport.data ?? report ?? null;

  if (!detailed) return null;
  const student = students.find((s) => s.id === detailed.studentId);
  const classroom = classrooms.find((c) => c.id === detailed.classroomId);
  const teacher = teachers?.find((t) => t.id === classroom?.teacherId);
  const schoolName = me?.organization?.name ?? "School";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 bg-[#F5F1E6] text-[#1A1916]">
        <div
          className="p-8 font-serif max-h-[80vh] overflow-y-auto"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          <DialogHeader>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#6B665C] font-semibold mb-1">
              {schoolName} · {classroom?.name}
            </div>
            <DialogTitle className="text-3xl font-serif text-[#1A1916]">
              {student?.name} ·{" "}
              {detailed.type === "end-of-term" ? "End of Term Report" : "Activity Update"}
            </DialogTitle>
            <DialogDescription className="text-[#4A4640] text-sm italic mt-1">
              {new Date(detailed.createdAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
              {teacher && <> · Prepared by {teacher.name}</>}
            </DialogDescription>
          </DialogHeader>

          <div className="h-px bg-[#6B665C]/30 my-5" />

          <p className="text-[15px] leading-relaxed text-[#1A1916] italic">{detailed.summary}</p>

          <div className="mt-6 space-y-5">
            {(detailed.sections ?? []).map((sec) => {
              const domain = domains.find((d) => d.id === sec.domainId);
              return (
                <div key={sec.domainId}>
                  <h3 className="text-lg font-semibold tracking-tight mb-1">
                    {domain?.name ?? "Domain"}
                  </h3>
                  <p className="text-[14px] leading-relaxed text-[#2B2824]">{sec.narrative}</p>
                </div>
              );
            })}
          </div>

          <div className="h-px bg-[#6B665C]/30 my-6" />
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#6B665C] text-center">
            Shared with families of {schoolName}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
