// Local Dexie row shapes. PII tables (Roster, Guardian, StudentGuardian) are
// transparently encrypted at rest by the encryptedTable hooks — values arrive
// here decrypted. The plaintext index seed (a name HMAC) is stored separately.

export interface RosterRow {
  id: string;
  firstName: string;
  lastName: string;
  preferredName?: string | null;
  birthDate?: string | null;
  nicknames: string[];
  notes?: string | null;
  schoolId: string;
  /** HMAC of (firstName + lastName) lowercased — searchable while ciphertext stays encrypted. */
  nameHash: string;
}

export interface EnrollmentRow {
  id: string;
  studentId: string;
  classroomId: string;
  startDate: string;
  endDate: string | null;
  isPrimary: boolean;
}

export interface ClassroomRow {
  id: string;
  schoolId: string;
  curriculumId: string | null;
  name: string;
  code: string | null;
  status: string;
}

export interface ClassroomTeacherRow {
  id: string;
  classroomId: string;
  teacherUserId: string;
  classroomRole: "lead" | "support" | "assistant" | null;
  startDate: string;
  endDate: string | null;
}

export interface GuardianRow {
  id: string;
  schoolId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  preferredContactMethod: "email" | "phone" | "either" | null;
  nameHash: string;
}

export interface StudentGuardianRow {
  id: string;
  studentId: string;
  guardianId: string;
  relationship: string | null;
  isPrimaryContact: boolean;
  receivesReports: boolean;
}

export interface CurriculumRow {
  id: string;
  schoolId: string;
  name: string;
  framework: string;
  isActive: boolean;
}

export interface CurriculumTopicRow {
  id: string;
  curriculumId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface CurriculumSubtopicRow {
  id: string;
  topicId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  aliases: string[];
}

export type CommandType = "attendance" | "progress" | "note";

export interface AttendancePayload {
  student_id: string;
  status: "present" | "absent";
  date: string;
  comment?: string;
}

export interface ProgressPayload {
  student_id: string;
  subtopic_id: string;
  status: "introduced" | "practicing" | "mastered" | "na";
  comment?: string;
}

export interface NotePayload {
  student_id: string;
  text: string;
}

export type CommandPayload = AttendancePayload | ProgressPayload | NotePayload;

export interface CommandRow {
  id: string;
  clientId: string;
  schoolId: string;
  userId: string;
  classroomId: string;
  source: "voice" | "photo" | "text";
  rawTranscript: string | null;
  commandType: CommandType;
  payload: CommandPayload;
  status: "pending" | "approved" | "retracted";
  createdAt: string;
  approvedAt: string | null;
  syncedAt: string | null;
}

export interface AttendanceProjRow {
  studentId: string;
  date: string;
  status: "present" | "absent";
  comment: string | null;
  sourceCommandId: string;
  updatedAt: string;
}

export interface ProgressProjRow {
  studentId: string;
  subtopicId: string;
  classroomId: string;
  status: "introduced" | "practicing" | "mastered" | "na";
  comment: string | null;
  sourceCommandId: string;
  updatedAt: string;
}

export type ChatProposalStatus = "proposed" | "approved" | "rejected";

export interface ChatProposalRow {
  id: string;
  threadId: string;
  createdAt: string;
  status: ChatProposalStatus;
  toolName: string;
  /** Tokenized payload (still has [STUDENT_n] tokens). */
  tokenizedPayload: Record<string, unknown>;
  /** Detokenized payload (real UUIDs + display names) — used when applying. */
  resolvedPayload: Record<string, unknown>;
  /** Display string, e.g. "Mark Lina present today". */
  display: string;
  /** Filled in once the approve handler writes the matching commands.id. */
  commandId?: string;
}

export interface ReportRow {
  id: string;
  studentId: string;
  status: string;
  reportType: "daily" | "major";
  title: string | null;
  body: string | null;
  updatedAt: string;
}

export interface SyncMetaRow {
  key: string;
  value: string;
}

// Whole-child assessment data model (migration 0012).

export type AxisLevel = "Emerging" | "Practicing" | "Deepening" | "Leading";

export interface AxisRow {
  id: string;
  schoolId: string;
  key: string;
  label: string;
  /** { Emerging: "...", Practicing: "...", Deepening: "...", Leading: "..." } */
  descriptors: Record<AxisLevel, string>;
  sortOrder: number;
  isActive: boolean;
}

export interface AxisAssessmentRow {
  id: string;
  studentId: string;
  axisKey: string;
  level: AxisLevel;
  assessedAt: string;
  endedAt: string | null;
  sourceObservationId: string | null;
  authorUserId: string | null;
}

export interface WholeChildObservationRow {
  id: string;
  studentId: string;
  axisKey: string;
  fromLevel: AxisLevel | null;
  toLevel: AxisLevel | null;
  note: string;
  /** Optional FK to commands(id) — the curriculum-side observation that prompted this note. */
  sourceObservationId: string | null;
  authorUserId: string;
  createdAt: string;
}
