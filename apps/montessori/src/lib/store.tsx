"use client";

import * as React from "react";

import type { Role, School } from "@/types";
import { useAuth, type MontessoriMe } from "@/lib/auth/AuthContext";

/**
 * StoreProvider used to be the home of every entity (mock-data driven)
 * and every mutation in the prototype. Now that reads come from React
 * Query against the real DB and writes go through dedicated mutation
 * hooks, the only remaining responsibilities here are surfacing
 * auth-derived role / school for the few shell components that still
 * read them, plus a per-mount sessionId for client-side logging.
 */

function roleFromMe(me: MontessoriMe | null): Role {
    if (!me) return "teacher-primary";
    if (me.user.role === "admin") return "admin";
    if (me.assignedClassroom?.level === "elementary") return "teacher-elementary";
    return "teacher-primary";
}

function schoolFromMe(me: MontessoriMe | null): School {
    if (me?.organization) return { id: me.organization.id, name: me.organization.name };
    return { id: "unknown", name: "School" };
}

interface StoreContextValue {
    sessionId: string;
    role: Role;
    school: School;
}

const StoreContext = React.createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
    const [sessionId] = React.useState(() => `sess_${Date.now()}`);
    const { me } = useAuth();
    const role = roleFromMe(me);
    const school = schoolFromMe(me);

    const value = React.useMemo(
        () => ({ sessionId, role, school }),
        [sessionId, role, school]
    );

    return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
    const ctx = React.useContext(StoreContext);
    if (!ctx) throw new Error("useStore must be used within StoreProvider");
    return ctx;
}
