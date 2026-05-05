"use client";

import * as React from "react";
import {
  CheckCircle2,
  Mail,
  MailWarning,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { initialsFor, type Tone } from "@/components/montessori/data";
import {
  FilterChips,
  PageHeader,
  cardStyle,
} from "@/components/montessori/page-header";
import {
  Avatar,
  HandDivider,
  HandUnderline,
  ToastBus,
} from "@/components/montessori/primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type TeacherStatus = "Active" | "Invited" | "Expired";

type Teacher = {
  id: string;
  email: string;
  /** Filled in by the teacher when they claim — undefined while pending. */
  firstName?: string;
  lastName?: string;
  classrooms: string[];
  status: TeacherStatus;
  tone: Tone;
  /** Server invitation row id, present whenever status is Invited or Expired. */
  invitationId?: string;
  /** ISO timestamp the invite was first issued (or re-issued). */
  invitedAt?: string;
  /** ISO timestamp the invite link expires. */
  expiresAt?: string;
  /** ISO timestamp the teacher claimed and became Active. */
  joinedAt?: string;
};

const TONE_CYCLE: Tone[] = ["clay", "sage", "butter", "blue", "terracotta"];

const FILTERS: TeacherStatus[] = ["Active", "Invited", "Expired"];
type FilterValue = "All" | TeacherStatus;

interface ApiTeacher {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  classrooms: string[];
  status: TeacherStatus;
  invitationId?: string;
  invitedAt?: string;
  expiresAt?: string;
  joinedAt?: string;
}

function toneFor(index: number): Tone {
  return TONE_CYCLE[index % TONE_CYCLE.length];
}

function mapApiTeachers(rows: ApiTeacher[]): Teacher[] {
  return rows.map((row, i) => ({
    id: row.id,
    email: row.email,
    firstName: row.firstName ?? undefined,
    lastName: row.lastName ?? undefined,
    classrooms: row.classrooms,
    status: row.status,
    tone: toneFor(i),
    invitationId: row.invitationId,
    invitedAt: row.invitedAt,
    expiresAt: row.expiresAt,
    joinedAt: row.joinedAt,
  }));
}

export default function AdminTeachersPage() {
  const [teachers, setTeachers] = React.useState<Teacher[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<FilterValue>("All");

  const refresh = React.useCallback(async () => {
    try {
      const res = await fetch("/api/admin/teachers", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Failed to load teachers (${res.status})`);
      }
      const json = (await res.json()) as { teachers: ApiTeacher[] };
      setTeachers(mapApiTeachers(json.teachers));
    } catch (err) {
      ToastBus.push({
        message: (err as Error).message,
        icon: <MailWarning size={12} strokeWidth={1.6} color="var(--color-surface)" />,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const counts = React.useMemo(() => {
    const c: Record<FilterValue, number> = {
      All: teachers.length,
      Active: 0,
      Invited: 0,
      Expired: 0,
    };
    for (const t of teachers) c[t.status] += 1;
    return c;
  }, [teachers]);

  const filtered = teachers.filter((teacher) => {
    if (filter !== "All" && teacher.status !== filter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const name = `${teacher.firstName ?? ""} ${teacher.lastName ?? ""}`.toLowerCase();
    return name.includes(q) || teacher.email.toLowerCase().includes(q);
  });

  const bulkInvite = async (emails: string[]) => {
    if (emails.length === 0) return;
    try {
      const res = await fetch("/api/admin/teachers/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        sent?: Array<{ email: string }>;
        skipped?: Array<{ email: string; reason: string }>;
        errors?: Array<{ email: string; error: string }>;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json.error ?? `Invite failed (${res.status})`);
      }
      const sentCount = json.sent?.length ?? 0;
      const skippedCount = json.skipped?.length ?? 0;
      const errorCount = json.errors?.length ?? 0;
      if (sentCount > 0) {
        ToastBus.push({
          message:
            sentCount === 1
              ? `Invite sent to ${json.sent![0].email}`
              : `${sentCount} invites sent`,
          icon: <Mail size={12} strokeWidth={1.6} color="var(--color-surface)" />,
        });
      }
      if (skippedCount > 0) {
        const reasons = (json.skipped ?? [])
          .map((s) => `${s.email} (${prettyReason(s.reason)})`)
          .join(", ");
        ToastBus.push({
          message:
            skippedCount === 1
              ? `Skipped ${reasons}`
              : `${skippedCount} skipped: ${reasons}`,
          icon: <MailWarning size={12} strokeWidth={1.6} color="var(--color-surface)" />,
        });
      }
      if (errorCount > 0) {
        // Log the full per-email reasons so they're inspectable in DevTools.
        // Toasts get truncated; the console message survives.
        console.error("[invite] send failures", json.errors);
        const first = json.errors![0];
        ToastBus.push({
          message:
            errorCount === 1
              ? `Couldn't send to ${first.email}: ${first.error}`
              : `${errorCount} invites failed — check console for details`,
          icon: <MailWarning size={12} strokeWidth={1.6} color="var(--color-surface)" />,
          duration: 8000,
        });
      }
      await refresh();
    } catch (err) {
      ToastBus.push({
        message: (err as Error).message,
        icon: <MailWarning size={12} strokeWidth={1.6} color="var(--color-surface)" />,
      });
    }
  };

  const resendInvite = async (id: string, invitationId: string | undefined) => {
    if (!invitationId) return;
    const teacher = teachers.find((t) => t.id === id);
    try {
      const res = await fetch(`/api/admin/teachers/invite/${invitationId}/resend`, {
        method: "POST",
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? `Resend failed (${res.status})`);
      }
      ToastBus.push({
        message: teacher ? `Invite re-sent to ${teacher.email}` : "Invite re-sent",
        icon: <RefreshCw size={12} strokeWidth={1.6} color="var(--color-surface)" />,
      });
      await refresh();
    } catch (err) {
      ToastBus.push({
        message: (err as Error).message,
        icon: <MailWarning size={12} strokeWidth={1.6} color="var(--color-surface)" />,
      });
    }
  };

  const revokeInvite = async (id: string, invitationId: string | undefined) => {
    if (!invitationId) return;
    const teacher = teachers.find((t) => t.id === id);
    // Optimistic remove — refresh reconciles.
    setTeachers((prev) => prev.filter((t) => t.id !== id));
    try {
      const res = await fetch(`/api/admin/teachers/invite/${invitationId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? `Revoke failed (${res.status})`);
      }
      ToastBus.push({
        message: teacher ? `Invite for ${teacher.email} revoked` : "Invite revoked",
        icon: <Trash2 size={12} strokeWidth={1.6} color="var(--color-surface)" />,
      });
    } catch (err) {
      ToastBus.push({
        message: (err as Error).message,
        icon: <MailWarning size={12} strokeWidth={1.6} color="var(--color-surface)" />,
      });
    } finally {
      await refresh();
    }
  };

  function prettyReason(reason: string): string {
    if (reason === "already_active") return "already on your team";
    if (reason === "duplicate") return "duplicate";
    if (reason === "invalid") return "invalid email";
    return reason;
  }

  return (
    <div>
      <PageHeader
        title="Teachers"
        subtitle="Invite teachers and see who's leading each classroom."
        actions={
          <Button variant="default" onClick={() => setInviteOpen(true)}>
            <Plus size={16} strokeWidth={1.7} /> Invite teachers
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
            marginBottom: 16,
          }}
        >
          <FilterChips
            options={[
              `All · ${counts.All}`,
              ...FILTERS.map((f) => `${labelFor(f)} · ${counts[f]}`),
            ]}
            value={
              filter === "All"
                ? `All · ${counts.All}`
                : `${labelFor(filter)} · ${counts[filter]}`
            }
            onChange={(v) => {
              const stripped = v.split(" · ")[0] as FilterValue;
              setFilter(stripped);
            }}
          />
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
              gridTemplateColumns: "1.6fr 1.6fr 1.4fr 1fr 96px",
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
            <TeacherRow
              key={teacher.id}
              teacher={teacher}
              onResend={() => resendInvite(teacher.id, teacher.invitationId)}
              onRevoke={() => revokeInvite(teacher.id, teacher.invitationId)}
            />
          ))}
          {filtered.length === 0 && (
            <EmptyState filter={filter} search={search} loading={loading} />
          )}
        </div>

        {/* Mobile list */}
        <div className="lg:hidden" style={cardStyle}>
          {filtered.map((teacher, index) => (
            <TeacherMobileRow
              key={teacher.id}
              teacher={teacher}
              index={index}
              onResend={() => resendInvite(teacher.id, teacher.invitationId)}
              onRevoke={() => revokeInvite(teacher.id, teacher.invitationId)}
            />
          ))}
          {filtered.length === 0 && (
            <EmptyState filter={filter} search={search} compact loading={loading} />
          )}
        </div>
      </div>

      <InviteTeachersDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        existingEmails={teachers.map((t) => t.email.toLowerCase())}
        onInvite={bulkInvite}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Roster rows                                                        */
/* ------------------------------------------------------------------ */

function TeacherRow({
  teacher,
  onResend,
  onRevoke,
}: {
  teacher: Teacher;
  onResend: () => void;
  onRevoke: () => void;
}) {
  const [hover, setHover] = React.useState(false);
  const displayName =
    teacher.firstName || teacher.lastName
      ? `${teacher.firstName ?? ""} ${teacher.lastName ?? ""}`.trim()
      : "Awaiting sign-up";
  const subtitle = subtitleFor(teacher);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "grid",
        gridTemplateColumns: "1.6fr 1.6fr 1.4fr 1fr 96px",
        alignItems: "center",
        padding: "14px 20px",
        borderTop: "1px solid var(--color-border)",
        background: hover ? "var(--color-canvas)" : "transparent",
        transition: "background 140ms ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Avatar
          initials={
            displayName === "Awaiting sign-up"
              ? glyphFor(teacher.email)
              : initialsFor(displayName)
          }
          tone={teacher.tone}
          size={36}
        />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 14,
              color:
                displayName === "Awaiting sign-up"
                  ? "var(--color-ink-muted)"
                  : "var(--color-ink)",
              fontStyle: displayName === "Awaiting sign-up" ? "italic" : "normal",
            }}
          >
            {displayName}
          </div>
          <div style={{ fontSize: 12, color: "var(--color-ink-muted)", marginTop: 2 }}>
            {subtitle}
          </div>
        </div>
      </div>
      <div
        style={{
          fontSize: 13,
          color: "var(--color-ink-secondary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {teacher.email}
      </div>
      <div style={{ fontSize: 13, color: "var(--color-ink-secondary)" }}>
        {teacher.classrooms.length === 0 ? "—" : teacher.classrooms.join(", ")}
      </div>
      <div>
        <StatusPill status={teacher.status} />
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 4,
          opacity: hover && teacher.status !== "Active" ? 1 : 0,
          transition: "opacity 140ms ease",
          pointerEvents: hover && teacher.status !== "Active" ? "auto" : "none",
        }}
      >
        <RowAction label="Resend invite" onClick={onResend}>
          <RefreshCw size={14} strokeWidth={1.6} />
        </RowAction>
        <RowAction label="Revoke invite" onClick={onRevoke} tone="danger">
          <Trash2 size={14} strokeWidth={1.6} />
        </RowAction>
      </div>
    </div>
  );
}

function TeacherMobileRow({
  teacher,
  index,
  onResend,
  onRevoke,
}: {
  teacher: Teacher;
  index: number;
  onResend: () => void;
  onRevoke: () => void;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const displayName =
    teacher.firstName || teacher.lastName
      ? `${teacher.firstName ?? ""} ${teacher.lastName ?? ""}`.trim()
      : "Awaiting sign-up";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 16px",
        borderTop: index ? "1px solid var(--color-border)" : 0,
        position: "relative",
      }}
    >
      <Avatar
        initials={
          displayName === "Awaiting sign-up"
            ? glyphFor(teacher.email)
            : initialsFor(displayName)
        }
        tone={teacher.tone}
        size={42}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: 15,
            color:
              displayName === "Awaiting sign-up"
                ? "var(--color-ink-muted)"
                : "var(--color-ink)",
            fontStyle: displayName === "Awaiting sign-up" ? "italic" : "normal",
          }}
        >
          {displayName}
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
        <div
          style={{
            fontSize: 11,
            color: "var(--color-ink-muted)",
            marginTop: 3,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <StatusPill status={teacher.status} compact />
          <span>· {subtitleFor(teacher)}</span>
        </div>
      </div>
      {teacher.status !== "Active" && (
        <button
          type="button"
          aria-label="Invite actions"
          onClick={() => setMenuOpen((v) => !v)}
          style={{
            width: 32,
            height: 32,
            borderRadius: 999,
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--color-ink-muted)",
            flexShrink: 0,
          }}
        >
          <MoreHorizontal size={16} strokeWidth={1.6} />
        </button>
      )}
      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          style={{
            position: "absolute",
            inset: 0,
            top: "auto",
            transform: "translateY(100%)",
            zIndex: 10,
            background: "var(--color-surface)",
            borderRadius: 12,
            border: "1px solid var(--color-border)",
            boxShadow: "0 12px 30px rgba(42,39,35,0.14)",
            padding: 6,
            margin: "6px 16px 0",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <MenuItem
            icon={<RefreshCw size={14} strokeWidth={1.6} />}
            label="Resend invite"
            onClick={onResend}
          />
          <MenuItem
            icon={<Trash2 size={14} strokeWidth={1.6} />}
            label="Revoke invite"
            tone="danger"
            onClick={onRevoke}
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 10px",
        borderRadius: 8,
        background: "transparent",
        border: "none",
        textAlign: "left",
        fontSize: 13,
        color:
          tone === "danger" ? "var(--color-terracotta-deep)" : "var(--color-ink)",
        cursor: "pointer",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function RowAction({
  label,
  onClick,
  children,
  tone,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      style={{
        width: 30,
        height: 30,
        borderRadius: 999,
        border: "1px solid var(--color-border)",
        background: "var(--color-surface)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color:
          tone === "danger" ? "var(--color-terracotta-deep)" : "var(--color-ink-secondary)",
        cursor: "pointer",
        transition: "background 120ms ease, border-color 120ms ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--color-canvas)";
        e.currentTarget.style.borderColor = "var(--color-ink-muted)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--color-surface)";
        e.currentTarget.style.borderColor = "var(--color-border)";
      }}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Status pill                                                        */
/* ------------------------------------------------------------------ */

function StatusPill({
  status,
  compact = false,
}: {
  status: TeacherStatus;
  compact?: boolean;
}) {
  const palette = STATUS_PALETTE[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: compact ? 10 : 11,
        fontWeight: 600,
        padding: compact ? "2px 8px" : "3px 10px",
        borderRadius: 999,
        background: palette.bg,
        color: palette.fg,
        letterSpacing: "0.01em",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: palette.dot,
          boxShadow:
            status === "Invited"
              ? `0 0 0 3px ${palette.bg}, 0 0 0 4px ${palette.dot}33`
              : "none",
        }}
      />
      {labelFor(status)}
    </span>
  );
}

const STATUS_PALETTE: Record<
  TeacherStatus,
  { bg: string; fg: string; dot: string }
> = {
  Active: {
    bg: "var(--color-sage-soft)",
    fg: "var(--color-sage-deep)",
    dot: "var(--color-sage-deep)",
  },
  Invited: {
    bg: "var(--color-butter-soft)",
    fg: "var(--color-butter-deep)",
    dot: "var(--color-butter-deep)",
  },
  Expired: {
    bg: "var(--color-terracotta-soft)",
    fg: "var(--color-terracotta-deep)",
    dot: "var(--color-terracotta-deep)",
  },
};

function labelFor(status: TeacherStatus): string {
  if (status === "Invited") return "Pending";
  return status;
}

/* ------------------------------------------------------------------ */
/*  Empty state                                                        */
/* ------------------------------------------------------------------ */

function EmptyState({
  filter,
  search,
  compact,
  loading,
}: {
  filter: FilterValue;
  search: string;
  compact?: boolean;
  loading?: boolean;
}) {
  const message = loading
    ? "Loading roster…"
    : search.trim()
      ? `No teachers match "${search.trim()}".`
      : filter === "Invited"
        ? "No pending invites — everyone you've invited has signed up."
        : filter === "Expired"
          ? "No expired invites. The garden is tidy."
          : filter === "Active"
            ? "No active teachers yet. Send your first invite to get started."
            : "No teachers yet. Click “Invite teachers” to add the first one.";

  return (
    <div
      style={{
        padding: compact ? "28px 20px" : "44px 24px",
        textAlign: "center",
        color: "var(--color-ink-muted)",
      }}
    >
      <div style={{ fontSize: 13, marginBottom: 14 }}>{message}</div>
      <div style={{ display: "flex", justifyContent: "center", opacity: 0.6 }}>
        <HandDivider color="var(--color-clay)" width={compact ? 140 : 200} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Multi-email invite dialog                                          */
/* ------------------------------------------------------------------ */

type DraftChip = {
  id: string;
  email: string;
  isValid: boolean;
  reason?: "duplicate" | "alreadyExists" | "format";
};

function InviteTeachersDialog({
  open,
  onOpenChange,
  existingEmails,
  onInvite,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingEmails: string[];
  onInvite: (emails: string[]) => void;
}) {
  const [chips, setChips] = React.useState<DraftChip[]>([]);
  const [draft, setDraft] = React.useState("");
  const [shakeId, setShakeId] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) {
      setChips([]);
      setDraft("");
      setShakeId(null);
    } else {
      // Tiny delay so dialog open animation finishes first.
      window.setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  const validChips = chips.filter((c) => c.isValid);
  const invalidChips = chips.filter((c) => !c.isValid);

  const commitDraft = (raw: string): boolean => {
    const tokens = raw
      .split(/[\s,;\n]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (tokens.length === 0) return false;

    setChips((prev) => {
      const taken = new Set(prev.map((c) => c.email.toLowerCase()));
      const next = [...prev];
      for (const token of tokens) {
        const lower = token.toLowerCase();
        const isFormatValid = isValidEmail(token);
        let reason: DraftChip["reason"];
        let isValid = isFormatValid;
        if (!isFormatValid) {
          reason = "format";
        } else if (taken.has(lower)) {
          isValid = false;
          reason = "duplicate";
        } else if (existingEmails.includes(lower)) {
          isValid = false;
          reason = "alreadyExists";
        }
        if (isValid) taken.add(lower);
        next.push({
          id: `chip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          email: token,
          isValid,
          reason,
        });
      }
      return next;
    });
    return true;
  };

  const removeChip = (id: string) =>
    setChips((prev) => prev.filter((c) => c.id !== id));

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === " " || e.key === "Tab") {
      if (draft.trim().length > 0) {
        e.preventDefault();
        commitDraft(draft);
        setDraft("");
      }
    } else if (e.key === "Backspace" && draft.length === 0 && chips.length > 0) {
      e.preventDefault();
      setChips((prev) => prev.slice(0, -1));
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text");
    if (/[\s,;]/.test(pasted)) {
      e.preventDefault();
      commitDraft(pasted);
      setDraft("");
    }
  };

  const handleSend = () => {
    // Commit any pending draft first.
    if (draft.trim()) {
      commitDraft(draft);
      setDraft("");
    }
    if (invalidChips.length > 0) {
      // Shake the first invalid chip to draw the eye.
      const id = invalidChips[0].id;
      setShakeId(id);
      window.setTimeout(() => setShakeId(null), 420);
    }
    if (validChips.length > 0) {
      onInvite(validChips.map((c) => c.email));
      onOpenChange(false);
    }
  };

  const totalReady = validChips.length;
  const sendLabel =
    totalReady === 0
      ? "Send invites"
      : totalReady === 1
        ? "Send 1 invite"
        : `Send ${totalReady} invites`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="rounded-[22px] border border-border bg-surface p-0 shadow-2xl"
        style={{ maxWidth: 540 }}
      >
        <DialogHeader className="border-b border-border px-6 pt-6 pb-5">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 999,
                background: "var(--color-clay-soft)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-terracotta-deep)",
              }}
            >
              <Mail size={16} strokeWidth={1.6} />
            </div>
            <DialogTitle style={{ fontSize: 20, lineHeight: 1.1, fontWeight: 600 }}>
              Invite teachers
            </DialogTitle>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              paddingLeft: 42,
            }}
          >
            <p style={{ fontSize: 13, color: "var(--color-ink-secondary)", margin: 0 }}>
              Add one or many email addresses. Each teacher gets a link to set up their
              own account.
            </p>
            <HandUnderline width={108} style={{ marginTop: 2 }} />
          </div>
        </DialogHeader>

        <div style={{ padding: "20px 24px 8px" }}>
          <div className="label-cap" style={{ color: "var(--color-ink-muted)", marginBottom: 8 }}>
            Email addresses
          </div>
          <ChipField
            chips={chips}
            draft={draft}
            shakeId={shakeId}
            inputRef={inputRef}
            onDraftChange={setDraft}
            onKey={handleKey}
            onPaste={handlePaste}
            onRemove={removeChip}
            onBlurDraft={() => {
              if (draft.trim()) {
                commitDraft(draft);
                setDraft("");
              }
            }}
          />
          <div
            style={{
              fontSize: 11,
              color: "var(--color-ink-muted)",
              marginTop: 10,
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            <span>Press</span>
            <Kbd>Enter</Kbd>
            <span>or</span>
            <Kbd>,</Kbd>
            <span>to add. Paste a list to add many at once.</span>
          </div>

          {invalidChips.length > 0 && (
            <div
              style={{
                marginTop: 14,
                padding: "10px 12px",
                borderRadius: 10,
                background: "var(--color-terracotta-soft)",
                color: "var(--color-terracotta-deep)",
                fontSize: 12.5,
                lineHeight: 1.5,
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
              }}
            >
              <MailWarning size={14} strokeWidth={1.7} style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                {invalidChips.length === 1 ? "1 address needs attention:" : `${invalidChips.length} addresses need attention:`}{" "}
                {summarizeInvalid(invalidChips)}
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            borderTop: "1px solid var(--color-border)",
            background: "var(--color-canvas)",
            padding: "14px 24px",
          }}
        >
          <div style={{ fontSize: 12, color: "var(--color-ink-muted)" }}>
            {totalReady > 0 && (
              <span>
                <CheckCircle2
                  size={12}
                  strokeWidth={1.8}
                  style={{ verticalAlign: "-2px", marginRight: 4, color: "var(--color-sage-deep)" }}
                />
                {totalReady} ready to send
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={totalReady === 0} onClick={handleSend}>
              {sendLabel}
            </Button>
          </div>
        </div>

        <style>{`
          @keyframes chip-shake {
            0%, 100% { transform: translateX(0); }
            20% { transform: translateX(-4px); }
            40% { transform: translateX(4px); }
            60% { transform: translateX(-3px); }
            80% { transform: translateX(2px); }
          }
          .chip-shake { animation: chip-shake 380ms cubic-bezier(0.36, 0.07, 0.19, 0.97); }
        `}</style>
      </DialogContent>
    </Dialog>
  );
}

function ChipField({
  chips,
  draft,
  shakeId,
  inputRef,
  onDraftChange,
  onKey,
  onPaste,
  onRemove,
  onBlurDraft,
}: {
  chips: DraftChip[];
  draft: string;
  shakeId: string | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onDraftChange: (v: string) => void;
  onKey: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onPaste: (e: React.ClipboardEvent<HTMLInputElement>) => void;
  onRemove: (id: string) => void;
  onBlurDraft: () => void;
}) {
  const [focused, setFocused] = React.useState(false);
  return (
    <div
      onClick={() => inputRef.current?.focus()}
      style={{
        minHeight: 88,
        borderRadius: 12,
        border: `1px solid ${focused ? "var(--color-ink)" : "var(--color-border)"}`,
        background: "var(--color-canvas)",
        padding: 8,
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        alignItems: "flex-start",
        cursor: "text",
        transition: "border-color 120ms ease",
      }}
    >
      {chips.map((chip, i) => (
        <Chip
          key={chip.id}
          chip={chip}
          tone={TONE_CYCLE[i % TONE_CYCLE.length]}
          shake={shakeId === chip.id}
          onRemove={() => onRemove(chip.id)}
        />
      ))}
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={onKey}
        onPaste={onPaste}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          onBlurDraft();
        }}
        placeholder={chips.length === 0 ? "teacher@school.example" : ""}
        style={{
          flex: 1,
          minWidth: 180,
          border: "none",
          outline: "none",
          background: "transparent",
          fontSize: 14,
          padding: "6px 6px",
          color: "var(--color-ink)",
          fontFamily: "inherit",
        }}
      />
    </div>
  );
}

