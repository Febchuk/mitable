"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { decryptRoster } from "@/lib/db/encrypted-fields";
import { getDb } from "@/lib/db/schema";

export default function AttendancePage() {
  const [date] = useState(() => new Date().toISOString().slice(0, 10));

  const records =
    useLiveQuery(
      async () => {
        let proj;
        try {
          proj = await getDb().attendanceProj.where("date").equals(date).toArray();
        } catch (err) {
          if ((err as { name?: string })?.name === "SchemaError") {
            // v1 DB without `date` index — scan and filter. AppBootstrap
            // reloads with a fresh schema; this avoids a render crash.
            const all = await getDb().attendanceProj.toArray();
            proj = all.filter((r) => r.date === date);
          } else {
            throw err;
          }
        }
        const studentIds = proj.map((r) => r.studentId);
        if (studentIds.length === 0) return [];
        const enc = await getDb().roster.bulkGet(studentIds);
        const byId = new Map<string, string>();
        for (const e of enc) {
          if (!e) continue;
          const r = await decryptRoster(e);
          byId.set(r.id, r.preferredName ?? `${r.firstName} ${r.lastName}`);
        }
        return proj.map((r) => ({
          studentId: r.studentId,
          name: byId.get(r.studentId) ?? r.studentId,
          status: r.status,
          comment: r.comment,
        }));
      },
      [date],
      []
    ) ?? [];

  const present = records.filter((r) => r.status === "present").length;
  const absent = records.filter((r) => r.status === "absent").length;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-3xl tracking-tight">Attendance</h1>
        <p className="text-sm text-ink/60">
          Today&apos;s check-in. Use the floating chat to mark students present or absent.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Present</CardDescription>
            <CardTitle className="text-3xl tabular-nums text-sage">{present}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Absent</CardDescription>
            <CardTitle className="text-3xl tabular-nums text-terracotta">{absent}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{date}</CardTitle>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <p className="text-sm text-ink/50">No attendance recorded yet.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {records.map((r) => (
                <li
                  key={r.studentId}
                  className="flex items-center justify-between rounded-md border border-ink/5 px-3 py-2"
                >
                  <span>{r.name}</span>
                  <Badge variant={r.status === "present" ? "sage" : "terracotta"}>{r.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
