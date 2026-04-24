export type Role = "admin" | "teacher-primary" | "teacher-elementary";

export type CurriculumLevel = "primary" | "elementary" | "both";

export type MasteryLevel = "not-introduced" | "introduced" | "practising" | "mastered";

export type InputMethod = "text" | "voice" | "photo" | "grid" | "agent";

export interface School {
    id: string;
    name: string;
}

export interface Teacher {
    id: string;
    name: string;
    email: string;
    classroomIds: string[];
}

export interface Classroom {
    id: string;
    name: string;
    level: CurriculumLevel;
    ageRange: string;
    teacherId: string;
    studentIds: string[];
}

export interface Student {
    id: string;
    name: string;
    age: number;
    classroomId: string;
}

export interface Topic {
    id: string;
    name: string;
    domainId: string;
    level: CurriculumLevel;
    active: boolean;
}

export interface Domain {
    id: string;
    name: string;
    level: CurriculumLevel;
    order: number;
    colorHue: number; // 0-360 — drives header tint on the grid
    active: boolean;
    topicIds: string[];
}

export interface Observation {
    id: string;
    studentId: string;
    topicId: string;
    level: MasteryLevel;
    note: string | null;
    summary: string | null; // AI-extracted summary shown in timeline
    createdAt: string; // ISO
    inputMethod: InputMethod;
    authorType: "teacher" | "agent";
    authorId: string; // teacherId or "agent"
    sessionId?: string; // for session-highlight
}

export interface AttendanceEntry {
    id: string;
    studentId: string;
    date: string; // YYYY-MM-DD
    status: "present" | "absent" | "not-recorded";
    note?: string;
}

export type ReportType = "end-of-term" | "activity-update";
export type ReportStatus = "draft" | "approved" | "sent";

export interface ReportDomainSection {
    domainId: string;
    narrative: string;
}

export interface Report {
    id: string;
    studentId: string;
    classroomId: string;
    type: ReportType;
    status: ReportStatus;
    createdAt: string;
    approvedAt?: string;
    sentAt?: string;
    sections: ReportDomainSection[];
    summary: string;
}

// ─── Agent types ─────────────────────────────────────────────────────

export type AgentMessageRole = "user" | "agent";

export type AgentCardKind =
    | "confirmation"
    | "progress"
    | "grid-preview"
    | "report-preview"
    | "text-answer";

export interface ConfirmationChange {
    kind: "observation" | "attendance" | "curriculum" | "assignment" | "classroom-edit";
    icon?: string;
    summary: string;
    payload: Record<string, unknown>;
}

export interface ConfirmationCard {
    kind: "confirmation";
    heading: string;
    changes: ConfirmationChange[];
    status: "pending" | "confirmed" | "cancelled";
    committedAt?: string;
}

export interface ProgressCard {
    kind: "progress";
    label: string;
}

export interface GridPreviewCard {
    kind: "grid-preview";
    studentId: string;
}

export interface ReportPreviewCard {
    kind: "report-preview";
    draft: Report;
    status: "pending" | "approved";
}

export interface TextAnswerCard {
    kind: "text-answer";
    text: string;
}

export type AgentCard =
    | ConfirmationCard
    | ProgressCard
    | GridPreviewCard
    | ReportPreviewCard
    | TextAnswerCard;

export interface AgentMessage {
    id: string;
    role: AgentMessageRole;
    createdAt: string;
    text?: string; // plain text for user and agent text-only messages
    inputMethod?: InputMethod; // for user messages
    attachment?: { kind: "photo"; dataUrl: string; caption?: string };
    card?: AgentCard;
}

export interface AgentThread {
    id: string;
    role: Role;
    title: string;
    createdAt: string;
    messages: AgentMessage[];
}
