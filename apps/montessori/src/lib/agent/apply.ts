import type { AttendanceEntry, ConfirmationChange, MasteryLevel } from "@/types";

type StoreAPI = {
    setObservation: (args: {
        studentId: string;
        topicId: string;
        level: MasteryLevel;
        note?: string;
        inputMethod?: "grid" | "text" | "voice" | "photo" | "agent";
        authorType?: "agent" | "teacher";
    }) => void;
    setAttendance: (entries: AttendanceEntry[]) => void;
    addDomain: (domain: {
        name: string;
        level: "primary" | "elementary" | "both";
        colorHue: number;
        active: boolean;
    }) => string;
    addTopic: (topic: {
        name: string;
        domainId: string;
        level: "primary" | "elementary" | "both";
        active: boolean;
    }) => string;
    removeTopic: (topicId: string) => void;
    removeDomain: (domainId: string) => void;
};

export function applyConfirmation(changes: ConfirmationChange[], store: StoreAPI): void {
    for (const change of changes) {
        switch (change.kind) {
            case "observation": {
                const p = change.payload as {
                    studentId: string;
                    topicId: string;
                    level: MasteryLevel;
                    note?: string;
                };
                store.setObservation({
                    studentId: p.studentId,
                    topicId: p.topicId,
                    level: p.level,
                    note: p.note,
                    inputMethod: "agent",
                    authorType: "agent",
                });
                break;
            }
            case "attendance": {
                const p = change.payload as {
                    date: string;
                    absentIds: string[];
                    presentIds: string[];
                };
                const entries: AttendanceEntry[] = [
                    ...p.absentIds.map((id) => ({
                        id: `att_${id}_${p.date}`,
                        studentId: id,
                        date: p.date,
                        status: "absent" as const,
                    })),
                    ...p.presentIds.map((id) => ({
                        id: `att_${id}_${p.date}`,
                        studentId: id,
                        date: p.date,
                        status: "present" as const,
                    })),
                ];
                store.setAttendance(entries);
                break;
            }
            case "curriculum": {
                const p = change.payload as
                    | { op: "add-domain"; domainName: string; level: "primary" | "elementary"; topics: string[] }
                    | { op: "remove-topic"; topicId: string }
                    | { op: "remove-domain"; domainId: string };
                if (p.op === "add-domain") {
                    const domainId = store.addDomain({
                        name: p.domainName,
                        level: p.level,
                        colorHue: 200,
                        active: true,
                    });
                    for (const t of p.topics) {
                        store.addTopic({ name: t, domainId, level: p.level, active: true });
                    }
                } else if (p.op === "remove-topic") {
                    store.removeTopic(p.topicId);
                } else if (p.op === "remove-domain") {
                    store.removeDomain(p.domainId);
                }
                break;
            }
            case "assignment":
            case "classroom-edit":
                // no-op in this prototype
                break;
        }
    }
}
