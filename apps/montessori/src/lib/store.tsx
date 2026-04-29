"use client";

import * as React from "react";

import type {
    AgentMessage,
    AgentThread,
    AttendanceEntry,
    Classroom,
    Domain,
    MasteryLevel,
    Observation,
    Report,
    Role,
    School,
    Student,
    Teacher,
    Topic,
} from "@/types";
import {
    initialAgentThreads,
    initialAttendance,
    initialClassrooms,
    initialDomains,
    initialObservations,
    initialReports,
    initialSchool,
    initialStudents,
    initialTeachers,
    initialTopics,
} from "@/lib/mock-data";
import { useAuth, type MontessoriMe } from "@/lib/auth/AuthContext";

function roleFromMe(me: MontessoriMe | null): Role {
    if (!me) return "teacher-primary";
    if (me.user.role === "admin") return "admin";
    if (me.assignedClassroom?.level === "elementary") return "teacher-elementary";
    return "teacher-primary";
}

function schoolFromMe(me: MontessoriMe | null): School {
    if (me?.organization) {
        return { id: me.organization.id, name: me.organization.name };
    }
    return initialSchool;
}

interface StoreState {
    sessionId: string;
    role: Role;
    school: School;
    teachers: Teacher[];
    classrooms: Classroom[];
    students: Student[];
    domains: Domain[];
    topics: Topic[];
    observations: Observation[];
    attendance: AttendanceEntry[];
    reports: Report[];
    agentThreads: AgentThread[];
}

interface StoreActions {
    // Observations / grid
    setObservation: (args: {
        studentId: string;
        topicId: string;
        level: MasteryLevel;
        note?: string;
        inputMethod?: Observation["inputMethod"];
        authorType?: Observation["authorType"];
    }) => void;

    // Attendance
    setAttendance: (entries: AttendanceEntry[]) => void;

    // Curriculum
    addDomain: (domain: Omit<Domain, "id" | "topicIds" | "order">) => string;
    removeDomain: (domainId: string) => void;
    addTopic: (topic: Omit<Topic, "id">) => string;
    removeTopic: (topicId: string) => void;
    toggleDomainActive: (domainId: string) => void;
    toggleTopicActive: (topicId: string) => void;

    // Teachers / classrooms
    assignTeacherToClassroom: (teacherId: string, classroomId: string) => void;
    updateClassroom: (id: string, patch: Partial<Pick<Classroom, "name" | "level" | "ageRange">>) => void;
    addClassroom: (c: Omit<Classroom, "id" | "studentIds">) => string;
    addTeacher: (t: Omit<Teacher, "id" | "classroomIds">) => string;

    // Reports
    addReport: (r: Report) => void;
    updateReport: (id: string, patch: Partial<Report>) => void;

    // Agent
    addMessageToThread: (threadId: string, msg: AgentMessage) => void;
    updateMessageInThread: (threadId: string, messageId: string, patch: Partial<AgentMessage>) => void;
    newAgentThread: (role: Role, title?: string) => string;
}

type StoreContextValue = StoreState & StoreActions;

const StoreContext = React.createContext<StoreContextValue | null>(null);

