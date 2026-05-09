import { createAdminClient } from "@/utils/supabase/admin";
import { redact } from "@/lib/tokens/token-map";
import { formatStudentToken } from "@/lib/tokens/format";
import type { TokenMap, TokenRef } from "@/lib/tokens/types";
import type { RosterStudent } from "./roster";

/**
 * Tool implementations for the general chat agent. Each tool:
 *
 *   1. Validates the studentId(s) belong to the teacher's classroom (the
 *      route layer's `roster` parameter is the source of truth — we never
 *      trust the model to stay in scope).
 *   2. Fetches DB rows.
 *   3. If a row mentions a student NOT in the request's tokenMap (e.g. a
 *      different child the model didn't ask about), augments the tokenMap
 *      so the redactor can rewrite that name on the way out.
 *   4. Returns a JSON-serializable result — every free-text field has been
 *      run through `redact()`.
 *
 * The tokenMap is mutated in place so subsequent tool calls in the same
 * request inherit any newly-discovered students. The route layer treats the
 * map as a per-request accumulator.
 */

export interface ToolContext {
  /** Roster of every student in the active classroom. Used to scope queries. */
  roster: RosterStudent[];
  /** Per-request token map; tools may extend it. */
  tokenMap: TokenMap;
  /** Adds a student ref to the map (used when scrubbing tool outputs). */
  ensureStudentInMap: (id: string, display: string) => void;
}

export function makeToolContext(args: {
  roster: RosterStudent[];
  tokenMap: TokenMap;
  refs: TokenRef[];
}): ToolContext {
  const refs = args.refs;
  return {
    roster: args.roster,
    tokenMap: args.tokenMap,
    ensureStudentInMap(id: string, display: string) {
      if (args.tokenMap.reverse.has(formatStudentToken(id).toLowerCase())) return;
      const ref: TokenRef = {
        id,
        display,
        kind: "student",
        token: formatStudentToken(id),
      };
      refs.push(ref);
      args.tokenMap.forward.set(display.trim().toLowerCase(), ref.token);
      args.tokenMap.reverse.set(ref.token.toLowerCase(), ref);
    },
  };
}

interface ProgressRow {
  curriculum_subtopic_id: string;
  status: string | null;
  curriculum_subtopics: { id: string; name: string } | null;
  student_progress_history: Array<{
    new_status: string | null;
    comment: string | null;
    changed_at: string;
  }>;
}

interface ObservationRow {
  id: string;
  student_id: string;
  axis_key: string;
  from_level: string | null;
  to_level: string | null;
  note: string;
  created_at: string;
  students: {
    id: string;
    first_name: string;
    last_name: string;
    preferred_name: string | null;
  } | null;
}

export async function runGetStudentProgress(
  ctx: ToolContext,
  args: { studentId: string }
): Promise<unknown> {
  const inScope = ctx.roster.some((s) => s.id === args.studentId);
  if (!inScope) {
    return {
      error: "student_not_in_classroom",
      message:
        "That student is not in your active classroom. Ask the teacher to clarify which student they meant.",
    };
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("student_progress")
    .select(
      "curriculum_subtopic_id, status, " +
        "curriculum_subtopics(id, name), " +
        "student_progress_history(new_status, comment, changed_at)"
    )
    .eq("student_id", args.studentId)
    .returns<ProgressRow[]>();

  if (error) return { error: "db_error", message: error.message };

  return {
    studentId: args.studentId,
    studentToken: formatStudentToken(args.studentId),
    subtopics: (data ?? []).map((row) => {
      const latest = row.student_progress_history?.[0];
      return {
        subtopicId: row.curriculum_subtopic_id,
        subtopicName: row.curriculum_subtopics?.name ?? null,
        status: row.status,
        latestComment: latest?.comment ? redact(latest.comment, ctx.tokenMap) : null,
        latestChangedAt: latest?.changed_at ?? null,
      };
    }),
  };
}

export async function runSearchObservations(
  ctx: ToolContext,
  args: { studentIds: string[]; query?: string }
): Promise<unknown> {
  const inScope = (args.studentIds ?? []).filter((id) => ctx.roster.some((s) => s.id === id));
  if (inScope.length === 0) {
    return {
      error: "no_students_in_classroom",
      message: "None of those students are in your active classroom.",
    };
  }
  const supabase = createAdminClient();
  let q = supabase
    .from("whole_child_observations")
    .select(
      "id, student_id, axis_key, from_level, to_level, note, created_at, " +
        "students(id, first_name, last_name, preferred_name)"
    )
    .in("student_id", inScope)
    .order("created_at", { ascending: false })
    .limit(20);
  if (args.query && args.query.trim().length > 0) {
    q = q.ilike("note", `%${args.query.replace(/[%_]/g, "")}%`);
  }
  const { data, error } = await q.returns<ObservationRow[]>();
  if (error) return { error: "db_error", message: error.message };

  // Ensure every observed student is in the token map so any free-text
  // mentions of *that* student get redacted.
  for (const row of data ?? []) {
    if (row.students) {
      const display = row.students.preferred_name?.trim()
        ? `${row.students.preferred_name} ${row.students.last_name}`
        : `${row.students.first_name} ${row.students.last_name}`;
      ctx.ensureStudentInMap(row.student_id, display.trim());
    }
  }

  return {
    observations: (data ?? []).map((row) => ({
      id: row.id,
      studentToken: formatStudentToken(row.student_id),
      axis: row.axis_key,
      fromLevel: row.from_level,
      toLevel: row.to_level,
      note: redact(row.note, ctx.tokenMap),
      createdAt: row.created_at,
    })),
  };
}
