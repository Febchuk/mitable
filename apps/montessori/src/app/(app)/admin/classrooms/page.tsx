"use client";

import * as React from "react";
import { Loader2, Plus, Pencil } from "lucide-react";

import { useStore } from "@/lib/store";
import { useClassrooms, useStudents, useTeachers } from "@/lib/query/montessoriQueries";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type { Classroom, CurriculumLevel } from "@/types";

export default function ClassroomsPage() {
    const classroomsQuery = useClassrooms();
    const teachersQuery = useTeachers();
    const studentsQuery = useStudents();
    // Mutations stay on the in-memory store this commit; they migrate to
    // PATCH/POST endpoints in 1.3.
    const { updateClassroom, addClassroom, assignTeacherToClassroom } = useStore();

    const classrooms = classroomsQuery.data ?? [];
    const teachers = teachersQuery.data ?? [];
    const students = studentsQuery.data ?? [];

    const studentCountByClassroom = React.useMemo(() => {
        const counts = new Map<string, number>();
        for (const s of students) counts.set(s.classroomId, (counts.get(s.classroomId) ?? 0) + 1);
        return counts;
    }, [students]);

    const [open, setOpen] = React.useState(false);
    const [editing, setEditing] = React.useState<Classroom | null>(null);
    const [form, setForm] = React.useState<{
        name: string;
        level: CurriculumLevel;
        ageRange: string;
        teacherId: string;
    }>({ name: "", level: "primary", ageRange: "", teacherId: "" });

    const openCreate = () => {
        setEditing(null);
        setForm({ name: "", level: "primary", ageRange: "3–6", teacherId: teachers[0]?.id ?? "" });
        setOpen(true);
    };
    const openEdit = (c: Classroom) => {
        setEditing(c);
        setForm({ name: c.name, level: c.level, ageRange: c.ageRange, teacherId: c.teacherId });
        setOpen(true);
    };

    const save = () => {
        if (editing) {
            updateClassroom(editing.id, {
                name: form.name,
                level: form.level,
                ageRange: form.ageRange,
            });
            if (form.teacherId !== editing.teacherId) {
                assignTeacherToClassroom(form.teacherId, editing.id);
            }
        } else {
            addClassroom({
                name: form.name,
                level: form.level,
                ageRange: form.ageRange,
                teacherId: form.teacherId,
            });
        }
        setOpen(false);
    };

    if (classroomsQuery.isLoading || teachersQuery.isLoading) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="h-5 w-5 text-ink-tertiary animate-spin" />
            </div>
        );
    }

    return (
        <div className="p-6 space-y-4 max-w-5xl">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-ink-primary">Classrooms</h1>
                    <p className="text-sm text-ink-secondary">
                        Manage your classrooms and the teachers assigned to them.
                    </p>
                </div>
                <Button variant="accent" onClick={openCreate}>
                    <Plus className="h-3.5 w-3.5" /> Add classroom
                </Button>
            </header>

            <div className="grid md:grid-cols-2 gap-3">
                {classrooms.map((c) => {
                    const teacher = teachers.find((t) => t.id === c.teacherId);
                    const studentCount = studentCountByClassroom.get(c.id) ?? 0;
                    return (
                        <Card key={c.id}>
                            <CardContent className="p-4 space-y-2">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <div className="text-xs text-ink-tertiary uppercase tracking-wider font-semibold">
                                            Classroom
                                        </div>
                                        <div className="text-base font-semibold text-ink-primary">
                                            {c.name}
                                        </div>
                                    </div>
                                    <Badge variant="accent">
                                        {c.level === "primary" ? "Primary" : c.level === "elementary" ? "Elementary" : "Both"}
                                    </Badge>
                                </div>
                                <div className="text-sm text-ink-secondary">
                                    Teacher: {teacher?.name ?? "Unassigned"}
                                </div>
                                <div className="text-sm text-ink-secondary">
                                    {studentCount} students
                                    {c.ageRange ? ` · ages ${c.ageRange}` : ""}
                                </div>
                                <div className="pt-2">
                                    <Button size="sm" variant="secondary" onClick={() => openEdit(c)}>
                                        <Pencil className="h-3.5 w-3.5" /> Edit
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editing ? "Edit classroom" : "Add classroom"}</DialogTitle>
                        <DialogDescription>
                            Changes apply immediately. No data is persisted — this is a prototype.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label>Name</Label>
                            <Input
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                placeholder="Primary Classroom"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Curriculum level</Label>
                            <Select
                                value={form.level}
                                onValueChange={(v) =>
                                    setForm({ ...form, level: v as CurriculumLevel })
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="primary">Primary</SelectItem>
                                    <SelectItem value="elementary">Elementary</SelectItem>
                                    <SelectItem value="both">Both</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Ages</Label>
                            <Input
                                value={form.ageRange}
                                onChange={(e) => setForm({ ...form, ageRange: e.target.value })}
                                placeholder="3–6"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Teacher</Label>
                            <Select
                                value={form.teacherId}
                                onValueChange={(v) => setForm({ ...form, teacherId: v })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {teachers.map((t) => (
                                        <SelectItem key={t.id} value={t.id}>
                                            {t.name}
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
                            {editing ? "Save changes" : "Add classroom"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
