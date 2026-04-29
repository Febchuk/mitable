"use client";

import * as React from "react";
import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type {
    Classroom,
    Domain,
    InputMethod,
    MasteryLevel,
    Observation,
    Student,
    Topic,
} from "@/types";
import { MASTERY_VISUALS, visualFor } from "@/components/grid/cell-visuals";

interface CellKey {
    studentId: string;
    topicId: string;
}

const keyOf = (k: CellKey) => `${k.studentId}|${k.topicId}`;

function latestLevelFor(
    observations: Observation[],
    studentId: string,
    topicId: string
): MasteryLevel | null {
    const match = observations.find((o) => o.studentId === studentId && o.topicId === topicId);
    return match?.level ?? null;
}

export interface SetObservationArgs {
    studentId: string;
    topicId: string;
    level: MasteryLevel;
    note?: string;
    inputMethod?: InputMethod;
    authorType?: "teacher" | "agent";
}

export interface ClassroomGridProps {
    classroom: Classroom;
    /**
     * The full data the grid renders. Callers pre-filter at the data
     * layer (e.g. via useGrid()) and pass the level-relevant subset.
     */
    students: Student[];
    domains: Domain[];
    topics: Topic[];
    observations: Observation[];
    /**
     * Persists a cell update. The grid never mutates state directly —
     * callers wire this to their store / mutation of choice.
     */
    onSetObservation: (args: SetObservationArgs) => void;

    compact?: boolean; // smaller cells, no toolbar, readonly
    readonly?: boolean;
    filterStudentIds?: string[] | null;
    hideToolbar?: boolean;
    onRequestUpdate?: (cells: CellKey[]) => void; // optional override (not used in prototype)
    title?: React.ReactNode;
}

