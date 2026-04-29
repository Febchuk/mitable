"use client";

import * as React from "react";
import { Loader2, Mail, Plus } from "lucide-react";

import { useStore } from "@/lib/store";
import { useClassrooms, useTeachers } from "@/lib/query/montessoriQueries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

export default function TeachersPage() {
    const teachersQuery = useTeachers();
    const classroomsQuery = useClassrooms();
    const teachers = teachersQuery.data ?? [];
    const classrooms = classroomsQuery.data ?? [];
    // Mutations stay on the in-memory store this commit.
    const { addTeacher, assignTeacherToClassroom } = useStore();

    const classroomsByTeacherId = React.useMemo(() => {
        const m = new Map<string, typeof classrooms>();
        for (const c of classrooms) {
            if (!c.teacherId) continue;
            const list = m.get(c.teacherId) ?? [];
            list.push(c);
            m.set(c.teacherId, list);
        }
        return m;
    }, [classrooms]);

    const [open, setOpen] = React.useState(false);
    const [form, setForm] = React.useState<{ name: string; email: string; classroomId: string }>({
        name: "",
        email: "",
        classroomId: "",
    });

    const save = () => {
        if (!form.name.trim()) return;
        const id = addTeacher({ name: form.name.trim(), email: form.email.trim() });
        if (form.classroomId) assignTeacherToClassroom(id, form.classroomId);
        setOpen(false);
        setForm({ name: "", email: "", classroomId: classrooms[0]?.id ?? "" });
    };

    return (
        <div className="p-6 space-y-4 max-w-4xl">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-ink-primary">Teachers</h1>
                    <p className="text-sm text-ink-secondary">
                        The people running your classrooms.
                    </p>
                </div>
                <Button variant="accent" onClick={() => setOpen(true)}>
                    <Plus className="h-3.5 w-3.5" /> Add teacher
                </Button>
            </header>

            <div className="rounded-xl border border-stroke-subtle bg-canvas-raised overflow-hidden">
                <div className="grid grid-cols-[2fr_2fr_2fr_auto] gap-2 px-4 py-2.5 text-[10px] uppercase tracking-wider text-ink-tertiary font-semibold border-b border-stroke-subtle bg-canvas-base/60">
                    <span>Name</span>
                    <span>Email</span>
                    <span>Classrooms</span>
                    <span />
                </div>
                {teachersQuery.isLoading && (
                    <div className="px-4 py-6 flex items-center justify-center">
                        <Loader2 className="h-4 w-4 text-ink-tertiary animate-spin" />
                    </div>
                )}
                {teachers.map((t) => {
                    const myClassrooms = classroomsByTeacherId.get(t.id) ?? [];
                    return (
                        <div
                            key={t.id}
                            className="grid grid-cols-[2fr_2fr_2fr_auto] gap-2 px-4 py-3 items-center text-sm border-b border-stroke-subtle last:border-b-0"
                        >
                            <span className="text-ink-primary font-medium">{t.name}</span>
                            <span className="text-ink-secondary flex items-center gap-1.5">
                                <Mail className="h-3.5 w-3.5 text-ink-tertiary" />
                                {t.email}
                            </span>
                            <span className="text-ink-secondary">
                                {myClassrooms.map((c) => c.name).join(", ") || "—"}
                            </span>
                            <span />
                        </div>
                    );
                })}
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add teacher</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label>Name</Label>
                            <Input
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                placeholder="Ms. Charity"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Email</Label>
                            <Input
                                value={form.email}
                                type="email"
                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                                placeholder="teacher@tlp.school"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Assign to classroom</Label>
                            <Select
                                value={form.classroomId}
                                onValueChange={(v) => setForm({ ...form, classroomId: v })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a classroom" />
                                </SelectTrigger>
                                <SelectContent>
                                    {classrooms.map((c) => (
                                        <SelectItem key={c.id} value={c.id}>
                                            {c.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button variant="accent" onClick={save}>
                            Add teacher
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
