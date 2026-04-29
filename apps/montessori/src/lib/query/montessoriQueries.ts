"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { apiRequest } from "@/lib/api/client";
import type {
    AgentMessage,
    AgentMessageRole,
    AgentThread,
    AttendanceEntry,
    Classroom,
    Domain,
    InputMethod,
    MasteryLevel,
    Observation,
    Report,
    Student,
    Teacher,
    Topic,
} from "@/types";

/**
 * React Query hooks for every Montessori read endpoint. Each hook
 * adapts the wire format (snake_case-ish DB shape, ISO strings, no
 * derived fields) to the in-app type shape that pages already
 * consume, so swapping a `useStore()` array for one of these hooks
 * is mostly a one-line change on the consumer side.
 *
 * Mutation hooks (writes) live separately — they land in commit 1.3
 * once the backend write endpoints exist.
 */

// ─── Wire types (local to this module) ───────────────────────────────

interface WireClassroom {
    id: string;
    name: string;
    level: "primary" | "elementary" | "both";
    ageRange: string | null;
    teacherId: string | null;
}

interface WireStudent {
    id: string;
    name: string;
    age: number | null;
    classroomId: string;
}

interface WireDomain {
    id: string;
    name: string;
    level: "primary" | "elementary" | "both";
    colorHue: number;
    active: boolean;
    sortOrder: number;
}

interface WireTopic {
    id: string;
    domainId: string;
    name: string;
    level: "primary" | "elementary" | "both";
    active: boolean;
    sortOrder: number;
}

interface WireObservation {
    id: string;
    studentId: string;
    topicId: string;
    level: MasteryLevel;
    note: string | null;
    summary?: string | null;
    inputMethod: string;
    authorType: string;
    createdAt: string;
}

interface WireAttendance {
    id: string;
    studentId: string;
    date: string;
    status: "present" | "absent";
    note: string | null;
}

interface WireTeacher {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
}

interface WireThread {
    id: string;
    title: string;
    roleAtCreation: "admin" | "teacher-primary" | "teacher-elementary";
    createdAt: string;
    updatedAt: string;
}

interface WireMessage {
    id: string;
    role: "user" | "agent";
    text: string | null;
    card: unknown | null;
    inputMethod: string | null;
    attachmentMeta: unknown | null;
    createdAt: string;
}

// ─── Adapters ────────────────────────────────────────────────────────

function adaptClassroom(c: WireClassroom): Classroom {
    return {
        id: c.id,
        name: c.name,
        level: c.level,
        ageRange: c.ageRange ?? "",
        teacherId: c.teacherId ?? "",
        // Populated by the consumer when it pairs students to classrooms;
        // not every endpoint returns the roster inline.
        studentIds: [],
    };
}

function adaptStudent(s: WireStudent): Student {
    return {
        id: s.id,
        name: s.name,
        age: s.age ?? 0,
        classroomId: s.classroomId,
    };
}

function adaptDomain(d: WireDomain, topicIdsByDomainId: Map<string, string[]>): Domain {
    return {
        id: d.id,
        name: d.name,
        level: d.level,
        order: d.sortOrder,
        colorHue: d.colorHue,
        active: d.active,
        topicIds: topicIdsByDomainId.get(d.id) ?? [],
    };
}

function adaptTopic(t: WireTopic): Topic {
    return {
        id: t.id,
        domainId: t.domainId,
        name: t.name,
        level: t.level,
        active: t.active,
    };
}

function adaptObservation(o: WireObservation): Observation {
    return {
        id: o.id,
        studentId: o.studentId,
        topicId: o.topicId,
        level: o.level,
        note: o.note,
        summary: o.summary ?? o.note ?? null,
        createdAt: o.createdAt,
        inputMethod: (o.inputMethod as InputMethod) ?? "grid",
        authorType: o.authorType === "agent" ? "agent" : "teacher",
        authorId: o.authorType === "agent" ? "agent" : "teacher",
    };
}

function adaptAttendance(a: WireAttendance): AttendanceEntry {
    return {
        id: a.id,
        studentId: a.studentId,
        date: a.date,
        status: a.status,
        note: a.note ?? undefined,
    };
}

function adaptTeacher(t: WireTeacher): Teacher {
    const fullName =
        [t.firstName, t.lastName].filter(Boolean).join(" ").trim() || t.email.split("@")[0]!;
    return {
        id: t.id,
        name: fullName,
        email: t.email,
        classroomIds: [],
    };
}

function adaptMessage(m: WireMessage): AgentMessage {
    const role: AgentMessageRole = m.role;
    return {
        id: m.id,
        role,
        createdAt: m.createdAt,
        text: m.text ?? undefined,
        inputMethod: (m.inputMethod as InputMethod | undefined) ?? undefined,
        // The Card/AgentCard type is a union; the wire's JSONB matches it
        // by shape but we do a structural cast rather than runtime parse.
        card: (m.card as AgentMessage["card"]) ?? undefined,
    };
}

