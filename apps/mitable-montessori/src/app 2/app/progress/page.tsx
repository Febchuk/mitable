"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { decryptRoster } from "@/lib/db/encrypted-fields";
import { getDb } from "@/lib/db/schema";

const STATUS_VARIANT: Record<string, "default" | "terracotta" | "sage" | "butter" | "outline"> = {
  introduced: "butter",
  practicing: "terracotta",
  mastered: "sage",
  na: "outline",
};

export default function ProgressPage() {
  const data =
    useLiveQuery(
      async () => {
        const rows = await getDb().progressProj.toArray();
        if (rows.length === 0) return [];
        const studentIds = Array.from(new Set(rows.map((r) => r.studentId)));
        const subtopicIds = Array.from(new Set(rows.map((r) => r.subtopicId)));
        const [encRoster, subRows] = await Promise.all([
          getDb().roster.bulkGet(studentIds),
          getDb().curriculumSubtopics.bulkGet(subtopicIds),
        ]);
        const studentName = new Map<string, string>();
        for (const enc of encRoster) {
          if (!enc) continue;
          const r = await decryptRoster(enc);
          studentName.set(r.id, r.preferredName ?? `${r.firstName} ${r.lastName}`);
        }
        const subtopicName = new Map<string, string>();
        for (const s of subRows) {
          if (!s) continue;
          subtopicName.set(s.id, s.name);
        }
        return rows.map((r) => ({
          key: `${r.studentId}:${r.subtopicId}:${r.classroomId}`,
          student: studentName.get(r.studentId) ?? r.studentId,
          subtopic: subtopicName.get(r.subtopicId) ?? r.subtopicId,
          status: r.status,
          comment: r.comment,
          updatedAt: r.updatedAt,
        }));
      },
      [],
      []
    ) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-3xl tracking-tight">Progress</h1>
        <p className="text-sm text-ink/60">
          Per-student curriculum status. Capture updates from the floating chat.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Recent updates</CardTitle>
          <CardDescription>{data.length} subtopic entries on this device.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.length === 0 ? (
            <p className="text-sm text-ink/50">No progress recorded yet.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {data.map((d) => (
                <li
                  key={d.key}
                  className="flex flex-col gap-1 rounded-md border border-ink/5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{d.student}</span>
                    <span className="text-xs text-ink/50">{d.subtopic}</span>
                  </div>
                  <Badge variant={STATUS_VARIANT[d.status] ?? "default"}>{d.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
