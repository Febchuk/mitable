import { z } from "zod";

/**
 * ChildResolutionService — turns a teacher's free-form student
 * reference ("Amara", "the new boy", "amra okfor") into a definite
 * studentId, an explicit ambiguity, or an honest unresolved result.
 *
 * Strategy:
 *   1. Deterministic rules first. Exact full-name, exact first-name,
 *      exact last-name, no-space concatenation, and unique fuzzy
 *      substring all hit the cache without an LLM call. This keeps
 *      the common case (a teacher typed an exact name) free.
 *   2. Gemini fallback for the rest — nicknames, OCR misspellings,
 *      "the kid in the blue shirt" — using the classroom roster as
 *      the universe of valid answers. The LLM is constrained to
 *      return a name from the roster, "ambiguous", or "unresolved";
 *      we never let it invent.
 *
 * Tests inject a stubbed RosterMatchClient so the deterministic
 * rules can be exercised without network. The Gemini-backed client
 * lives next door in `gemini-roster-match.client.ts`.
 */

// ─── Public types ────────────────────────────────────────────────────

export interface RosterStudent {
    id: string;
    name: string;
}

export type ResolveStudentResult =
    | {
          kind: "resolved";
          student: RosterStudent;
          via: "exact-full" | "exact-first" | "exact-last" | "no-space" | "substring" | "llm";
      }
    | { kind: "ambiguous"; candidates: RosterStudent[]; reason: string }
    | { kind: "unresolved"; reason: string };

export interface RosterMatchClient {
    /**
     * Asks the LLM to pick a roster name. The LLM MUST return either
     * a name string that appears in `rosterNames` exactly, an
     * `ambiguous` array (subset of `rosterNames`), or an `unresolved`
     * string explaining why no match is possible.
     */
    match(args: {
        candidate: string;
        rosterNames: string[];
        /** Optional context line for nicknames / aliases. */
        context?: string;
    }): Promise<RosterMatchResponse>;
}

export const RosterMatchResponseSchema = z.union([
    z.object({ matched: z.string() }),
    z.object({ ambiguous: z.array(z.string()).min(2) }),
    z.object({ unresolved: z.string() }),
]);
export type RosterMatchResponse = z.infer<typeof RosterMatchResponseSchema>;

// ─── Helpers ─────────────────────────────────────────────────────────

