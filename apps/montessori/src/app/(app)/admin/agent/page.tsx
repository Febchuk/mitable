"use client";

import { AgentView } from "@/components/agent/AgentView";

export default function AdminAgentPage() {
    return (
        <div className="h-full min-h-0">
            <AgentView role="admin" />
        </div>
    );
}
