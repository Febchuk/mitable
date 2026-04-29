"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, Loader2, Search } from "lucide-react";

import { useCurriculum } from "@/lib/query/montessoriQueries";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type { CurriculumLevel } from "@/types";

/**
 * Read-only curriculum view. Editing (add/remove domains and topics,
 * activate / deactivate) ships in a follow-up commit alongside the
 * matching POST/PATCH/DELETE endpoints. The agent (Phase 2) is the
 * other intended path for these edits.
 */
export default function CurriculumPage() {
    const curriculum = useCurriculum();
    const domains = curriculum.data?.domains ?? [];
    const topics = curriculum.data?.topics ?? [];

    const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
    React.useEffect(() => {
        if (curriculum.data) {
            setExpanded(new Set(curriculum.data.domains.map((d) => d.id)));
        }
    }, [curriculum.data]);

    const [levelFilter, setLevelFilter] = React.useState<"all" | CurriculumLevel>("all");
    const [search, setSearch] = React.useState("");

    const filteredDomains = domains.filter(
        (d) => levelFilter === "all" || d.level === levelFilter
    );

    const toggleExpand = (id: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    if (curriculum.isLoading || !curriculum.data) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="h-5 w-5 text-ink-tertiary animate-spin" />
            </div>
        );
    }

    return (
        <div className="p-6 space-y-4 max-w-5xl">
            <header>
                <h1 className="text-2xl font-semibold text-ink-primary">Curriculum</h1>
                <p className="text-sm text-ink-secondary">
                    Domains and topics used across the school. Editing ships in a follow-up
                    alongside the agent rebuild.
                </p>
            </header>

            <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                    <Search className="h-3.5 w-3.5 text-ink-tertiary absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search topics…"
                        className="pl-7 h-8 w-64 text-xs"
                    />
                </div>
                <Select
                    value={levelFilter}
                    onValueChange={(v) => setLevelFilter(v as "all" | CurriculumLevel)}
                >
                    <SelectTrigger className="h-8 w-40 text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All levels</SelectItem>
                        <SelectItem value="primary">Primary</SelectItem>
                        <SelectItem value="elementary">Elementary</SelectItem>
                        <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="border border-stroke-subtle rounded-xl bg-canvas-raised overflow-hidden">
                {filteredDomains.map((d, idx) => {
                    const isOpen = expanded.has(d.id);
                    const domainTopics = topics
                        .filter((t) => t.domainId === d.id)
                        .filter(
                            (t) =>
                                !search || t.name.toLowerCase().includes(search.toLowerCase())
                        );
                    return (
                        <div key={d.id} className={cn(idx > 0 && "border-t border-stroke-subtle")}>
                            <div className="flex items-center gap-2 px-4 py-3">
                                <button
                                    type="button"
                                    onClick={() => toggleExpand(d.id)}
                                    className="h-6 w-6 rounded-md hover:bg-canvas-overlay flex items-center justify-center text-ink-tertiary"
                                >
                                    {isOpen ? (
                                        <ChevronDown className="h-3.5 w-3.5" />
                                    ) : (
                                        <ChevronRight className="h-3.5 w-3.5" />
                                    )}
                                </button>
                                <span className="text-sm font-medium text-ink-primary flex-1">
                                    {d.name}
                                </span>
                                <Badge variant="accent">
                                    {d.level === "primary"
                                        ? "Primary"
                                        : d.level === "elementary"
                                          ? "Elementary"
                                          : "Both"}
                                </Badge>
                                <span className="text-xs text-ink-tertiary">
                                    {d.topicIds.length} topics
                                </span>
                                {!d.active && <Badge variant="outline">Inactive</Badge>}
                            </div>
                            {isOpen && (
                                <div className="pl-10 pr-4 pb-3 border-t border-stroke-subtle/50 bg-canvas-base/40">
                                    {domainTopics.map((t) => (
                                        <div
                                            key={t.id}
                                            className="flex items-center gap-2 py-2 border-b border-stroke-subtle/50 last:border-b-0"
                                        >
                                            <span className="text-sm text-ink-primary flex-1">
                                                {t.name}
                                            </span>
                                            <Badge variant="outline">
                                                {t.level === "primary" ? "Primary" : "Elementary"}
                                            </Badge>
                                            {!t.active && <Badge variant="outline">Inactive</Badge>}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
