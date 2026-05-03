"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/lib/db/schema";

export default function TodayPage() {
  const today = new Date().toISOString().slice(0, 10);

  const attendanceCount =
    useLiveQuery(
      async () => {
        try {
          return await getDb().attendanceProj.where("date").equals(today).count();
        } catch (err) {
          // Stale v1 schema where `date` isn't indexed — fall back to scan.
          // AppBootstrap clears + reloads on the next mount; this just keeps
          // the page from crashing while recovery happens.
          if ((err as { name?: string })?.name === "SchemaError") {
            const all = await getDb().attendanceProj.toArray();
            return all.filter((r) => r.date === today).length;
          }
          throw err;
        }
      },
      [today],
      0
    ) ?? 0;

  const recentCommands =
    useLiveQuery(
      async () => {
        const all = await getDb().commands.orderBy("createdAt").reverse().limit(5).toArray();
        return all;
      },
      [],
      []
    ) ?? [];

  const pendingSync =
    useLiveQuery(
      async () => {
        const all = await getDb().commands.where("status").equals("approved").toArray();
        return all.filter((c) => !c.syncedAt).length;
      },
      [],
      0
    ) ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-3xl tracking-tight">Today</h1>
        <p className="text-sm text-ink/60">
          A snapshot of what&apos;s happening in your classroom right now.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Attendance entries today</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{attendanceCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Recent commands captured</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{recentCommands.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Pending sync</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{pendingSync}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recently approved</CardTitle>
          <CardDescription>Last few commands you&apos;ve captured.</CardDescription>
        </CardHeader>
        <CardContent>
          {recentCommands.length === 0 ? (
            <p className="text-sm text-ink/50">
              Nothing yet. Tap <strong>Capture</strong> in the bottom right to begin.
            </p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {recentCommands.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between rounded-md border border-ink/5 px-3 py-2"
                >
                  <span className="font-medium capitalize">{c.commandType}</span>
                  <span className="text-ink/50 tabular-nums">
                    {new Date(c.createdAt).toLocaleTimeString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
