import { supabase } from "./supabase";

const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");

export class ApiError extends Error {
    status: number;
    code?: string;

    constructor(status: number, message: string, code?: string) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

async function getAccessToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
}

/**
 * Authenticated request to the Mitable backend, scoped to the
 * /api/montessori/* surface.
 *
 * Path is concatenated as `${API_BASE_URL}/api${path}` — i.e. callers
 * pass paths like "/montessori/me", not "/api/montessori/me".
 *
 * On 401 we ask Supabase to refresh the session and retry once. If
 * the refresh fails the caller is responsible for sending the user
 * back to /login (typically by catching ApiError with status 401).
 */
export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
    const makeRequest = async (token: string | null): Promise<Response> => {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            ...((options.headers as Record<string, string> | undefined) ?? {}),
        };
        if (token) headers["Authorization"] = `Bearer ${token}`;
        return fetch(`${API_BASE_URL}/api${path}`, { ...options, headers });
    };

    let token = await getAccessToken();
    let response = await makeRequest(token);

    if (response.status === 401) {
        const { data, error } = await supabase.auth.refreshSession();
        if (error || !data.session) {
            await supabase.auth.signOut().catch(() => undefined);
            throw new ApiError(401, "Session expired. Please log in again.", "session_expired");
        }
        token = data.session.access_token;
        response = await makeRequest(token);
    }

    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const message =
            body.message ?? body.error ?? `HTTP ${response.status}: ${response.statusText}`;
        throw new ApiError(response.status, message, body.error);
    }

    if (response.status === 204) {
        return undefined as T;
    }

    return (await response.json()) as T;
}

/**
 * Same as apiRequest but for FormData / multipart bodies. Sets the
 * Authorization header but lets the browser set Content-Type with the
 * correct multipart boundary.
 */
export async function apiRequestForm<T>(path: string, body: FormData): Promise<T> {
    const makeRequest = async (token: string | null): Promise<Response> => {
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        return fetch(`${API_BASE_URL}/api${path}`, { method: "POST", headers, body });
    };

    let token = await getAccessToken();
    let response = await makeRequest(token);

    if (response.status === 401) {
        const { data, error } = await supabase.auth.refreshSession();
        if (error || !data.session) {
            await supabase.auth.signOut().catch(() => undefined);
            throw new ApiError(401, "Session expired. Please log in again.", "session_expired");
        }
        token = data.session.access_token;
        response = await makeRequest(token);
    }

    if (!response.ok) {
        const responseBody = await response.json().catch(() => ({}));
        const message =
            responseBody.message ??
            responseBody.error ??
            `HTTP ${response.status}: ${response.statusText}`;
        throw new ApiError(response.status, message, responseBody.error);
    }

    return (await response.json()) as T;
}
