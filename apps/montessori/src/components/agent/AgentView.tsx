"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";

import type { Role } from "@/types";

/**
 * The agent UI is being rebuilt against real LLM calls + the
 * ProposedUpdates draft-and-confirm flow in Phase 2. Until those
 * commits land we render a placeholder so the route is reachable but
 * doesn't pretend to do anything.
 *
 * See `agent-two-layer-architecture.mdc` for the new design.
 */

export interface AgentViewProps {
    role: Role;
}

export function AgentView({ role: _role }: AgentViewProps) {
    return (
        <div className="h-full flex items-center justify-center px-6">
            <div className="max-w-md text-center space-y-3">
                <div className="mx-auto h-10 w-10 rounded-xl border border-accent-border bg-accent-bg flex items-center justify-center">
                    <Sparkles className="h-5 w-5 text-accent" />
                </div>
                <h1 className="text-lg font-semibold text-ink-primary">Agent coming online</h1>
                <p className="text-sm text-ink-secondary">
                    The voice / photo / text capture flow is being rebuilt against real LLM calls.
                    Cell edits, attendance and report status changes you make from the rest of the
                    app already persist to the database.
                </p>
                <p className="text-xs text-ink-tertiary">
                    For child privacy, photos and audio will be captured in the app and stay in
                    your school workspace.
                </p>
            </div>
        </div>
    );
}