function adaptThread(t: WireThread, messages: WireMessage[]): AgentThread {
    return {
        id: t.id,
        role: t.roleAtCreation,
        title: t.title,
        createdAt: t.createdAt,
        messages: messages.map(adaptMessage),
    };
}

// ─── Query keys ──────────────────────────────────────────────────────

export const montessoriKeys = {
    all: ["montessori"] as const,
    classrooms: () => [...montessoriKeys.all, "classrooms"] as const,
    classroom: (id: string) => [...montessoriKeys.classrooms(), id] as const,
    teachers: () => [...montessoriKeys.all, "teachers"] as const,
    students: (classroomId?: string | null) =>
        [...montessoriKeys.all, "students", classroomId ?? "all"] as const,
    student: (id: string) => [...montessoriKeys.all, "student", id] as const,
    studentObservations: (id: string) =>
        [...montessoriKeys.all, "student", id, "observations"] as const,
    studentAttendance: (id: string) =>
        [...montessoriKeys.all, "student", id, "attendance"] as const,
    curriculum: () => [...montessoriKeys.all, "curriculum"] as const,
    grid: (classroomId: string) => [...montessoriKeys.all, "grid", classroomId] as const,
    attendance: (classroomId: string, date: string) =>
        [...montessoriKeys.all, "attendance", classroomId, date] as const,
    reports: (classroomId?: string | null) =>
        [...montessoriKeys.all, "reports", classroomId ?? "all"] as const,
    report: (id: string) => [...montessoriKeys.all, "report", id] as const,
    threads: () => [...montessoriKeys.all, "threads"] as const,
    thread: (id: string) => [...montessoriKeys.all, "thread", id] as const,
} as const;

// ─── Hooks ───────────────────────────────────────────────────────────

export function useClassrooms(): UseQueryResult<Classroom[]> {
    return useQuery({
        queryKey: montessoriKeys.classrooms(),
        queryFn: async () => {
            const res = await apiRequest<{ classrooms: WireClassroom[] }>("/montessori/classrooms");
            return res.classrooms.map(adaptClassroom);
        },
    });
}

export function useClassroom(id: string | null | undefined): UseQueryResult<Classroom> {
    return useQuery({
        queryKey: id ? montessoriKeys.classroom(id) : ["disabled"],
        queryFn: async () => {
            const res = await apiRequest<{ classroom: WireClassroom }>(
                `/montessori/classrooms/${id}`
            );
            return adaptClassroom(res.classroom);
        },
        enabled: !!id,
    });
}

export function useTeachers(): UseQueryResult<Teacher[]> {
    return useQuery({
        queryKey: montessoriKeys.teachers(),
        queryFn: async () => {
            const res = await apiRequest<{ teachers: WireTeacher[] }>("/montessori/teachers");
            return res.teachers.map(adaptTeacher);
        },
    });
}

export function useStudents(classroomId?: string | null): UseQueryResult<Student[]> {
    return useQuery({
        queryKey: montessoriKeys.students(classroomId),
        queryFn: async () => {
            const path = classroomId
                ? `/montessori/students?classroomId=${encodeURIComponent(classroomId)}`
                : "/montessori/students";
            const res = await apiRequest<{ students: WireStudent[] }>(path);
            return res.students.map(adaptStudent);
        },
    });
}

export function useStudent(id: string | null | undefined): UseQueryResult<Student> {
    return useQuery({
        queryKey: id ? montessoriKeys.student(id) : ["disabled"],
        queryFn: async () => {
            const res = await apiRequest<{ student: WireStudent }>(`/montessori/students/${id}`);
            return adaptStudent(res.student);
        },
        enabled: !!id,
    });
}

export function useStudentObservations(
    id: string | null | undefined
): UseQueryResult<Observation[]> {
    return useQuery({
        queryKey: id ? montessoriKeys.studentObservations(id) : ["disabled"],
        queryFn: async () => {
            const res = await apiRequest<{ observations: WireObservation[] }>(
                `/montessori/students/${id}/observations`
            );
            return res.observations.map(adaptObservation);
        },
        enabled: !!id,
    });
}

export function useStudentAttendance(
    id: string | null | undefined
): UseQueryResult<AttendanceEntry[]> {
    return useQuery({
        queryKey: id ? montessoriKeys.studentAttendance(id) : ["disabled"],
        queryFn: async () => {
            const res = await apiRequest<{ attendance: WireAttendance[] }>(
                `/montessori/students/${id}/attendance`
            );
            return res.attendance.map(adaptAttendance);
        },
        enabled: !!id,
    });
}

export interface CurriculumSnapshot {
    domains: Domain[];
    topics: Topic[];
}

export function useCurriculum(): UseQueryResult<CurriculumSnapshot> {
    return useQuery({
        queryKey: montessoriKeys.curriculum(),
        queryFn: async () => {
            const res = await apiRequest<{ domains: WireDomain[]; topics: WireTopic[] }>(
                "/montessori/curriculum"
            );
            const topicIdsByDomainId = new Map<string, string[]>();
            for (const t of res.topics) {
                const list = topicIdsByDomainId.get(t.domainId) ?? [];
                list.push(t.id);
                topicIdsByDomainId.set(t.domainId, list);
            }
            return {
                domains: res.domains.map((d) => adaptDomain(d, topicIdsByDomainId)),
                topics: res.topics.map(adaptTopic),
            };
        },
    });
}

