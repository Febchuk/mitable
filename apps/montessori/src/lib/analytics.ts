import type { MasteryLevel, Observation, Topic } from "@/types";

export type MasteryTone = "empty" | "introduced" | "practising" | "mastered";

export function overallMasteryTone(
    studentId: string,
    topicsForLevel: Topic[],
    observations: Observation[]
): MasteryTone {
    if (topicsForLevel.length === 0) return "empty";
    const latestByTopic = new Map<string, MasteryLevel>();
    for (const obs of observations) {
        if (obs.studentId !== studentId) continue;
        if (!latestByTopic.has(obs.topicId)) latestByTopic.set(obs.topicId, obs.level);
    }
    const counts: Record<MasteryLevel, number> = {
        "not-introduced": 0,
        introduced: 0,
        practising: 0,
        mastered: 0,
    };
    for (const topic of topicsForLevel) {
        const lv = latestByTopic.get(topic.id) ?? "not-introduced";
        counts[lv]++;
    }
    const total = topicsForLevel.length;
    if (counts.mastered / total > 0.35) return "mastered";
    if (counts.practising / total > 0.3) return "practising";
    if (counts.introduced / total > 0.2) return "introduced";
    return "empty";
}

export const MASTERY_TONE_COLORS: Record<MasteryTone, string> = {
    mastered: "var(--status-success)",
    practising: "var(--mi-accent)",
    introduced: "var(--status-warning)",
    empty: "var(--text-faint)",
};

export const MASTERY_TONE_LABEL: Record<MasteryTone, string> = {
    mastered: "Mostly mastered",
    practising: "Mostly practising",
    introduced: "Mostly introduced",
    empty: "Sparse data",
};

export function topicCoverageForClassroom(
    classroomTopicIds: Set<string>,
    observations: Observation[]
): number {
    const hasObs = new Set<string>();
    for (const obs of observations) {
        if (classroomTopicIds.has(obs.topicId)) hasObs.add(obs.topicId);
    }
    if (classroomTopicIds.size === 0) return 0;
    return hasObs.size / classroomTopicIds.size;
}

export function lastObservationDate(studentId: string, observations: Observation[]): string | null {
    const match = observations.find((o) => o.studentId === studentId);
    return match?.createdAt ?? null;
}

export function formatRelativeDate(iso: string | null): string {
    if (!iso) return "No observations yet";
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const day = 24 * 60 * 60 * 1000;
    const days = Math.floor(diffMs / day);
    if (days <= 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return `${Math.floor(days / 30)} months ago`;
}
