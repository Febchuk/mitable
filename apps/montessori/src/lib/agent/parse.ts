import type {
    AgentMessage,
    ConfirmationCard,
    ConfirmationChange,
    Classroom,
    Domain,
    MasteryLevel,
    Report,
    Role,
    Student,
    Topic,
} from "@/types";

export interface AgentContext {
    role: Role;
    students: Student[];
    topics: Topic[];
    domains: Domain[];
    classrooms: Classroom[];
    classroom: Classroom | null; // relevant classroom for this role
    observations: { studentId: string; topicId: string; level: MasteryLevel }[];
}

function makeId(prefix: string): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function nowISO(): string {
    return new Date().toISOString();
}

function findStudents(input: string, students: Student[]): Student[] {
    const lower = input.toLowerCase();
    return students.filter((s) => lower.includes(s.name.toLowerCase()));
}

function findTopics(input: string, topics: Topic[]): Topic[] {
    const lower = input.toLowerCase();
    return topics.filter((t) => lower.includes(t.name.toLowerCase()));
}

function detectLevel(input: string): MasteryLevel | null {
    const lower = input.toLowerCase();
    if (/\bmastered\b|\bhas mastered\b|\bgot it\b/.test(lower)) return "mastered";
    if (/\bpractising\b|\bpracticing\b|\bworking on\b/.test(lower)) return "practising";
    if (/\bintroduced\b|\bshown\b|\bpresented\b/.test(lower)) return "introduced";
    if (/\bnot introduced\b|\bnever introduced\b/.test(lower)) return "not-introduced";
    return null;
}