function makeId(prefix = "id"): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
    // Seeded once per mount. Everything is in-memory, no persistence.
    const [sessionId] = React.useState(() => `sess_${Date.now()}`);

    // Role + school are derived from the auth context. The Provider is
    // mounted under the auth gate so `me` is non-null in normal use, but
    // we fall back to safe defaults for the null window.
    const { me } = useAuth();
    const role = roleFromMe(me);
    const school = schoolFromMe(me);
    const [teachers, setTeachers] = React.useState<Teacher[]>(initialTeachers);
    const [classrooms, setClassrooms] = React.useState<Classroom[]>(initialClassrooms);
    const [students] = React.useState<Student[]>(initialStudents);
    const [domains, setDomains] = React.useState<Domain[]>(initialDomains);
    const [topics, setTopics] = React.useState<Topic[]>(initialTopics);
    const [observations, setObservations] = React.useState<Observation[]>(initialObservations);
    const [attendance, setAttendanceState] = React.useState<AttendanceEntry[]>(initialAttendance);
    const [reports, setReports] = React.useState<Report[]>(initialReports);
    const [agentThreads, setAgentThreads] = React.useState<AgentThread[]>(initialAgentThreads);

    const setObservation: StoreActions["setObservation"] = React.useCallback(
        ({
            studentId,
            topicId,
            level,
            note,
            inputMethod = "grid",
            authorType = "teacher",
        }) => {
            const now = new Date().toISOString();
            const newObs: Observation = {
                id: makeId("obs"),
                studentId,
                topicId,
                level,
                note: note ?? null,
                summary: note ?? null,
                createdAt: now,
                inputMethod,
                authorType,
                authorId: authorType === "agent" ? "agent" : "teacher",
                sessionId,
            };
            setObservations((prev) => [newObs, ...prev]);
        },
        [sessionId]
    );

    const setAttendance: StoreActions["setAttendance"] = React.useCallback((entries) => {
        setAttendanceState((prev) => {
            const byKey = new Map(prev.map((a) => [`${a.studentId}|${a.date}`, a]));
            for (const e of entries) byKey.set(`${e.studentId}|${e.date}`, e);
            return Array.from(byKey.values());
        });
    }, []);

    const addDomain: StoreActions["addDomain"] = React.useCallback((domain) => {
        const id = makeId("dom");
        setDomains((prev) => [
            ...prev,
            {
                ...domain,
                id,
                order: prev.length,
                topicIds: [],
            },
        ]);
        return id;
    }, []);

    const removeDomain: StoreActions["removeDomain"] = React.useCallback((domainId) => {
        setDomains((prev) => prev.filter((d) => d.id !== domainId));
        setTopics((prev) => prev.filter((t) => t.domainId !== domainId));
    }, []);

    const addTopic: StoreActions["addTopic"] = React.useCallback((topic) => {
        const id = makeId("top");
        setTopics((prev) => [...prev, { ...topic, id }]);
        setDomains((prev) =>
            prev.map((d) => (d.id === topic.domainId ? { ...d, topicIds: [...d.topicIds, id] } : d))
        );
        return id;
    }, []);

    const removeTopic: StoreActions["removeTopic"] = React.useCallback((topicId) => {
        setTopics((prev) => prev.filter((t) => t.id !== topicId));
        setDomains((prev) =>
            prev.map((d) => ({ ...d, topicIds: d.topicIds.filter((id) => id !== topicId) }))
        );
    }, []);

    const toggleDomainActive: StoreActions["toggleDomainActive"] = React.useCallback((domainId) => {
        setDomains((prev) => prev.map((d) => (d.id === domainId ? { ...d, active: !d.active } : d)));
    }, []);

    const toggleTopicActive: StoreActions["toggleTopicActive"] = React.useCallback((topicId) => {
        setTopics((prev) => prev.map((t) => (t.id === topicId ? { ...t, active: !t.active } : t)));
    }, []);

    const assignTeacherToClassroom: StoreActions["assignTeacherToClassroom"] = React.useCallback(
        (teacherId, classroomId) => {
            setClassrooms((prev) =>
                prev.map((c) => (c.id === classroomId ? { ...c, teacherId } : c))
            );
            setTeachers((prev) =>
                prev.map((t) => {
                    if (t.id === teacherId) {
                        return {
                            ...t,
                            classroomIds: Array.from(new Set([...t.classroomIds, classroomId])),
                        };
                    }
                    return { ...t, classroomIds: t.classroomIds.filter((id) => id !== classroomId) };
                })
            );
        },
        []
    );

    const updateClassroom: StoreActions["updateClassroom"] = React.useCallback((id, patch) => {
        setClassrooms((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    }, []);

    const addClassroom: StoreActions["addClassroom"] = React.useCallback((c) => {
        const id = makeId("class");
        setClassrooms((prev) => [...prev, { ...c, id, studentIds: [] }]);
        setTeachers((prev) =>
            prev.map((t) =>
                t.id === c.teacherId
                    ? { ...t, classroomIds: Array.from(new Set([...t.classroomIds, id])) }
                    : t
            )
        );
        return id;
    }, []);

    const addTeacher: StoreActions["addTeacher"] = React.useCallback((t) => {
        const id = makeId("tch");
        setTeachers((prev) => [...prev, { ...t, id, classroomIds: [] }]);
        return id;
    }, []);

    const addReport: StoreActions["addReport"] = React.useCallback((r) => {
        setReports((prev) => [r, ...prev]);
    }, []);

    const updateReport: StoreActions["updateReport"] = React.useCallback((id, patch) => {
        setReports((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    }, []);

    const addMessageToThread: StoreActions["addMessageToThread"] = React.useCallback(
        (threadId, msg) => {
            setAgentThreads((prev) =>
                prev.map((t) => (t.id === threadId ? { ...t, messages: [...t.messages, msg] } : t))
            );
        },
        []
    );

    const updateMessageInThread: StoreActions["updateMessageInThread"] = React.useCallback(
        (threadId, messageId, patch) => {
            setAgentThreads((prev) =>
                prev.map((t) =>
                    t.id === threadId
                        ? {
                              ...t,
                              messages: t.messages.map((m) =>
                                  m.id === messageId ? { ...m, ...patch } : m
                              ),
                          }
                        : t
                )
            );
        },
        []
    );

    const newAgentThread: StoreActions["newAgentThread"] = React.useCallback((r, title) => {
        const id = makeId("thread");
        setAgentThreads((prev) => [
            ...prev,
            {
                id,
                role: r,
                title: title ?? "New conversation",
                createdAt: new Date().toISOString(),
                messages: [],
            },
        ]);
        return id;
    }, []);

    const value = React.useMemo<StoreContextValue>(
        () => ({
            sessionId,
            role,
            school,
            teachers,
            classrooms,
            students,
            domains,
            topics,
            observations,
            attendance,
            reports,
            agentThreads,
            setObservation,
            setAttendance,
            addDomain,
            removeDomain,
            addTopic,
            removeTopic,
            toggleDomainActive,
            toggleTopicActive,
            assignTeacherToClassroom,
            updateClassroom,
            addClassroom,
            addTeacher,
            addReport,
            updateReport,
            addMessageToThread,
            updateMessageInThread,
            newAgentThread,
        }),
        [
            sessionId,
            role,
            school,
            teachers,
            classrooms,
            students,
            domains,
            topics,
            observations,
            attendance,
            reports,
            agentThreads,
            setObservation,
            setAttendance,
            addDomain,
            removeDomain,
            addTopic,
            removeTopic,
            toggleDomainActive,
            toggleTopicActive,
            assignTeacherToClassroom,
            updateClassroom,
            addClassroom,
            addTeacher,
            addReport,
            updateReport,
            addMessageToThread,
            updateMessageInThread,
            newAgentThread,
        ]
    );

    return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
    const ctx = React.useContext(StoreContext);
    if (!ctx) throw new Error("useStore must be used within StoreProvider");
    return ctx;
}

// ─── Selectors ───────────────────────────────────────────────────────

export function useCurrentClassroom(): Classroom | null {
    const { role, classrooms } = useStore();
    if (role === "admin") return null;
    if (role === "teacher-primary") return classrooms.find((c) => c.level === "primary") ?? null;
    return classrooms.find((c) => c.level === "elementary") ?? null;
}

export function useCurrentTeacher(): Teacher | null {
    const { role, teachers, classrooms } = useStore();
    const classroom =
        role === "teacher-primary"
            ? classrooms.find((c) => c.level === "primary")
            : role === "teacher-elementary"
              ? classrooms.find((c) => c.level === "elementary")
              : null;
    if (!classroom) return null;
    return teachers.find((t) => t.id === classroom.teacherId) ?? null;
}

export function useObservationFor(studentId: string, topicId: string): Observation | null {
    const { observations } = useStore();
    // latest observation for this pair (observations are prepended newest-first)
    return observations.find((o) => o.studentId === studentId && o.topicId === topicId) ?? null;
}

export function getLatestLevel(
    observations: Observation[],
    studentId: string,
    topicId: string
): MasteryLevel | null {
    const match = observations.find((o) => o.studentId === studentId && o.topicId === topicId);
    return match?.level ?? null;
}
