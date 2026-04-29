"use client";

import * as React from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/lib/api/supabase";
import { apiRequest, ApiError } from "@/lib/api/client";

/**
 * Shape of GET /api/montessori/me. Kept local — Montessori types do not
 * cross app boundaries (per project rule).
 */
export interface MontessoriUser {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: "admin" | "teacher";
}

export interface MontessoriOrganization {
    id: string;
    name: string;
}

export interface MontessoriClassroomRef {
    id: string;
    name: string;
    level: "primary" | "elementary" | "both";
}

export interface MontessoriMe {
    user: MontessoriUser;
    organization: MontessoriOrganization | null;
    assignedClassroom: MontessoriClassroomRef | null;
}

type AuthStatus = "loading" | "signed-out" | "signed-in" | "error";

interface AuthContextValue {
    status: AuthStatus;
    session: Session | null;
    me: MontessoriMe | null;
    error: string | null;
    signIn: (email: string, password: string) => Promise<MontessoriMe>;
    signOut: () => Promise<void>;
    refreshMe: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

async function fetchMe(): Promise<MontessoriMe> {
    return apiRequest<MontessoriMe>("/montessori/me");
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [status, setStatus] = React.useState<AuthStatus>("loading");
    const [session, setSession] = React.useState<Session | null>(null);
    const [me, setMe] = React.useState<MontessoriMe | null>(null);
    const [error, setError] = React.useState<string | null>(null);

    const loadMeForSession = React.useCallback(async (nextSession: Session | null) => {
        if (!nextSession) {
            setMe(null);
            setSession(null);
            setStatus("signed-out");
            return;
        }
        setSession(nextSession);
        try {
            const profile = await fetchMe();
            setMe(profile);
            setStatus("signed-in");
            setError(null);
        } catch (err) {
            // 401 here means the session is technically valid with Supabase
            // but the user isn't recognized by the backend — treat as
            // signed-out so the gate kicks them to /login. Anything else
            // is a real error we surface to the user.
            if (err instanceof ApiError && err.status === 401) {
                await supabase.auth.signOut().catch(() => undefined);
                setMe(null);
                setSession(null);
                setStatus("signed-out");
                return;
            }
            setError(err instanceof Error ? err.message : "Could not load your profile.");
            setStatus("error");
        }
    }, []);

    React.useEffect(() => {
        let cancelled = false;
        supabase.auth.getSession().then(({ data }) => {
            if (cancelled) return;
            void loadMeForSession(data.session);
        });

        const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
            if (cancelled) return;
            void loadMeForSession(nextSession);
        });

        return () => {
            cancelled = true;
            subscription.subscription.unsubscribe();
        };
    }, [loadMeForSession]);

    const signIn = React.useCallback(
        async (email: string, password: string): Promise<MontessoriMe> => {
            const { data, error: signInError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });
            if (signInError || !data.session) {
                throw new Error(signInError?.message ?? "Sign in failed");
            }
            const profile = await fetchMe();
            setSession(data.session);
            setMe(profile);
            setStatus("signed-in");
            setError(null);
            return profile;
        },
        []
    );

    const signOut = React.useCallback(async () => {
        await supabase.auth.signOut();
        setSession(null);
        setMe(null);
        setStatus("signed-out");
    }, []);

    const refreshMe = React.useCallback(async () => {
        if (!session) return;
        const profile = await fetchMe();
        setMe(profile);
    }, [session]);

    const value: AuthContextValue = React.useMemo(
        () => ({ status, session, me, error, signIn, signOut, refreshMe }),
        [status, session, me, error, signIn, signOut, refreshMe]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
    const ctx = React.useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
    return ctx;
}