function normalize(s: string): string {
    return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function noSpaces(s: string): string {
    return normalize(s).replace(/\s+/g, "");
}

function firstNameOf(name: string): string {
    return normalize(name).split(" ")[0] ?? "";
}

function lastNameOf(name: string): string {
    const parts = normalize(name).split(" ");
    return parts.length > 1 ? parts[parts.length - 1]! : "";
}

// ─── Deterministic stage ────────────────────────────────────────────

type DeterministicVia = "exact-full" | "exact-first" | "exact-last" | "no-space" | "substring";

interface DeterministicHit {
    student: RosterStudent;
    via: DeterministicVia;
}

function tryDeterministic(
    candidate: string,
    roster: RosterStudent[]
): DeterministicHit | { kind: "ambiguous"; candidates: RosterStudent[] } | null {
    const candNorm = normalize(candidate);
    if (!candNorm) return null;

    // 1. Exact full-name match (case-insensitive).
    const fullMatches = roster.filter((s) => normalize(s.name) === candNorm);
    if (fullMatches.length === 1) {
        return { student: fullMatches[0]!, via: "exact-full" };
    }
    if (fullMatches.length > 1) {
        return { kind: "ambiguous", candidates: fullMatches };
    }

    // 2. Exact first-name match.
    const firstMatches = roster.filter((s) => firstNameOf(s.name) === candNorm);
    if (firstMatches.length === 1) {
        return { student: firstMatches[0]!, via: "exact-first" };
    }
    if (firstMatches.length > 1) {
        return { kind: "ambiguous", candidates: firstMatches };
    }

    // 3. Exact last-name match.
    const lastMatches = roster.filter((s) => lastNameOf(s.name) === candNorm);
    if (lastMatches.length === 1) {
        return { student: lastMatches[0]!, via: "exact-last" };
    }
    if (lastMatches.length > 1) {
        return { kind: "ambiguous", candidates: lastMatches };
    }

    // 4. Concatenated (no-space) match — handles handwriting where
    //    the OCR drops the space between first and last name.
    const candNoSpace = noSpaces(candidate);
    const noSpaceMatches = roster.filter((s) => noSpaces(s.name) === candNoSpace);
    if (noSpaceMatches.length === 1) {
        return { student: noSpaceMatches[0]!, via: "no-space" };
    }
    if (noSpaceMatches.length > 1) {
        return { kind: "ambiguous", candidates: noSpaceMatches };
    }

    // 5. Unique substring on first OR last name. Only fires when one
    //    student matches; we'd rather kick to the LLM than guess
    //    between two reasonable substrings.
    const subMatches = roster.filter(
        (s) =>
            firstNameOf(s.name).startsWith(candNorm) ||
            lastNameOf(s.name).startsWith(candNorm) ||
            firstNameOf(s.name).includes(candNorm) ||
            lastNameOf(s.name).includes(candNorm)
    );
    if (subMatches.length === 1) {
        return { student: subMatches[0]!, via: "substring" };
    }
    if (subMatches.length > 1) {
        return { kind: "ambiguous", candidates: subMatches };
    }

    return null;
}

// ─── LLM fallback stage ─────────────────────────────────────────────

async function tryLlm(
    candidate: string,
    roster: RosterStudent[],
    client: RosterMatchClient,
    context?: string
): Promise<ResolveStudentResult> {
    const rosterNames = roster.map((s) => s.name);
    const response = await client.match({ candidate, rosterNames, context });

    if ("matched" in response) {
        const matchNorm = normalize(response.matched);
        const found = roster.find((s) => normalize(s.name) === matchNorm);
        if (!found) {
            // The LLM hallucinated a name not in the roster. Treat as
            // unresolved rather than letting it leak through.
            return {
                kind: "unresolved",
                reason: `LLM returned "${response.matched}" which is not in the roster`,
            };
        }
        return { kind: "resolved", student: found, via: "llm" };
    }

    if ("ambiguous" in response) {
        const candidates = response.ambiguous
            .map((n) => normalize(n))
            .map((norm) => roster.find((s) => normalize(s.name) === norm))
            .filter((s): s is RosterStudent => !!s);
        return {
            kind: "ambiguous",
            candidates,
            reason: `LLM couldn't pick a single match for "${candidate}"`,
        };
    }

    return { kind: "unresolved", reason: response.unresolved };
}

// ─── Public entry point ─────────────────────────────────────────────

export interface ResolveStudentInput {
    candidate: string;
    roster: RosterStudent[];
    /** Optional free-form context to help the LLM (e.g. "this is from
     *  a primary classroom morning meeting transcript"). */
    context?: string;
}

export async function resolveStudent(
    input: ResolveStudentInput,
    client: RosterMatchClient | null
): Promise<ResolveStudentResult> {
    const { candidate, roster, context } = input;

    if (roster.length === 0) {
        return { kind: "unresolved", reason: "empty_roster" };
    }
    if (!candidate.trim()) {
        return { kind: "unresolved", reason: "empty_candidate" };
    }

    const det = tryDeterministic(candidate, roster);
    if (det && "via" in det) {
        return { kind: "resolved", student: det.student, via: det.via };
    }
    if (det && det.kind === "ambiguous") {
        // Even when deterministic narrowed to >1, give the LLM a shot
        // with the smaller candidate list — nicknames sometimes break
        // ties cleanly.
        if (client) {
            const narrowed: RosterStudent[] = det.candidates;
            const llmResult = await tryLlm(candidate, narrowed, client, context);
            if (llmResult.kind === "resolved") return llmResult;
        }
        return {
            kind: "ambiguous",
            candidates: det.candidates,
            reason: `multiple roster matches for "${candidate}"`,
        };
    }

    if (!client) {
        return {
            kind: "unresolved",
            reason: `no deterministic match for "${candidate}" and no LLM client available`,
        };
    }
    return tryLlm(candidate, roster, client, context);
}