export function parse(input: string, ctx: AgentContext): AgentMessage {
    const base: Omit<AgentMessage, "card" | "text"> = {
        id: makeId("am"),
        role: "agent",
        createdAt: nowISO(),
    };

    const text = input.trim();
    if (!text) {
        return {
            ...base,
            card: {
                kind: "text-answer",
                text: "I can help you log observations, check student progress, mark attendance, and generate reports. What would you like to do?",
            },
        };
    }

    const lower = text.toLowerCase();

    // ── Curriculum (admin) ────────────────────────────────────────
    if (ctx.role === "admin") {
        if (/\badd\b.*\bdomain\b/.test(lower)) {
            const nameMatch = text.match(/called ([A-Z][^.]+?)(?:\s+to |\.|$)/i);
            const domainName = nameMatch?.[1]?.trim() ?? "New Domain";
            const level: "primary" | "elementary" = lower.includes("elementary")
                ? "elementary"
                : "primary";
            const mockTopics =
                domainName.toLowerCase().includes("social")
                    ? ["Turn-taking", "Conflict Resolution", "Emotional Regulation"]
                    : ["Introduction", "Practice"];
            const card: ConfirmationCard = {
                kind: "confirmation",
                heading: "Here's what I'm going to update",
                status: "pending",
                changes: [
                    {
                        kind: "curriculum",
                        summary: `Add domain: ${domainName} (${level === "primary" ? "Primary" : "Elementary"})`,
                        payload: {
                            op: "add-domain",
                            domainName,
                            level,
                            topics: mockTopics,
                        },
                    },
                ],
            };
            return { ...base, card };
        }
        if (/\bremove\b|\bdelete\b/.test(lower)) {
            const topic = findTopics(text, ctx.topics)[0];
            if (topic) {
                const card: ConfirmationCard = {
                    kind: "confirmation",
                    heading: "Here's what I'm going to update",
                    status: "pending",
                    changes: [
                        {
                            kind: "curriculum",
                            summary: `Remove topic: ${topic.name}`,
                            payload: { op: "remove-topic", topicId: topic.id },
                        },
                    ],
                };
                return { ...base, card };
            }
        }
        if (/\bassign\b/.test(lower)) {
            const classroomMatch = ctx.classrooms.find((c) =>
                lower.includes(c.name.toLowerCase().split(" ")[0]!)
            );
            if (classroomMatch) {
                const card: ConfirmationCard = {
                    kind: "confirmation",
                    heading: "Here's what I'm going to update",
                    status: "pending",
                    changes: [
                        {
                            kind: "assignment",
                            summary: `Update teacher assignment for ${classroomMatch.name}`,
                            payload: { classroomId: classroomMatch.id },
                        },
                    ],
                };
                return { ...base, card };
            }
        }
    }

    // ── Progress query ────────────────────────────────────────────
    if (/\bshow\b.*\bprogress\b|show me (\w+)|show (\w+)'s/.test(lower)) {
        const student = findStudents(text, ctx.students)[0];
        if (student) {
            return {
                ...base,
                text: `Here's ${student.name}'s grid. You can tap a cell to edit it.`,
                card: { kind: "grid-preview", studentId: student.id },
            };
        }
    }

    // ── "Who hasn't been introduced" ──────────────────────────────
    if (/\bwho\b.*\bhasn.?t\b|\bwho hasn/.test(lower)) {
        const topic = findTopics(text, ctx.topics)[0];
        if (topic) {
            const studentsInRoom = ctx.classroom
                ? ctx.students.filter((s) => s.classroomId === ctx.classroom!.id)
                : ctx.students;
            const missing = studentsInRoom.filter(
                (s) => !ctx.observations.some((o) => o.studentId === s.id && o.topicId === topic.id)
            );
            if (missing.length === 0) {
                return {
                    ...base,
                    card: {
                        kind: "text-answer",
                        text: `Everyone has at least one observation for ${topic.name}.`,
                    },
                };
            }
            return {
                ...base,
                card: {
                    kind: "text-answer",
                    text: `The following students haven't been introduced to ${topic.name}: ${missing
                        .map((s) => s.name)
                        .join(", ")}.`,
                },
            };
        }
    }

    // ── Report drafting ───────────────────────────────────────────
    if (/\bdraft\b.*\breport\b|\bend of term\b/.test(lower)) {
        const student = findStudents(text, ctx.students)[0];
        const classroom = student
            ? ctx.classrooms.find((c) => c.id === student.classroomId) ?? null
            : ctx.classroom;
        if (student && classroom) {
            const report = draftReportFor(student, classroom, ctx);
            return {
                ...base,
                text: `Here's a draft end-of-term report for ${student.name}. Edit any section inline, then approve.`,
                card: { kind: "report-preview", draft: report, status: "pending" },
            };
        }
        return {
            ...base,
            card: {
                kind: "text-answer",
                text: "Which student's report should I draft? For example: \"Draft an end of term report for Amara\".",
            },
        };
    }

    // ── Attendance ────────────────────────────────────────────────
    if (/\babsent\b/.test(lower)) {
        const absentStudents = findStudents(text, ctx.students);
        if (absentStudents.length === 0) {
            return {
                ...base,
                card: {
                    kind: "text-answer",
                    text: "Who should I mark absent? Try \"Kofi and Temi are absent\".",
                },
            };
        }
        const classroomStudents = ctx.classroom
            ? ctx.students.filter((s) => s.classroomId === ctx.classroom!.id)
            : ctx.students;
        const absentIds = absentStudents.map((s) => s.id);
        const presentIds = classroomStudents
            .filter((s) => !absentIds.includes(s.id))
            .map((s) => s.id);
        const today = new Date().toISOString().slice(0, 10);
        const card: ConfirmationCard = {
            kind: "confirmation",
            heading: "Here's today's register",
            status: "pending",
            changes: [
                {
                    kind: "attendance",
                    summary: `Mark ${absentStudents.map((s) => s.name).join(", ")} absent — ${
                        presentIds.length
                    } of ${classroomStudents.length} present`,
                    payload: { date: today, absentIds, presentIds },
                },
            ],
        };
        return { ...base, card };
    }

    if (/\bmark everyone present\b|\ball present\b/.test(lower)) {
        const exceptStudents = /\bexcept\b/.test(lower) ? findStudents(text, ctx.students) : [];
        const classroomStudents = ctx.classroom
            ? ctx.students.filter((s) => s.classroomId === ctx.classroom!.id)
            : ctx.students;
        const absentIds = exceptStudents.map((s) => s.id);
        const presentIds = classroomStudents
            .filter((s) => !absentIds.includes(s.id))
            .map((s) => s.id);
        const today = new Date().toISOString().slice(0, 10);
        const card: ConfirmationCard = {
            kind: "confirmation",
            heading: "Here's today's register",
            status: "pending",
            changes: [
                {
                    kind: "attendance",
                    summary: exceptStudents.length
                        ? `Mark everyone present except ${exceptStudents.map((s) => s.name).join(", ")}`
                        : "Mark everyone present",
                    payload: { date: today, absentIds, presentIds },
                },
            ],
        };
        return { ...base, card };
    }

    // ── Observation logging ───────────────────────────────────────
    const matchedStudents = findStudents(text, ctx.students);
    const matchedTopics = findTopics(text, ctx.topics);
    if (matchedStudents.length > 0 && matchedTopics.length > 0) {
        const level = detectLevel(text) ?? "practising";
        const changes: ConfirmationChange[] = [];
        for (const s of matchedStudents) {
            for (const t of matchedTopics) {
                changes.push({
                    kind: "observation",
                    summary: `${s.name} — ${t.name} → ${levelLabel(level)}${
                        detectLevel(text) ? "" : " (assumed)"
                    }`,
                    payload: {
                        studentId: s.id,
                        topicId: t.id,
                        level,
                        note: text,
                    },
                });
            }
        }
        const card: ConfirmationCard = {
            kind: "confirmation",
            heading: "Here's what I'm going to update",
            status: "pending",
            changes,
        };
        return { ...base, card };
    }

    // ── Fallback ──────────────────────────────────────────────────
    return {
        ...base,
        card: {
            kind: "text-answer",
            text: "I can help you log observations, check student progress, mark attendance, and generate reports. What would you like to do?",
        },
    };
}

