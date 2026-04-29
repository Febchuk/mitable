"use client";

import * as React from "react";

import { AgentView } from "@/components/agent/AgentView";
import { useAuth } from "@/lib/auth/AuthContext";

export default function TeacherAgentPage() {
    const { me } = useAuth();
    // Pick the prompt set by the teacher's classroom level. Fall back to
    // primary when nothing is assigned yet.
    const effectiveRole =
        me?.assignedClassroom?.level === "elementary" ? "teacher-elementary" : "teacher-primary";
    return (
        <div className="h-full min-h-0">
            <AgentView role={effectiveRole} />
        </div>
    );
}
