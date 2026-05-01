"use client";

import Dexie, { type Table } from "dexie";
import type {
  AttendanceProjRow,
  ChatProposalRow,
  ClassroomRow,
  ClassroomTeacherRow,
  CommandRow,
  CurriculumRow,
  CurriculumSubtopicRow,
  CurriculumTopicRow,
  EnrollmentRow,
  ProgressProjRow,
  ReportRow,
  StudentGuardianRow,
  SyncMetaRow,
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

  constructor() {
    super("mitable-montessori");
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
