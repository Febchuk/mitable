"use client";

import * as React from "react";
import {
    Bot,
    Camera,
    Check,
    CheckCircle2,
    FileText,
    Grid3x3,
    Mic,
    Pencil,
    PlusCircle,
    Send,
    Sparkles,
    User,
    X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useCurrentClassroom, useStore } from "@/lib/store";
import { parse, type AgentContext } from "@/lib/agent/parse";
import { applyConfirmation } from "@/lib/agent/apply";
import type {
    AgentCard,
    AgentMessage,
    ConfirmationCard,
    ConfirmationChange,
    GridPreviewCard,
    MasteryLevel,
    ReportPreviewCard,
    Role,
    TextAnswerCard,
} from "@/types";
import { ClassroomGrid } from "@/components/grid/ClassroomGrid";

type RolePrompt = { label: string; icon?: React.ElementType };

const TEACHER_PROMPTS: RolePrompt[] = [
    { label: "Amara mastered the Pink Tower today" },
    { label: "Log this week's observations", icon: Mic },
    { label: "Show me Kofi's progress" },
    { label: "Who hasn't been introduced to the Stamp Game yet?" },
    { label: "Draft end of term report for Amara" },
    { label: "Mark everyone present except Temi" },
];

const ADMIN_PROMPTS: RolePrompt[] = [
    { label: "Add a new domain called Social-Emotional Development to the Primary curriculum" },
    { label: "Remove Dressing Frames from Practical Life" },
    { label: "Assign Ms. Charity to the Elementary classroom" },
    { label: "Show me all classrooms and their current progress" },
    { label: "Show me Amara's end of term report" },
];

function prompts(role: Role): RolePrompt[] {
    return role === "admin" ? ADMIN_PROMPTS : TEACHER_PROMPTS;
}

export interface AgentViewProps {
    role: Role;
}

