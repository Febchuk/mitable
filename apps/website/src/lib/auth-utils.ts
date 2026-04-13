/** Validate redirect param to prevent open redirect attacks. */
export function getSafeRedirect(redirect: string | null): string {
    if (!redirect) return "/billing";
    if (redirect.startsWith("/") && !redirect.startsWith("//")) return redirect;
    return "/billing";
}
