"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, Plus, Search, Trash2 } from "lucide-react";

import { useStore } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type { CurriculumLevel } from "@/types";

export default function CurriculumPage() {
    const {
        domains,
        topics,
        toggleDomainActive,
        toggleTopicActive,
        addDomain,
        removeDomain,
        addTopic,
        removeTopic,
    } = useStore();

    const [expanded, setExpanded] = React.useState<Set<string>>(new Set(domains.map((d) => d.id)));
    const [levelFilter, setLevelFilter] = React.useState<"all" | CurriculumLevel>("all");
    const [search, setSearch] = React.useState("");
    const [showAddDomain, setShowAddDomain] = React.useState(false);
    const [newDomain, setNewDomain] = React.useState<{ name: string; level: CurriculumLevel }>({
        name: "",
        level: "primary",
    });
    const [newTopicForDomain, setNewTopicForDomain] = React.useState<string | null>(null);
    const [newTopicName, setNewTopicName] = React.useState("");

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

    const addDomainSubmit = () => {
        if (!newDomain.name.trim()) return;
        addDomain({ name: newDomain.name.trim(), level: newDomain.level, colorHue: 200, active: true });
        setNewDomain({ name: "", level: "primary" });
        setShowAddDomain(false);
    };

    const addTopicSubmit = (domainId: string) => {
        if (!newTopicName.trim()) return;
        const domain = domains.find((d) => d.id === domainId);
        if (!domain) return;
        addTopic({
            name: newTopicName.trim(),
            domainId,
            level: domain.level,
            active: true,
        });
        setNewTopicName("");
        setNewTopicForDomain(null);
    };

    return (
        <div className="p-6 space-y-4 max-w-5xl">
            <header className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl font-semibold text-ink-primary">Curriculum</h1>
                    <p className="text-sm text-ink-secondary">
                        Domains and topics used across the school. Everything here can also be done
                        through the admin agent.
                    </p>
                </div>
                <Button variant="accent" onClick={() => setShowAddDomain((v) => !v)}>
                    <Plus className="h-3.5 w-3.5" /> Add domain
                </Button>
            </header>

            {showAddDomain && (
                <div className="rounded-xl border border-stroke-subtle bg-canvas-raised p-4 flex items-end gap-3 flex-wrap">
                    <div className="flex-1 min-w-[160px] space-y-1.5">
                        <div className="text-xs uppercase tracking-wider text-ink-tertiary font-semibold">
                            Domain name
                        </div>
                        <Input
                            value={newDomain.name}
                            placeholder="Social-Emotional Development"
                            onChange={(e) => setNewDomain({ ...newDomain, name: e.target.value })}
                        />
                    </div>
                    <div className="w-40 space-y-1.5">
                        <div className="text-xs uppercase tracking-wider text-ink-tertiary font-semibold">
                            Level
                        </div>
                        <Select
                            value={newDomain.level}
                            onValueChange={(v) =>
                                setNewDomain({ ...newDomain, level: v as CurriculumLevel })
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
                    <Button variant="accent" onClick={addDomainSubmit}>
                        Add
                    </Button>
                    <Button variant="ghost" onClick={() => setShowAddDomain(false)}>
                        Cancel
                    </Button>
                </div>
            )}

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
                        <div
                            key={d.id}
                            className={cn(idx > 0 && "border-t border-stroke-subtle")}
                        >
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
                                <Switch
                                    checked={d.active}
                                    onCheckedChange={() => toggleDomainActive(d.id)}
                                />
                                <button
                                    type="button"
                                    onClick={() => removeDomain(d.id)}
                                    className="h-7 w-7 rounded-md hover:bg-canvas-overlay flex items-center justify-center text-ink-tertiary hover:text-status-error"
                                    aria-label="Delete domain"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
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
                                            <Switch
                                                checked={t.active}
                                                onCheckedChange={() => toggleTopicActive(t.id)}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => removeTopic(t.id)}
                                                className="h-7 w-7 rounded-md hover:bg-canvas-overlay flex items-center justify-center text-ink-tertiary hover:text-status-error"
                                                aria-label="Delete topic"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                    {newTopicForDomain === d.id ? (
                                        <div className="flex items-center gap-2 py-2">
                                            <Input
                                                autoFocus
                                                value={newTopicName}
                                                onChange={(e) => setNewTopicName(e.target.value)}
                                                placeholder="New topic name"
                                                className="h-8 text-xs"
                                            />
                                            <Button
                                                size="sm"
                                                variant="accent"
                                                onClick={() => addTopicSubmit(d.id)}
                                            >
                                                Add
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => {
                                                    setNewTopicForDomain(null);
                                                    setNewTopicName("");
                                                }}
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="py-2">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => setNewTopicForDomain(d.id)}
                                            >
                                                <Plus className="h-3.5 w-3.5" /> Add topic
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