export function AgentView({ role }: AgentViewProps) {
    const store = useStore();
    const currentClassroom = useCurrentClassroom();
    const {
        agentThreads,
        addMessageToThread,
        updateMessageInThread,
        newAgentThread,
        students,
        topics,
        domains,
        classrooms,
        observations,
        addReport,
    } = store;

    // Pick (or create) the "today" thread for this role
    const threadsForRole = agentThreads.filter((t) => t.role === role);
    const [activeThreadId, setActiveThreadId] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (threadsForRole.length === 0) {
            setActiveThreadId(newAgentThread(role, "Today"));
            return;
        }
        if (!activeThreadId || !threadsForRole.some((t) => t.id === activeThreadId)) {
            // newest thread first: sort by createdAt desc
            const sorted = [...threadsForRole].sort((a, b) =>
                a.createdAt < b.createdAt ? 1 : -1
            );
            setActiveThreadId(sorted[0]!.id);
        }
    }, [threadsForRole, activeThreadId, newAgentThread, role]);

    const activeThread = agentThreads.find((t) => t.id === activeThreadId) ?? null;

    const [input, setInput] = React.useState("");
    const [photoPreview, setPhotoPreview] = React.useState<string | null>(null);
    const [pendingVoice, setPendingVoice] = React.useState(false);
    const [inputMethod, setInputMethod] = React.useState<"text" | "voice" | "photo">("text");
    const scrollerRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (scrollerRef.current) {
            scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
        }
    }, [activeThread?.messages.length]);

    const buildAgentContext = React.useCallback((): AgentContext => {
        const classroom =
            role === "admin" ? null : currentClassroom;
        const relevantObservations = observations.map((o) => ({
            studentId: o.studentId,
            topicId: o.topicId,
            level: o.level,
        }));
        return {
            role,
            students,
            topics,
            domains,
            classrooms,
            classroom: classroom ?? null,
            observations: relevantObservations,
        };
    }, [role, currentClassroom, observations, students, topics, domains, classrooms]);

    const send = (text: string) => {
        if (!activeThreadId) return;
        const trimmed = text.trim();
        if (!trimmed && !photoPreview) return;

        const userMsg: AgentMessage = {
            id: `um_${Math.random().toString(36).slice(2, 10)}`,
            role: "user",
            createdAt: new Date().toISOString(),
            text: trimmed,
            inputMethod,
            attachment: photoPreview
                ? { kind: "photo", dataUrl: photoPreview }
                : undefined,
        };
        addMessageToThread(activeThreadId, userMsg);

        // Short progress delay then agent response
        const progress: AgentMessage = {
            id: `pm_${Math.random().toString(36).slice(2, 10)}`,
            role: "agent",
            createdAt: new Date().toISOString(),
            card: {
                kind: "progress",
                label: photoPreview ? "Reading your photo…" : "Thinking…",
            },
        };
        addMessageToThread(activeThreadId, progress);

        const ctx = buildAgentContext();
        const reply = parse(trimmed || "[photo]", ctx);
        window.setTimeout(() => {
            updateMessageInThread(activeThreadId, progress.id, reply);
        }, 450);

        setInput("");
        setPhotoPreview(null);
        setInputMethod("text");
    };

    const commitConfirmation = (messageId: string, card: ConfirmationCard) => {
        applyConfirmation(card.changes, store);
        updateMessageInThread(activeThread!.id, messageId, {
            card: {
                ...card,
                status: "confirmed",
                committedAt: new Date().toISOString(),
            },
        });
    };

    const cancelConfirmation = (messageId: string, card: ConfirmationCard) => {
        updateMessageInThread(activeThread!.id, messageId, {
            card: { ...card, status: "cancelled" },
        });
    };

    const updateConfirmationChange = (
        messageId: string,
        card: ConfirmationCard,
        idx: number,
        patch: Partial<ConfirmationChange>
    ) => {
        const nextChanges = card.changes.map((c, i) => (i === idx ? { ...c, ...patch } : c));
        updateMessageInThread(activeThread!.id, messageId, {
            card: { ...card, changes: nextChanges },
        });
    };

    const approveReport = (messageId: string, card: ReportPreviewCard) => {
        addReport({ ...card.draft, status: "draft" });
        updateMessageInThread(activeThread!.id, messageId, {
            card: { ...card, status: "approved" },
        });
    };

    const mockVoice = () => {
        setPendingVoice(true);
        window.setTimeout(() => {
            setInput("Amara mastered the Pink Tower today and Kofi is practising Pouring Water");
            setPendingVoice(false);
            setInputMethod("voice");
        }, 900);
    };

    const mockPhoto = () => {
        // A tiny transparent pixel as a stand-in thumbnail
        setPhotoPreview(
            "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60'><rect width='100%' height='100%' fill='%232a2824'/><text x='50%' y='55%' font-size='10' font-family='sans-serif' text-anchor='middle' fill='%2382c0cc'>photo</text></svg>"
        );
        setInputMethod("photo");
    };

    if (!activeThread) return null;

    const sortedThreads = [...threadsForRole].sort((a, b) =>
        a.createdAt < b.createdAt ? 1 : -1
    );

    return (
        <div className="flex h-full min-h-0">
            {/* Thread rail */}
            <aside className="hidden lg:flex w-52 shrink-0 border-r border-stroke-subtle flex-col">
                <div className="p-3">
                    <Button
                        variant="secondary"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => {
                            const id = newAgentThread(role, "New conversation");
                            setActiveThreadId(id);
                        }}
                    >
                        <PlusCircle className="h-3.5 w-3.5" /> New conversation
                    </Button>
                </div>
                <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
                    {sortedThreads.map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setActiveThreadId(t.id)}
                            className={cn(
                                "w-full text-left px-3 py-2 rounded-md text-xs transition-colors truncate",
                                t.id === activeThread.id
                                    ? "bg-canvas-overlay text-ink-primary"
                                    : "text-ink-secondary hover:bg-canvas-overlay hover:text-ink-primary"
                            )}
                        >
                            <div className="font-medium truncate">{t.title}</div>
                            <div className="text-[10px] text-ink-tertiary">
                                {new Date(t.createdAt).toLocaleDateString()}
                            </div>
                        </button>
                    ))}
                </div>
            </aside>

            {/* Chat */}
            <div className="flex-1 flex flex-col min-w-0">
                <div
                    ref={scrollerRef}
                    className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-6"
                >
                    {activeThread.messages.length === 0 ? (
                        <EmptyState role={role} onSend={send} />
                    ) : (
                        activeThread.messages.map((m) => (
                            <MessageRow
                                key={m.id}
                                message={m}
                                onConfirm={(card) => commitConfirmation(m.id, card)}
                                onCancel={(card) => cancelConfirmation(m.id, card)}
                                onChangeUpdate={(card, i, patch) =>
                                    updateConfirmationChange(m.id, card, i, patch)
                                }
                                onApproveReport={(card) => approveReport(m.id, card)}
                            />
                        ))
                    )}
                </div>

                <div className="border-t border-stroke-subtle p-3 md:p-4 bg-canvas-base">
                    {photoPreview && (
                        <div className="flex items-center gap-2 mb-2">
                            <div className="h-14 w-14 rounded-md border border-stroke-subtle overflow-hidden bg-canvas-raised">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={photoPreview} alt="attachment" className="h-full w-full" />
                            </div>
                            <button
                                type="button"
                                onClick={() => setPhotoPreview(null)}
                                className="text-xs text-ink-tertiary hover:text-status-error flex items-center gap-1"
                            >
                                <X className="h-3.5 w-3.5" /> Remove photo
                            </button>
                        </div>
                    )}
                    <div className="flex items-end gap-2 rounded-xl border border-stroke-subtle bg-canvas-raised p-2">
                        <button
                            type="button"
                            onClick={mockVoice}
                            className={cn(
                                "h-8 w-8 rounded-lg flex items-center justify-center text-ink-tertiary hover:text-ink-primary hover:bg-canvas-overlay transition-colors shrink-0",
                                pendingVoice && "text-accent bg-accent-bg animate-pulse"
                            )}
                            aria-label="Record voice"
                        >
                            <Mic className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            onClick={mockPhoto}
                            className="h-8 w-8 rounded-lg flex items-center justify-center text-ink-tertiary hover:text-ink-primary hover:bg-canvas-overlay transition-colors shrink-0"
                            aria-label="Attach photo"
                        >
                            <Camera className="h-4 w-4" />
                        </button>
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    send(input);
                                }
                            }}
                            placeholder={
                                pendingVoice
                                    ? "Listening…"
                                    : role === "admin"
                                      ? "Ask the admin agent anything"
                                      : "Log observations, attendance, or draft a report"
                            }
                            rows={1}
                            className="flex-1 bg-transparent outline-none resize-none text-sm placeholder:text-ink-tertiary py-1.5 min-h-[28px] max-h-36"
                        />
                        <Button
                            variant="accent"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={() => send(input)}
                            disabled={!input.trim() && !photoPreview}
                            aria-label="Send"
                        >
                            <Send className="h-4 w-4" />
                        </Button>
                    </div>
                    {inputMethod !== "text" && (
                        <div className="mt-1.5 text-[10px] text-ink-tertiary flex items-center gap-1.5">
                            <span className="h-1 w-1 rounded-full bg-accent" />
                            Input method: {inputMethod}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function EmptyState({ role, onSend }: { role: Role; onSend: (s: string) => void }) {
    return (
        <div className="max-w-xl mx-auto text-center pt-12">
            <div className="h-12 w-12 rounded-2xl bg-accent-bg border border-accent-border flex items-center justify-center mx-auto mb-4">
                <Sparkles className="h-5 w-5 text-accent" />
            </div>
            <h2 className="text-xl font-semibold text-ink-primary">
                {role === "admin" ? "Admin agent" : "Teacher agent"}
            </h2>
            <p className="text-sm text-ink-secondary mt-1">
                {role === "admin"
                    ? "Make school-wide changes through conversation. Every action is confirmed before it's applied."
                    : "Log observations, check progress, mark attendance, and draft reports. Every action is confirmed first."}
            </p>
            <div className="mt-6 grid sm:grid-cols-2 gap-2 text-left">
                {prompts(role).map((p) => {
                    const Icon = p.icon ?? Sparkles;
                    return (
                        <button
                            key={p.label}
                            type="button"
                            onClick={() => onSend(p.label)}
                            className="flex items-start gap-2 p-3 rounded-xl border border-stroke-subtle bg-canvas-raised hover:bg-canvas-overlay transition-colors text-left"
                        >
                            <span className="h-6 w-6 rounded-md bg-canvas-muted flex items-center justify-center shrink-0">
                                <Icon className="h-3.5 w-3.5 text-ink-tertiary" />
                            </span>
                            <span className="text-sm text-ink-primary">{p.label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

interface MessageRowProps {
    message: AgentMessage;
    onConfirm: (card: ConfirmationCard) => void;
    onCancel: (card: ConfirmationCard) => void;
    onChangeUpdate: (card: ConfirmationCard, idx: number, patch: Partial<ConfirmationChange>) => void;
    onApproveReport: (card: ReportPreviewCard) => void;
}

function MessageRow({
    message,
    onConfirm,
    onCancel,
    onChangeUpdate,
    onApproveReport,
}: MessageRowProps) {
    const isUser = message.role === "user";
    return (
        <div className={cn("flex gap-2", isUser ? "justify-end" : "justify-start")}>
            {!isUser && (
                <div className="h-7 w-7 rounded-full border border-accent-border bg-accent-bg flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-3.5 w-3.5 text-accent" />
                </div>
            )}
            <div className={cn("max-w-[720px] space-y-2", isUser && "items-end flex flex-col")}>
                {message.text && (
                    <div
                        className={cn(
                            "px-3.5 py-2 rounded-2xl text-sm",
                            isUser
                                ? "bg-accent-bg border border-accent-border text-ink-primary rounded-tr-sm"
                                : "text-ink-primary"
                        )}
                    >
                        {message.text}
                    </div>
                )}
                {message.attachment?.kind === "photo" && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={message.attachment.dataUrl}
                        alt="attachment"
                        className="h-20 w-20 rounded-lg border border-stroke-subtle"
                    />
                )}
                {message.card && (
                    <AgentCardRenderer
                        card={message.card}
                        onConfirm={onConfirm}
                        onCancel={onCancel}
                        onChangeUpdate={onChangeUpdate}
                        onApproveReport={onApproveReport}
                    />
                )}
                {isUser && message.inputMethod && message.inputMethod !== "text" && (
                    <div className="text-[10px] text-ink-tertiary flex items-center gap-1">
                        {message.inputMethod === "voice" ? (
                            <Mic className="h-3 w-3" />
                        ) : (
                            <Camera className="h-3 w-3" />
                        )}
                        {message.inputMethod}
                    </div>
                )}
            </div>
            {isUser && (
                <div className="h-7 w-7 rounded-full border border-stroke-subtle bg-canvas-raised flex items-center justify-center shrink-0 mt-0.5">
                    <User className="h-3.5 w-3.5 text-ink-secondary" />
                </div>
            )}
        </div>
    );
}

function AgentCardRenderer({
    card,
    onConfirm,
    onCancel,
    onChangeUpdate,
    onApproveReport,
}: {
    card: AgentCard;
    onConfirm: (card: ConfirmationCard) => void;
    onCancel: (card: ConfirmationCard) => void;
    onChangeUpdate: (card: ConfirmationCard, idx: number, patch: Partial<ConfirmationChange>) => void;
    onApproveReport: (card: ReportPreviewCard) => void;
}) {
    switch (card.kind) {
        case "text-answer":
            return <TextCard card={card} />;
        case "progress":
            return (
                <div className="inline-flex items-center gap-2 rounded-xl border border-stroke-subtle bg-canvas-raised px-3 py-2 text-sm text-ink-secondary">
                    <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
                    {card.label}
                </div>
            );
        case "confirmation":
            return (
                <ConfirmationCardView
                    card={card}
                    onConfirm={onConfirm}
                    onCancel={onCancel}
                    onChangeUpdate={onChangeUpdate}
                />
            );
        case "grid-preview":
            return <GridPreviewCardView card={card} />;
        case "report-preview":
            return <ReportPreviewCardView card={card} onApprove={onApproveReport} />;
    }
}

function TextCard({ card }: { card: TextAnswerCard }) {
    return (
        <div className="rounded-2xl bg-canvas-raised border border-stroke-subtle px-3.5 py-2 text-sm text-ink-primary">
            {card.text}
        </div>
    );
}

function ConfirmationCardView({
    card,
    onConfirm,
    onCancel,
    onChangeUpdate,
}: {
    card: ConfirmationCard;
    onConfirm: (card: ConfirmationCard) => void;
    onCancel: (card: ConfirmationCard) => void;
    onChangeUpdate: (card: ConfirmationCard, idx: number, patch: Partial<ConfirmationChange>) => void;
}) {
    const [editingIdx, setEditingIdx] = React.useState<number | null>(null);

    if (card.status === "confirmed") {
        return (
            <div className="rounded-2xl border border-[rgba(var(--status-success-rgb),0.3)] bg-[rgba(var(--status-success-rgb),0.12)] px-3.5 py-2 text-xs text-status-success flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>
                    {card.changes.length} update{card.changes.length === 1 ? "" : "s"} saved
                    {card.committedAt ? ` · ${new Date(card.committedAt).toLocaleTimeString()}` : ""}
                </span>
            </div>
        );
    }

    if (card.status === "cancelled") {
        return (
            <div className="rounded-2xl border border-stroke-subtle bg-canvas-raised px-3.5 py-2 text-xs text-ink-tertiary">
                Cancelled — no changes saved.
            </div>
        );
    }

    return (
        <div
            className="rounded-2xl border border-accent-border p-3.5 space-y-2.5 max-w-xl"
            style={{ background: "rgba(var(--mi-accent-rgb), 0.06)" }}
        >
            <div className="text-xs uppercase tracking-wider text-accent font-semibold flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" />
                {card.heading}
            </div>
            <ul className="space-y-1.5">
                {card.changes.map((change, i) => (
                    <li
                        key={i}
                        className="flex items-start gap-2 text-sm text-ink-primary bg-canvas-raised border border-stroke-subtle rounded-lg p-2"
                    >
                        <span className="h-5 w-5 rounded-md bg-canvas-muted flex items-center justify-center shrink-0 mt-0.5">
                            {change.kind === "observation" ? (
                                <Grid3x3 className="h-3 w-3 text-ink-tertiary" />
                            ) : change.kind === "attendance" ? (
                                <Check className="h-3 w-3 text-ink-tertiary" />
                            ) : (
                                <FileText className="h-3 w-3 text-ink-tertiary" />
                            )}
                        </span>
                        <div className="flex-1 min-w-0">
                            {editingIdx === i && change.kind === "observation" ? (
                                <InlineLevelEditor
                                    change={change}
                                    onSave={(patch) => {
                                        onChangeUpdate(card, i, patch);
                                        setEditingIdx(null);
                                    }}
                                    onCancel={() => setEditingIdx(null)}
                                />
                            ) : (
                                <div className="text-sm text-ink-primary">{change.summary}</div>
                            )}
                        </div>
                        {change.kind === "observation" && editingIdx !== i && (
                            <button
                                type="button"
                                onClick={() => setEditingIdx(i)}
                                className="text-[11px] text-ink-tertiary hover:text-ink-primary"
                            >
                                Edit
                            </button>
                        )}
                    </li>
                ))}
            </ul>
            <div className="flex gap-2 pt-1">
                <Button variant="accent" size="sm" onClick={() => onConfirm(card)}>
                    <Check className="h-3.5 w-3.5" /> Confirm
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onCancel(card)}>
                    <X className="h-3.5 w-3.5" /> Cancel
                </Button>
            </div>
        </div>
    );
}

function InlineLevelEditor({
    change,
    onSave,
    onCancel,
}: {
    change: ConfirmationChange;
    onSave: (patch: Partial<ConfirmationChange>) => void;
    onCancel: () => void;
}) {
    const payload = change.payload as { level: MasteryLevel; note?: string };
    const [level, setLevel] = React.useState<MasteryLevel>(payload.level);
    const [note, setNote] = React.useState<string>(payload.note ?? "");

    const apply = () => {
        const nextPayload = { ...payload, level, note };
        const summary = change.summary.replace(
            /→ .+/,
            `→ ${
                {
                    introduced: "Introduced",
                    practising: "Practising",
                    mastered: "Mastered",
                }[level]
            }`
        );
        onSave({ payload: nextPayload, summary });
    };

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
                {(["introduced", "practising", "mastered"] as MasteryLevel[]).map((lv) => (
                    <button
                        key={lv}
                        type="button"
                        onClick={() => setLevel(lv)}
                        className={cn(
                            "text-[11px] rounded-md border px-2 h-6",
                            level === lv
                                ? "bg-accent-bg border-accent-border text-accent"
                                : "border-stroke-subtle text-ink-tertiary"
                        )}
                    >
                        {lv[0]!.toUpperCase() + lv.slice(1)}
                    </button>
                ))}
            </div>
            <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note…"
                className="w-full h-7 text-xs rounded-md bg-canvas-raised border border-stroke-subtle px-2"
            />
            <div className="flex gap-1">
                <Button size="sm" variant="accent" onClick={apply}>
                    Save
                </Button>
                <Button size="sm" variant="ghost" onClick={onCancel}>
                    Cancel
                </Button>
            </div>
        </div>
    );
}

function GridPreviewCardView({ card }: { card: GridPreviewCard }) {
    const { classrooms, students, domains, topics, observations, setObservation } = useStore();
    const student = students.find((s) => s.id === card.studentId);
    const classroom = classrooms.find((c) => c.id === student?.classroomId);
    if (!student || !classroom) return null;
    return (
        <div className="rounded-xl border border-stroke-subtle bg-canvas-raised overflow-hidden w-full max-w-[640px]">
            <div className="px-3 py-2 border-b border-stroke-subtle flex items-center justify-between">
                <div className="text-xs uppercase tracking-wider text-ink-tertiary font-semibold">
                    Grid · {student.name}
                </div>
            </div>
            <div className="h-[180px]">
                <ClassroomGrid
                    classroom={classroom}
                    students={students}
                    domains={domains}
                    topics={topics}
                    observations={observations}
                    onSetObservation={setObservation}
                    filterStudentIds={[student.id]}
                    compact
                    hideToolbar
                    readonly
                />
            </div>
        </div>
    );
}

function ReportPreviewCardView({
    card,
    onApprove,
}: {
    card: ReportPreviewCard;
    onApprove: (card: ReportPreviewCard) => void;
}) {
    const { students, domains, classrooms } = useStore();
    const student = students.find((s) => s.id === card.draft.studentId);
    const classroom = classrooms.find((c) => c.id === card.draft.classroomId);

    const [sections, setSections] = React.useState(card.draft.sections);
    const [editingIdx, setEditingIdx] = React.useState<number | null>(null);

    if (!student || !classroom) return null;

    return (
        <div className="rounded-xl border border-stroke-subtle bg-canvas-raised overflow-hidden w-full max-w-[640px]">
            <div className="px-4 py-3 border-b border-stroke-subtle flex items-center justify-between">
                <div>
                    <div className="text-xs uppercase tracking-wider text-ink-tertiary font-semibold">
                        Draft report
                    </div>
                    <div className="text-sm text-ink-primary font-semibold">
                        {student.name} · End of term
                    </div>
                </div>
                {card.status === "approved" ? (
                    <div className="inline-flex items-center gap-1.5 text-xs text-status-success">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Added to reports as draft
                    </div>
                ) : (
                    <Button size="sm" variant="accent" onClick={() => onApprove(card)}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Approve as draft
                    </Button>
                )}
            </div>
            <div className="p-4 space-y-3 max-h-[360px] overflow-y-auto">
                <p className="text-sm text-ink-primary italic">{card.draft.summary}</p>
                {sections.map((sec, i) => {
                    const d = domains.find((dd) => dd.id === sec.domainId);
                    return (
                        <div key={sec.domainId} className="space-y-1">
                            <div className="flex items-center justify-between">
                                <div className="text-xs uppercase tracking-wider text-ink-tertiary font-semibold">
                                    {d?.name ?? "Domain"}
                                </div>
                                {card.status !== "approved" && (
                                    <button
                                        type="button"
                                        onClick={() => setEditingIdx(editingIdx === i ? null : i)}
                                        className="text-[11px] text-ink-tertiary hover:text-ink-primary flex items-center gap-1"
                                    >
                                        <Pencil className="h-3 w-3" /> Edit
                                    </button>
                                )}
                            </div>
                            {editingIdx === i ? (
                                <textarea
                                    value={sec.narrative}
                                    onChange={(e) => {
                                        const next = sections.map((x, j) =>
                                            j === i ? { ...x, narrative: e.target.value } : x
                                        );
                                        setSections(next);
                                    }}
                                    className="w-full min-h-[80px] rounded-md border border-stroke-subtle bg-canvas-base text-sm text-ink-primary p-2 focus:outline-none focus:ring-2 focus:ring-accent"
                                />
                            ) : (
                                <p className="text-sm text-ink-primary leading-relaxed">
                                    {sec.narrative}
                                </p>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
