"use client";

import Dexie, { type Table } from "dexie";
import type {
  AttendanceProjRow,
  AxisAssessmentRow,
  AxisRow,
  ChatProposalRow,
  ClassroomRow,
  ClassroomTeacherRow,
  CommandRow,
  CurriculumEventRow,
  CurriculumRow,
  CurriculumSubtopicRow,
  CurriculumTopicRow,
  EnrollmentRow,
  ProgressProjRow,
  ReportRow,
  StudentGuardianRow,
  SyncMetaRow,
  WholeChildObservationRow,
} from "@/lib/db/types";

/** PII tables are stored as encrypted envelopes; decryption happens on read. */
export interface EncryptedPiiRow {
  id: string;
  schoolId: string;
  nameHash: string;
  ciphertext: { iv: string; ct: string };
}

export class MontessoriDb extends Dexie {
  roster!: Table<EncryptedPiiRow, string>;
  enrollments!: Table<EnrollmentRow, string>;
  classrooms!: Table<ClassroomRow, string>;
  classroomTeachers!: Table<ClassroomTeacherRow, string>;
  guardians!: Table<EncryptedPiiRow, string>;
  studentGuardians!: Table<StudentGuardianRow, string>;
  curricula!: Table<CurriculumRow, string>;
  curriculumTopics!: Table<CurriculumTopicRow, string>;
  curriculumSubtopics!: Table<CurriculumSubtopicRow, string>;
  commands!: Table<CommandRow, string>;
  attendanceProj!: Table<AttendanceProjRow, [string, string]>;
  progressProj!: Table<ProgressProjRow, [string, string, string]>;
  reports!: Table<ReportRow, string>;
  chatProposals!: Table<ChatProposalRow, string>;
  syncMeta!: Table<SyncMetaRow, string>;
  axes!: Table<AxisRow, string>;
  axisAssessments!: Table<AxisAssessmentRow, string>;
  wholeChildObservations!: Table<WholeChildObservationRow, string>;
  curriculumEvents!: Table<CurriculumEventRow, string>;

  constructor() {
    super("mitable-montessori");

    // v1 — original Phase 1 schema. Some teachers' browsers still hold a v1 DB
    // from before the `date` / `studentId` indices were added on attendanceProj.
    this.version(1).stores({
      roster: "id, nameHash, schoolId",
      enrollments: "id, studentId, classroomId, isPrimary",
      classrooms: "id, curriculumId",
      classroomTeachers: "id, classroomId, teacherUserId",
      guardians: "id, nameHash, schoolId",
      studentGuardians: "id, studentId, guardianId, receivesReports",
      curricula: "id, schoolId, isActive",
      curriculumTopics: "id, curriculumId, sortOrder",
      curriculumSubtopics: "id, topicId, sortOrder",
      commands: "id, clientId, status, createdAt, syncedAt",
      attendanceProj: "[studentId+date]",
      progressProj: "[studentId+subtopicId+classroomId]",
      reports: "id, studentId, status",
      chatProposals: "id, threadId, status, createdAt",
      syncMeta: "key",
    });

    // v2 — adds `date` + `studentId` indices to attendanceProj so the Today
    // page can do `where("date").equals(today).count()` without a SchemaError.
    // Dexie auto-rebuilds the indices on upgrade.
    this.version(2).stores({
      attendanceProj: "[studentId+date], date, studentId",
    });

    // v3 — whole-child assessment tables (migration 0012). Active assessments
    // are filtered via where("endedAt").equals(null), so we only need a
    // student+axis index for the lookup.
    this.version(3).stores({
      axes: "id, schoolId, key, sortOrder",
      axisAssessments: "id, [studentId+axisKey], studentId, endedAt",
      wholeChildObservations: "id, studentId, [studentId+axisKey], createdAt",
    });

    // v4 — curriculum_events table (migration 0013). Backs the Activity
    // tab's curriculum half + lets us read the per-subtopic event log
    // without re-deriving from student_progress_history.
    this.version(4).stores({
      curriculumEvents: "id, studentId, [studentId+subtopicId], createdAt",
    });

    // v5 — chat proposals gain `source` ("local" | "server") + `intentScore`
    // columns so we can audit on-device vs Haiku-fallback resolution. No new
    // index needed; existing rows are backfilled with source="server" and
    // intentScore=null because they were written before the local resolver
    // existed.
    this.version(5)
      .stores({
        chatProposals: "id, threadId, status, createdAt",
      })
      .upgrade(async (tx) => {
        const table = tx.table<ChatProposalRow>("chatProposals");
        await table.toCollection().modify((row) => {
          if (row.source === undefined) row.source = "server";
          if (row.intentScore === undefined) row.intentScore = null;
        });
      });
  }
}

let cached: MontessoriDb | null = null;

export function getDb() {
  if (!cached) {
    cached = new MontessoriDb();
  }
  return cached;
}

export async function clearDb() {
  if (!cached) return;
  await cached.delete();
  cached = null;
}