export interface GridSnapshot {
    classroom: Classroom;
    students: Student[];
    domains: Domain[];
    topics: Topic[];
    observations: Observation[];
}

export function useGrid(classroomId: string | null | undefined): UseQueryResult<GridSnapshot> {
    return useQuery({
        queryKey: classroomId ? montessoriKeys.grid(classroomId) : ["disabled"],
        queryFn: async () => {
            const res = await apiRequest<{
                classroom: WireClassroom;
                students: Array<Omit<WireStudent, "classroomId">>;
                domains: WireDomain[];
                topics: WireTopic[];
                observations: WireObservation[];
            }>(`/montessori/grid?classroomId=${encodeURIComponent(classroomId!)}`);

            const topicIdsByDomainId = new Map<string, string[]>();
            for (const t of res.topics) {
                const list = topicIdsByDomainId.get(t.domainId) ?? [];
                list.push(t.id);
                topicIdsByDomainId.set(t.domainId, list);
            }

            return {
                classroom: adaptClassroom(res.classroom),
                students: res.students.map((s) =>
                    adaptStudent({ ...s, classroomId: res.classroom.id })
                ),
                domains: res.domains.map((d) => adaptDomain(d, topicIdsByDomainId)),
                topics: res.topics.map(adaptTopic),
                observations: res.observations.map(adaptObservation),
            };
        },
        enabled: !!classroomId,
    });
}

export interface AttendanceSnapshot {
    classroomId: string;
    date: string;
    students: Array<{ id: string; name: string }>;
    entries: AttendanceEntry[];
}

export function useAttendance(
    classroomId: string | null | undefined,
    date: string | null | undefined
): UseQueryResult<AttendanceSnapshot> {
    return useQuery({
        queryKey:
            classroomId && date ? montessoriKeys.attendance(classroomId, date) : ["disabled"],
        queryFn: async () => {
            const res = await apiRequest<{
                classroomId: string;
                date: string;
                students: Array<{ id: string; name: string }>;
                entries: WireAttendance[];
            }>(
                `/montessori/attendance?classroomId=${encodeURIComponent(
                    classroomId!
                )}&date=${encodeURIComponent(date!)}`
            );
            return {
                classroomId: res.classroomId,
                date: res.date,
                students: res.students,
                entries: res.entries.map(adaptAttendance),
            };
        },
        enabled: !!classroomId && !!date,
    });
}

interface WireReport {
    id: string;
    studentId: string;
    classroomId: string;
    templateId: string | null;
    type: Report["type"];
    status: Report["status"];
    summary: string | null;
    createdAt: string;
    approvedAt: string | null;
    sentAt: string | null;
    sections?: Report["sections"];
}

function adaptReportSummary(r: WireReport): Report {
    return {
        id: r.id,
        studentId: r.studentId,
        classroomId: r.classroomId,
        type: r.type,
        status: r.status,
        summary: r.summary ?? "",
        sections: r.sections ?? [],
        createdAt: r.createdAt,
        approvedAt: r.approvedAt ?? undefined,
        sentAt: r.sentAt ?? undefined,
    };
}

export function useReports(classroomId?: string | null): UseQueryResult<Report[]> {
    return useQuery({
        queryKey: montessoriKeys.reports(classroomId),
        queryFn: async () => {
            const path = classroomId
                ? `/montessori/reports?classroomId=${encodeURIComponent(classroomId)}`
                : "/montessori/reports";
            const res = await apiRequest<{ reports: WireReport[] }>(path);
            return res.reports.map(adaptReportSummary);
        },
    });
}

export function useReport(id: string | null | undefined): UseQueryResult<Report> {
    return useQuery({
        queryKey: id ? montessoriKeys.report(id) : ["disabled"],
        queryFn: async () => {
            const res = await apiRequest<{ report: WireReport }>(`/montessori/reports/${id}`);
            return adaptReportSummary(res.report);
        },
        enabled: !!id,
    });
}

export function useThreads(): UseQueryResult<WireThread[]> {
    return useQuery({
        queryKey: montessoriKeys.threads(),
        queryFn: async () => {
            const res = await apiRequest<{ threads: WireThread[] }>("/montessori/agent/threads");
            return res.threads;
        },
    });
}

export function useThread(id: string | null | undefined): UseQueryResult<AgentThread> {
    return useQuery({
        queryKey: id ? montessoriKeys.thread(id) : ["disabled"],
        queryFn: async () => {
            const res = await apiRequest<{ thread: WireThread; messages: WireMessage[] }>(
                `/montessori/agent/threads/${id}`
            );
            return adaptThread(res.thread, res.messages);
        },
        enabled: !!id,
    });
}
