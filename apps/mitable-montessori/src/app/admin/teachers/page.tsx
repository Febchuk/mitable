"use client";

import * as React from "react";
import { ChevronRight, Mail, Plus, Search, UserPlus } from "lucide-react";
import { initialsFor, type Tone } from "@/components/montessori/data";
import { PageHeader, cardStyle } from "@/components/montessori/page-header";
import { Avatar, ToastBus } from "@/components/montessori/primitives";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type TeacherStatus = "Active" | "Invited";

type Teacher = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  classrooms: string[];
  status: TeacherStatus;
  joined: string;
  tone: Tone;
};

const TONE_CYCLE: Tone[] = ["clay", "sage", "butter", "blue", "terracotta"];

// Mocked roster — mirrors the teacher names referenced in /admin/classrooms so
// the two pages stay consistent until the users API is wired up.
const INITIAL_TEACHERS: Teacher[] = [
  {
    id: "t-anna",
    firstName: "Anna",
    lastName: "Maren",
    email: "anna.maren@example.school",
    classrooms: ["Primary East"],
    status: "Active",
    joined: "Sept 2023",
    tone: "clay",
  },
  {
    id: "t-olivia",
    firstName: "Olivia",
    lastName: "Brand",
    email: "olivia.brand@example.school",
    classrooms: ["Elementary West"],
    status: "Active",
    joined: "Aug 2024",
    tone: "sage",
  },
  {
    id: "t-marcus",
    firstName: "Marcus",
    lastName: "Kelly",
    email: "marcus.kelly@example.school",
    classrooms: ["Toddler North"],
    status: "Active",
    joined: "Jan 2025",
    tone: "butter",
  },
  {
    id: "t-yuki",
    firstName: "Yuki",
    lastName: "Tanaka",
    email: "yuki.tanaka@example.school",
    classrooms: [],
    status: "Invited",
    joined: "Apr 28",
    tone: "blue",
  },
];