function levelLabel(lv: MasteryLevel): string {
    return {
        "not-introduced": "Not introduced",
        introduced: "Introduced",
        practising: "Practising",
        mastered: "Mastered",
    }[lv];
}

function draftReportFor(
    student: Student,
    classroom: Classroom,
    ctx: AgentContext
): Report {
    const level = classroom.level;
    const relevantDomains = ctx.domains.filter(
        (d) => d.active && (d.level === level || d.level === "both")
    );
    const sections = relevantDomains.map((d) => {
        const topicsInDomain = ctx.topics.filter((t) => t.domainId === d.id && t.active);
        const counts = { mastered: 0, practising: 0, introduced: 0, empty: 0 };
        for (const topic of topicsInDomain) {
            const obs = ctx.observations.find(
                (o) => o.studentId === student.id && o.topicId === topic.id
            );
            if (!obs) counts.empty++;
            else if (obs.level === "mastered") counts.mastered++;
            else if (obs.level === "practising") counts.practising++;
            else if (obs.level === "introduced") counts.introduced++;
            else counts.empty++;
        }
        const narrative = renderDomainNarrative(student.name, d.name, counts);
        return { domainId: d.id, narrative };
    });

    return {
        id: `rep_${student.id}_${Date.now()}`,
        studentId: student.id,
        classroomId: classroom.id,
        type: "end-of-term",
        status: "draft",
        createdAt: nowISO(),
        summary: `${student.name} has had a meaningful term — this draft weaves together observations across all domains for the family to read.`,
        sections,
    };
}

function renderDomainNarrative(
    name: string,
    domain: string,
    counts: { mastered: number; practising: number; introduced: number; empty: number }
): string {
    const total = counts.mastered + counts.practising + counts.introduced + counts.empty;
    if (total === 0) return `${name} is preparing to begin work in ${domain}.`;
    const mostly =
        counts.mastered >= counts.practising && counts.mastered >= counts.introduced
            ? "confident mastery"
            : counts.practising >= counts.introduced
              ? "steady practice"
              : "fresh introductions";
    return `In ${domain}, ${name}'s work this term has shown ${mostly}. ${counts.mastered} topics reached mastery, ${counts.practising} are being actively practised, and ${counts.introduced} have been recently introduced.`;
}
