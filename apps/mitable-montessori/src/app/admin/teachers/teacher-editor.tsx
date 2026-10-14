"use client";
import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { localDateString } from "@/lib/queries/attendance-day-model";

type Assignment = { id: string; classroom_id: string; classroom_role: string };
type Details = { classrooms: Array<{ id: string; name: string }>; assignments: Assignment[] };
export function TeacherEditor({
  teacher,
  onClose,
  onChanged,
}: {
  teacher: { id: string; firstName?: string; lastName?: string };
  onClose: () => void;
  onChanged: () => void;
}) {
  const [firstName, setFirstName] = React.useState(teacher.firstName ?? "");
  const [lastName, setLastName] = React.useState(teacher.lastName ?? "");
  const [details, setDetails] = React.useState<Details | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const load = React.useCallback(async () => {
    const response = await fetch(`/api/admin/teachers/${teacher.id}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Couldn't load classes");
    setDetails(data);
  }, [teacher.id]);
  React.useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [load]);
  async function write(url: string, method: string, body: unknown) {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Couldn't save changes");
      await load();
      onChanged();
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save changes");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit teacher</DialogTitle>
        </DialogHeader>
        <label>
          First name
          <Input
            value={firstName}
            maxLength={100}
            onChange={(e) => {
              setFirstName(e.target.value);
              setSaved(false);
            }}
          />
        </label>
        <label>
          Last name
          <Input
            value={lastName}
            maxLength={100}
            onChange={(e) => {
              setLastName(e.target.value);
              setSaved(false);
            }}
          />
        </label>
        <Button
          disabled={busy || !firstName.trim()}
          onClick={() =>
            void write(`/api/admin/teachers/${teacher.id}`, "PATCH", { firstName, lastName })
          }
        >
          Save name
        </Button>
        <p className="text-sm">Class assignments — changes save immediately.</p>
        {!details && !error && <p>Loading classes…</p>}
        <div className="max-h-64 space-y-3 overflow-y-auto">
          {details?.classrooms.map((room) => {
            const assignment = details.assignments.find((a) => a.classroom_id === room.id);
            return (
              <label key={room.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(assignment)}
                  disabled={busy}
                  onChange={() =>
                    void write(
                      "/api/admin/classroom-teachers",
                      assignment ? "DELETE" : "POST",
                      assignment
                        ? { assignment_id: assignment.id, end_date: localDateString() }
                        : {
                            teacher_user_id: teacher.id,
                            classroom_id: room.id,
                            classroom_role: "support",
                            start_date: localDateString(),
                          }
                    )
                  }
                />
                {room.name}
                {assignment && ` (${assignment.classroom_role})`}
              </label>
            );
          })}
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="text-sm">
            Changes saved.
          </p>
        )}
        <Button disabled={busy} onClick={onClose}>
          Done
        </Button>
      </DialogContent>
    </Dialog>
  );
}
