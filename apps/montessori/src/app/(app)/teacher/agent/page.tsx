"use client";

import * as React from "react";

import { AgentView } from "@/components/agent/AgentView";
import { useStore } from "@/lib/store";

export default function TeacherAgentPage() {
    const { role } = useStore();
    // Fall back to teacher-primary if the user flipped from admin mode
    const effectiveRole =
        role === "teacher-elementary" ? "teacher-elementary" : "teacher-primary";
    return (
        <div className="h-full min-h-0">
            <AgentView role={effectiveRole} />
        </div>
    );
}