export default function AdminTeachersPage() {
  const [teachers, setTeachers] = React.useState<Teacher[]>(INITIAL_TEACHERS);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const filtered = teachers.filter((teacher) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      `${teacher.firstName} ${teacher.lastName}`.toLowerCase().includes(q) ||
      teacher.email.toLowerCase().includes(q)
    );
  });

  const inviteTeacher = (input: { firstName: string; lastName: string; email: string }) => {
    const id = `teacher_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const next: Teacher = {
      id,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: input.email.trim(),
      classrooms: [],
      status: "Invited",
      joined: "Just now",
      tone: TONE_CYCLE[teachers.length % TONE_CYCLE.length],
    };
    setTeachers((prev) => [...prev, next]);
    ToastBus.push({
      message: `Invite sent to ${next.firstName}`,
      icon: <Mail size={12} strokeWidth={1.5} color="var(--color-surface)" />,
    });
  };

  return (
    <div>
      <PageHeader
        title="Teachers"
        subtitle="Invite teachers and see who's leading each classroom."
        actions={
          <Button variant="default" onClick={() => setInviteOpen(true)}>
            <Plus size={16} strokeWidth={1.7} /> Add teacher
          </Button>
        }
      />

      <div style={{ padding: "20px 24px 64px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 14,
          }}
        >
          <div style={{ fontSize: 13, color: "var(--color-ink-secondary)" }}>
            {teachers.length} teacher{teachers.length === 1 ? "" : "s"} ·{" "}
            {teachers.filter((t) => t.status === "Invited").length} pending invite
          </div>
          <div style={{ position: "relative", width: 240, maxWidth: "100%" }}>
            <Search
              size={15}
              strokeWidth={1.5}
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--color-ink-muted)",
              }}
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search teachers"
              style={{ paddingLeft: 32 }}
            />
          </div>
        </div>

        {/* Desktop table */}
        <div className="hidden lg:block" style={cardStyle}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.6fr 1.6fr 1.4fr 0.8fr 24px",
              padding: "12px 20px",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            {["Teacher", "Email", "Classrooms", "Status", ""].map((header) => (
              <div
                key={header}
                className="label-cap"
                style={{ color: "var(--color-ink-muted)" }}
              >
                {header}
              </div>
            ))}
          </div>
          {filtered.map((teacher) => (
            <TeacherRow key={teacher.id} teacher={teacher} />
          ))}
          {filtered.length === 0 && (
            <div
              style={{
                padding: 28,
                textAlign: "center",
                fontSize: 13,
                color: "var(--color-ink-muted)",
              }}
            >
              No teachers match this search.
            </div>
          )}
        </div>

        {/* Mobile list */}
        <div className="lg:hidden" style={cardStyle}>
          {filtered.map((teacher, index) => (
            <TeacherMobileRow key={teacher.id} teacher={teacher} index={index} />
          ))}
          {filtered.length === 0 && (
            <div
              style={{
                padding: 20,
                fontSize: 13,
                color: "var(--color-ink-muted)",
                textAlign: "center",
              }}
            >
              No teachers match this search.
            </div>
          )}
        </div>
      </div>

      <InviteTeacherDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvite={inviteTeacher}
      />
    </div>
  );
}

function TeacherRow({ teacher }: { teacher: Teacher }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.6fr 1.6fr 1.4fr 0.8fr 24px",
        alignItems: "center",
        padding: "12px 20px",
        borderTop: "1px solid var(--color-border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Avatar
          initials={initialsFor(`${teacher.firstName} ${teacher.lastName}`)}
          tone={teacher.tone}
          size={34}
        />
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: "var(--color-ink)" }}>
            {teacher.firstName} {teacher.lastName}
          </div>
          <div style={{ fontSize: 12, color: "var(--color-ink-muted)", marginTop: 2 }}>
            Joined {teacher.joined}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 13, color: "var(--color-ink-secondary)" }}>{teacher.email}</div>
      <div style={{ fontSize: 13, color: "var(--color-ink-secondary)" }}>
        {teacher.classrooms.length === 0 ? "—" : teacher.classrooms.join(", ")}
      </div>
      <div>
        <StatusPill status={teacher.status} />
      </div>
      <ChevronRight size={14} strokeWidth={1.5} color="var(--color-ink-muted)" />
    </div>
  );
}

function TeacherMobileRow({ teacher, index }: { teacher: Teacher; index: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 16px",
        borderTop: index ? "1px solid var(--color-border)" : 0,
      }}
    >
      <Avatar
        initials={initialsFor(`${teacher.firstName} ${teacher.lastName}`)}
        tone={teacher.tone}
        size={40}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 15, color: "var(--color-ink)" }}>
          {teacher.firstName} {teacher.lastName}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--color-ink-secondary)",
            marginTop: 2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {teacher.email}
        </div>
        {teacher.classrooms.length > 0 && (
          <div style={{ fontSize: 11, color: "var(--color-ink-muted)", marginTop: 2 }}>
            {teacher.classrooms.join(", ")}
          </div>
        )}
      </div>
      <StatusPill status={teacher.status} />
    </div>
  );
}

function StatusPill({ status }: { status: TeacherStatus }) {
  const isActive = status === "Active";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 10px",
        borderRadius: 999,
        background: isActive
          ? "var(--color-sage-soft, var(--color-muted))"
          : "var(--color-terracotta-soft)",
        color: isActive
          ? "var(--color-sage-deep, var(--color-ink-secondary))"
          : "var(--color-terracotta-deep)",
      }}
    >
      {status}
    </span>
  );
}

function FieldLabel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="label-cap mb-1" style={{ color: "var(--color-ink-muted)" }}>
        {label}
      </div>
      {children}
    </label>
  );
}

function InviteTeacherDialog({
  open,
  onOpenChange,
  onInvite,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvite: (input: { firstName: string; lastName: string; email: string }) => void;
}) {
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [email, setEmail] = React.useState("");

  React.useEffect(() => {
    if (!open) {
      setFirstName("");
      setLastName("");
      setEmail("");
    }
  }, [open]);

  const trimmedEmail = email.trim();
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
  const canSubmit =
    firstName.trim().length > 0 && lastName.trim().length > 0 && isValidEmail;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px] rounded-[22px] border border-border bg-surface p-0 shadow-2xl">
        <DialogHeader className="border-b border-border px-6 py-5">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <UserPlus size={18} strokeWidth={1.6} /> Invite teacher
          </DialogTitle>
          <p className="text-sm text-ink-secondary">
            They'll get an email with a link to set up their account.
          </p>
        </DialogHeader>

        <div className="space-y-3 px-6 py-5">
          <div className="grid gap-3 md:grid-cols-2">
            <FieldLabel label="First name">
              <Input
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                placeholder="e.g. Maya"
                className="h-10 bg-canvas"
                autoFocus
              />
            </FieldLabel>
            <FieldLabel label="Last name">
              <Input
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                placeholder="e.g. Patel"
                className="h-10 bg-canvas"
              />
            </FieldLabel>
          </div>
          <FieldLabel label="Email">
            <Input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="teacher@school.example"
              className="h-10 bg-canvas"
              type="email"
            />
          </FieldLabel>
          {email.length > 0 && !isValidEmail && (
            <div style={{ fontSize: 12, color: "var(--color-terracotta-deep)" }}>
              That doesn't look like a valid email yet.
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-canvas px-6 py-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() => {
              if (!canSubmit) return;
              onInvite({ firstName, lastName, email });
              onOpenChange(false);
            }}
          >
            Send invite
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