function Chip({
  chip,
  tone,
  shake,
  onRemove,
}: {
  chip: DraftChip;
  tone: Tone;
  shake: boolean;
  onRemove: () => void;
}) {
  const palette = chip.isValid
    ? TONE_PILL[tone]
    : {
        bg: "var(--color-terracotta-soft)",
        fg: "var(--color-terracotta-deep)",
        ring: "var(--color-terracotta-deep)",
      };
  return (
    <span
      className={shake ? "chip-shake" : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 5px 5px 6px",
        borderRadius: 999,
        background: palette.bg,
        color: palette.fg,
        fontSize: 13,
        fontWeight: 500,
        maxWidth: "100%",
        border: chip.isValid ? "1px solid transparent" : `1px dashed ${palette.ring}`,
      }}
      title={
        chip.reason === "duplicate"
          ? "Already in this list"
          : chip.reason === "alreadyExists"
            ? "Already a teacher in your school"
            : chip.reason === "format"
              ? "Doesn't look like a valid email"
              : undefined
      }
    >
      {chip.isValid ? (
        <Avatar initials={glyphFor(chip.email)} tone={tone} size={20} />
      ) : (
        <span
          aria-hidden
          style={{
            width: 20,
            height: 20,
            borderRadius: 999,
            background: "var(--color-surface)",
            color: palette.fg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <MailWarning size={12} strokeWidth={1.8} />
        </span>
      )}
      <span
        style={{
          maxWidth: 240,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {chip.email}
      </span>
      <button
        type="button"
        aria-label={`Remove ${chip.email}`}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        style={{
          width: 18,
          height: 18,
          borderRadius: 999,
          border: "none",
          background: "transparent",
          color: palette.fg,
          opacity: 0.7,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
        }}
      >
        <X size={12} strokeWidth={2} />
      </button>
    </span>
  );
}

const TONE_PILL: Record<Tone, { bg: string; fg: string; ring: string }> = {
  clay: {
    bg: "var(--color-clay-soft)",
    fg: "var(--color-terracotta-deep)",
    ring: "var(--color-terracotta-deep)",
  },
  sage: {
    bg: "var(--color-sage-soft)",
    fg: "var(--color-sage-deep)",
    ring: "var(--color-sage-deep)",
  },
  butter: {
    bg: "var(--color-butter-soft)",
    fg: "var(--color-butter-deep)",
    ring: "var(--color-butter-deep)",
  },
  blue: {
    bg: "var(--color-dusty-blue-soft)",
    fg: "#33526E",
    ring: "#33526E",
  },
  terracotta: {
    bg: "var(--color-terracotta-soft)",
    fg: "var(--color-terracotta-deep)",
    ring: "var(--color-terracotta-deep)",
  },
};

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "1px 6px",
        borderRadius: 5,
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        fontFamily: "inherit",
        fontSize: 11,
        color: "var(--color-ink-secondary)",
        boxShadow: "0 1px 0 var(--color-border)",
      }}
    >
      {children}
    </kbd>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function summarizeInvalid(chips: DraftChip[]): string {
  const counts = { format: 0, duplicate: 0, alreadyExists: 0 };
  for (const c of chips) if (c.reason) counts[c.reason] += 1;
  const parts: string[] = [];
  if (counts.format) parts.push(`${counts.format} not a valid email`);
  if (counts.duplicate) parts.push(`${counts.duplicate} duplicate`);
  if (counts.alreadyExists) parts.push(`${counts.alreadyExists} already on your team`);
  return parts.join(" · ");
}

function glyphFor(email: string): string {
  const local = email.split("@")[0] ?? "?";
  const cleaned = local.replace(/[^a-zA-Z]/g, "");
  return (cleaned || local).slice(0, 2).toUpperCase();
}

function subtitleFor(t: Teacher): string {
  if (t.status === "Active") {
    return t.joinedAt ? `Joined ${formatRelative(t.joinedAt)}` : "Joined";
  }
  if (t.status === "Invited") {
    const sent = t.invitedAt ? `Invited ${formatRelative(t.invitedAt)}` : "Invited";
    if (t.expiresAt) {
      const days = daysUntil(t.expiresAt);
      if (days > 0) return `${sent} · expires in ${days} day${days === 1 ? "" : "s"}`;
    }
    return sent;
  }
  // Expired
  return t.expiresAt ? `Expired ${formatRelative(t.expiresAt)}` : "Expired";
}

function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86400_000));
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.round(ms / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? "" : "s"} ago`;
  const wk = Math.round(day / 7);
  if (wk < 5) return `${wk} wk${wk === 1 ? "" : "s"} ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo} mo ago`;
  const yr = Math.round(day / 365);
  return `${yr} yr${yr === 1 ? "" : "s"} ago`;
}