export function ClassroomGrid({
    classroom,
    students,
    domains,
    topics,
    observations,
    onSetObservation,
    compact = false,
    readonly = false,
    filterStudentIds = null,
    hideToolbar = false,
    title,
}: ClassroomGridProps) {

    // ── Filters / controls ──────────────────────────────────────
    const [studentFilter, setStudentFilter] = React.useState<string>("all");
    const [domainFilter, setDomainFilter] = React.useState<string>("all");
    const [search, setSearch] = React.useState("");

    const visibleStudents: Student[] = React.useMemo(() => {
        const base = students.filter((s) => s.classroomId === classroom.id);
        if (filterStudentIds) return base.filter((s) => filterStudentIds.includes(s.id));
        if (studentFilter !== "all") return base.filter((s) => s.id === studentFilter);
        return base;
    }, [students, classroom.id, filterStudentIds, studentFilter]);

    const classroomDomains: Domain[] = React.useMemo(
        () =>
            domains.filter(
                (d) =>
                    d.active &&
                    (d.level === classroom.level || d.level === "both") &&
                    (domainFilter === "all" || d.id === domainFilter)
            ),
        [domains, classroom.level, domainFilter]
    );

    const topicsByDomain: Array<{ domain: Domain; topics: Topic[] }> = React.useMemo(() => {
        const matchedSearch = (t: Topic) =>
            !search || t.name.toLowerCase().includes(search.toLowerCase());
        return classroomDomains
            .map((d) => ({
                domain: d,
                topics: topics.filter((t) => t.domainId === d.id && t.active && matchedSearch(t)),
            }))
            .filter((g) => g.topics.length > 0);
    }, [classroomDomains, topics, search]);

    // ── Drag-select state ───────────────────────────────────────
    const [selection, setSelection] = React.useState<Set<string>>(new Set());
    const [isDragging, setIsDragging] = React.useState(false);
    const [popoverAnchor, setPopoverAnchor] = React.useState<{ x: number; y: number } | null>(null);
    const [popoverNote, setPopoverNote] = React.useState("");
    const gridRef = React.useRef<HTMLDivElement>(null);

    const selectedCells: CellKey[] = React.useMemo(
        () =>
            Array.from(selection).map((s) => {
                const [studentId, topicId] = s.split("|");
                return { studentId: studentId!, topicId: topicId! };
            }),
        [selection]
    );

    React.useEffect(() => {
        if (!isDragging) return;
        const up = () => setIsDragging(false);
        window.addEventListener("pointerup", up);
        return () => window.removeEventListener("pointerup", up);
    }, [isDragging]);

    const beginDrag = (cell: CellKey, e: React.PointerEvent) => {
        if (readonly) return;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setSelection(new Set([keyOf(cell)]));
        setIsDragging(true);
        setPopoverAnchor({ x: rect.right, y: rect.bottom });
    };

    const extendDrag = (cell: CellKey, e: React.PointerEvent) => {
        if (!isDragging || readonly) return;
        setSelection((prev) => {
            if (prev.has(keyOf(cell))) return prev;
            const next = new Set(prev);
            next.add(keyOf(cell));
            return next;
        });
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setPopoverAnchor({ x: rect.right, y: rect.bottom });
    };

    const closePopover = () => {
        setSelection(new Set());
        setPopoverAnchor(null);
        setPopoverNote("");
    };

    const applyLevel = (level: MasteryLevel) => {
        for (const cell of selectedCells) {
            onSetObservation({
                studentId: cell.studentId,
                topicId: cell.topicId,
                level,
                note: selectedCells.length === 1 && popoverNote ? popoverNote : undefined,
                inputMethod: "grid",
                authorType: "teacher",
            });
        }
        closePopover();
    };

    // ── Sizing ──────────────────────────────────────────────────
    const CELL = compact ? 30 : 38;
    const TOPIC_COL = compact ? 170 : 240;
    const STUDENT_COL = compact ? 56 : 72;
    const STUDENT_HEADER_H = compact ? 56 : 72;
    const DOMAIN_ROW_H = compact ? 26 : 32;

    // Rebuild column template: first = topic-label column, then one per student
    const colTemplate = `${TOPIC_COL}px repeat(${visibleStudents.length}, ${STUDENT_COL}px)`;

    // Build row assignments
    // Row 1: student headers
    // Then for each domain group: 1 domain header row + N topic rows
    type RowEntry =
        | { kind: "domain"; domain: Domain; row: number }
        | { kind: "topic"; domain: Domain; topic: Topic; row: number };
    const rowLayout: RowEntry[] = [];
    let nextRow = 2; // row 1 is the student header row
    for (const g of topicsByDomain) {
        rowLayout.push({ kind: "domain", domain: g.domain, row: nextRow });
        nextRow++;
        for (const t of g.topics) {
            rowLayout.push({ kind: "topic", domain: g.domain, topic: t, row: nextRow });
            nextRow++;
        }
    }

    // Build row template so sticky positioning has predictable heights.
    // Row 1 = student header, domain rows = DOMAIN_ROW_H, topic rows = CELL
    const rowTemplate =
        `${STUDENT_HEADER_H}px ` +
        rowLayout
            .map((r) => (r.kind === "domain" ? `${DOMAIN_ROW_H}px` : `${CELL}px`))
            .join(" ");

    const toolbar = !hideToolbar && !compact && !readonly && (
        <div className="flex items-center gap-2 flex-wrap px-4 py-3 border-b border-stroke-subtle shrink-0 bg-canvas-base">
            <div className="relative">
                <Search className="h-3.5 w-3.5 text-ink-tertiary absolute left-2.5 top-1/2 -translate-y-1/2" />
                <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search topics…"
                    className="pl-7 h-8 w-56 text-xs"
                />
            </div>
            <Select value={studentFilter} onValueChange={setStudentFilter}>
                <SelectTrigger className="h-8 text-xs w-44">
                    <SelectValue placeholder="All students" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All students</SelectItem>
                    {students
                        .filter((s) => s.classroomId === classroom.id)
                        .map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                                {s.name}
                            </SelectItem>
                        ))}
                </SelectContent>
            </Select>
            <Select value={domainFilter} onValueChange={setDomainFilter}>
                <SelectTrigger className="h-8 text-xs w-44">
                    <SelectValue placeholder="All domains" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All domains</SelectItem>
                    {domains
                        .filter((d) => d.level === classroom.level || d.level === "both")
                        .map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                                {d.name}
                            </SelectItem>
                        ))}
                </SelectContent>
            </Select>
        </div>
    );

    return (
        <div className="mt-grid flex flex-col h-full min-h-0 bg-canvas-base">
            {title && <div className="px-4 pt-3">{title}</div>}
            {toolbar}

            <div ref={gridRef} className="flex-1 min-h-0 overflow-auto">
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: colTemplate,
                        gridTemplateRows: rowTemplate,
                    }}
                >
                    {/* ── Row 1: Student header row ─────────────────── */}
                    {/* Corner cell (sticky top-left) */}
                    <div
                        className="sticky top-0 left-0 z-40 border-r border-b border-stroke-subtle flex items-end px-3 pb-2"
                        style={{
                            gridColumn: 1,
                            gridRow: 1,
                            background: "var(--bg-raised)",
                        }}
                    >
                        <span className="text-[10px] uppercase tracking-wider text-ink-tertiary font-semibold">
                            Curriculum · {rowLayout.filter((r) => r.kind === "topic").length} topics
                        </span>
                    </div>
                    {visibleStudents.map((s, si) => (
                        <div
                            key={s.id + "-sh"}
                            className="sticky top-0 z-30 border-r border-b border-stroke-subtle flex flex-col items-center justify-end gap-1.5 pb-2 pt-2"
                            style={{
                                gridColumn: si + 2,
                                gridRow: 1,
                                background: "var(--bg-raised)",
                            }}
                            title={s.name}
                        >
                            <span className="h-7 w-7 rounded-full bg-canvas-overlay border border-stroke-subtle flex items-center justify-center text-[10px] font-semibold text-ink-secondary">
                                {s.name.slice(0, 2).toUpperCase()}
                            </span>
                            <span className="text-[10px] text-ink-primary font-medium truncate max-w-full px-1">
                                {s.name.split(" ")[0]}
                            </span>
                        </div>
                    ))}

                    {/* ── Row layout: domain headers + topic rows ───── */}
                    {rowLayout.map((entry) => {
                        if (entry.kind === "domain") {
                            const d = entry.domain;
                            return (
                                <React.Fragment key={"dh-" + d.id}>
                                    {/* Label in topic col — sticky left */}
                                    <div
                                        className="sticky left-0 z-20 border-r border-b border-stroke-subtle flex items-center px-3 text-[10px] uppercase tracking-wider font-semibold truncate text-ink-secondary"
                                        style={{
                                            gridColumn: 1,
                                            gridRow: entry.row,
                                            background: "var(--bg-muted)",
                                        }}
                                        title={d.name}
                                    >
                                        {d.name}
                                    </div>
                                    {/* Neutral strip spanning student cols */}
                                    <div
                                        className="border-b border-stroke-subtle"
                                        style={{
                                            gridColumn: `2 / span ${visibleStudents.length}`,
                                            gridRow: entry.row,
                                            background: "var(--bg-muted)",
                                        }}
                                    />
                                </React.Fragment>
                            );
                        }

                        const topic = entry.topic;
                        return (
                            <React.Fragment key={"tr-" + topic.id}>
                                {/* Topic name cell — sticky left, indented to show nesting under domain */}
                                <div
                                    className="sticky left-0 z-10 border-r border-b border-stroke-subtle flex items-center text-xs"
                                    style={{
                                        gridColumn: 1,
                                        gridRow: entry.row,
                                        background: "var(--bg-raised)",
                                        paddingLeft: compact ? 22 : 28,
                                        paddingRight: 8,
                                    }}
                                    title={topic.name}
                                >
                                    <span className="truncate text-ink-primary">{topic.name}</span>
                                </div>
                                {visibleStudents.map((student, si) => {
                                    const cell: CellKey = {
                                        studentId: student.id,
                                        topicId: topic.id,
                                    };
                                    const level = latestLevelFor(
                                        observations,
                                        cell.studentId,
                                        cell.topicId
                                    );
                                    const selected = selection.has(keyOf(cell));
                                    const visuals = visualFor(level);
                                    return (
                                        <button
                                            key={topic.id + student.id}
                                            type="button"
                                            onPointerDown={(e) => beginDrag(cell, e)}
                                            onPointerEnter={(e) => extendDrag(cell, e)}
                                            className={cn(
                                                "relative border-r border-b border-stroke-subtle flex items-center justify-center text-sm font-semibold transition-colors focus:outline-none",
                                                selected && "ring-2 ring-accent ring-inset z-10"
                                            )}
                                            style={{
                                                gridColumn: si + 2,
                                                gridRow: entry.row,
                                                background: visuals.bg,
                                                color: visuals.color,
                                            }}
                                            aria-label={`${student.name} — ${topic.name} — ${visuals.label}`}
                                        >
                                            <span className="pointer-events-none">
                                                {visuals.symbol}
                                            </span>
                                        </button>
                                    );
                                })}
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>

            {/* Popover */}
            {popoverAnchor && selection.size > 0 && !isDragging && (
                <CellPopover
                    anchor={popoverAnchor}
                    cells={selectedCells}
                    students={students}
                    topics={topics}
                    observations={observations}
                    note={popoverNote}
                    onNoteChange={setPopoverNote}
                    onApply={applyLevel}
                    onClose={closePopover}
                />
            )}
        </div>
    );
}

interface CellPopoverProps {
    anchor: { x: number; y: number };
    cells: CellKey[];
    students: Student[];
    topics: Topic[];
    observations: Observation[];
    note: string;
    onNoteChange: (s: string) => void;
    onApply: (level: MasteryLevel) => void;
    onClose: () => void;
}

function CellPopover({
    anchor,
    cells,
    students,
    topics,
    observations,
    note,
    onNoteChange,
    onApply,
    onClose,
}: CellPopoverProps) {
    const ref = React.useRef<HTMLDivElement>(null);

    const single = cells.length === 1 ? cells[0]! : null;
    const student = single ? students.find((s) => s.id === single.studentId) : null;
    const topic = single ? topics.find((t) => t.id === single.topicId) : null;
    const existingNote = single
        ? observations.find((o) => o.studentId === single.studentId && o.topicId === single.topicId)
              ?.note
        : null;

    // Close on click outside / Escape
    React.useEffect(() => {
        const handleDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        const t = window.setTimeout(() => {
            document.addEventListener("mousedown", handleDown);
            document.addEventListener("keydown", handleKey);
        }, 0);
        return () => {
            window.clearTimeout(t);
            document.removeEventListener("mousedown", handleDown);
            document.removeEventListener("keydown", handleKey);
        };
    }, [onClose]);

    // Position — prefer below/right of cursor, clamp to viewport
    const [pos, setPos] = React.useState<{ left: number; top: number }>({
        left: anchor.x + 8,
        top: anchor.y + 8,
    });
    React.useLayoutEffect(() => {
        if (!ref.current) return;
        const w = ref.current.offsetWidth;
        const h = ref.current.offsetHeight;
        const padding = 12;
        let left = anchor.x + 8;
        let top = anchor.y + 8;
        if (left + w > window.innerWidth - padding) left = window.innerWidth - w - padding;
        if (top + h > window.innerHeight - padding) top = anchor.y - h - 8;
        if (left < padding) left = padding;
        if (top < padding) top = padding;
        setPos({ left, top });
    }, [anchor]);

    const levels: Array<{ id: MasteryLevel; label: string }> = [
        { id: "introduced", label: "Introduced" },
        { id: "practising", label: "Practising" },
        { id: "mastered", label: "Mastered" },
    ];

    return (
        <div
            ref={ref}
            className="fixed z-50 w-[320px] rounded-xl border border-stroke-subtle bg-canvas-overlay shadow-2xl p-4 animate-in fade-in-0 zoom-in-95"
            style={{ left: pos.left, top: pos.top }}
        >
            <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                    {single && student && topic ? (
                        <>
                            <div className="text-sm font-semibold text-ink-primary truncate">
                                {student.name}
                            </div>
                            <div className="text-xs text-ink-tertiary truncate">{topic.name}</div>
                        </>
                    ) : (
                        <>
                            <div className="text-sm font-semibold text-ink-primary">
                                {cells.length} cells selected
                            </div>
                            <div className="text-xs text-ink-tertiary">
                                Choose a mastery level to apply to all
                            </div>
                        </>
                    )}
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="h-6 w-6 rounded-md hover:bg-canvas-muted flex items-center justify-center text-ink-tertiary hover:text-ink-primary"
                    aria-label="Close"
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>

            <div className="grid grid-cols-3 gap-1.5 mb-3">
                {levels.map((lv) => {
                    const v = MASTERY_VISUALS[lv.id];
                    return (
                        <button
                            key={lv.id}
                            type="button"
                            onClick={() => onApply(lv.id)}
                            className="h-10 rounded-md border text-xs font-medium flex items-center justify-center gap-1.5 px-2 hover:brightness-110 transition"
                            style={{
                                background: v.bg,
                                color: v.color,
                                borderColor: v.borderColor,
                            }}
                        >
                            <span className="text-sm font-semibold leading-none">{v.symbol}</span>
                            <span className="truncate">{lv.label}</span>
                        </button>
                    );
                })}
            </div>

            {single && (
                <>
                    <input
                        value={note}
                        onChange={(e) => onNoteChange(e.target.value)}
                        placeholder="Add a note (optional)"
                        className="w-full h-8 text-xs rounded-md bg-canvas-raised border border-stroke-subtle px-2.5 focus:outline-none focus:ring-2 focus:ring-accent placeholder:text-ink-tertiary"
                    />
                    {existingNote && (
                        <div className="mt-2 text-[11px] text-ink-tertiary bg-canvas-raised border border-stroke-subtle rounded-md p-2">
                            <span className="uppercase tracking-wider font-semibold text-ink-tertiary text-[10px] block mb-1">
                                Last note
                            </span>
                            {existingNote}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
