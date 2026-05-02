import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ReportDataAdapter,
  ReportReferenceSet,
  TokenizedCommandRecord,
  TokenizedProgressRow,
} from "@/lib/reports/data-adapter";

/**
 * Pulls commands + progress from Supabase (server-side, RLS in effect) and
 * tokenizes the result before handing it to the agent. The agent never sees
 * student / subtopic / classroom names.
 */
export class SupabaseReportDataAdapter implements ReportDataAdapter {
  constructor(private supabase: SupabaseClient) {}

  async getStudentCommands(args: {
    studentRef: string;
    periodStart: string;
    periodEnd: string;
  }): Promise<{ commands: TokenizedCommandRecord[]; references: ReportReferenceSet }> {
    const tokenizer = new IncrementalTokenizer();

    const studentToken = tokenizer.studentToken(args.studentRef, "");
    // Pull commands. We use the projections (attendance_records,
    // student_progress) plus the raw notes from `commands`.
    const [{ data: attendance }, { data: progress }, { data: notes }] = await Promise.all([
      this.supabase
        .from("attendance_records")
        .select("student_id, classroom_id, attendance_date, status, comment")
        .eq("student_id", args.studentRef)
        .gte("attendance_date", args.periodStart)
        .lte("attendance_date", args.periodEnd),
      this.supabase
        .from("student_progress_history")
        .select(
          "student_id, classroom_id, curriculum_subtopic_id, new_status, comment, changed_at, curriculum_subtopics(name)"
        )
        .eq("student_id", args.studentRef)
        .gte("changed_at", args.periodStart)
        .lte("changed_at", `${args.periodEnd}T23:59:59`),
      this.supabase
        .from("commands")
        .select("classroom_id, payload, created_at")
        .eq("user_id", null)
        .eq("command_type", "note")
        .gte("created_at", args.periodStart)
        .lte("created_at", `${args.periodEnd}T23:59:59`),
    ]);

    const out: TokenizedCommandRecord[] = [];

    for (const r of attendance ?? []) {
      const row = r as {
        classroom_id: string;
        attendance_date: string;
        status: string;
        comment: string | null;
      };
      out.push({
        student_token: studentToken,
        classroom_token: tokenizer.classroomToken(row.classroom_id, ""),
        subtopic_token: null,
        command_type: "attendance",
        status: row.status,
        date: row.attendance_date,
        comment: row.comment,
      });
    }

    for (const r of progress ?? []) {
      const row = r as {
        classroom_id: string;
        curriculum_subtopic_id: string;
        new_status: string;
        comment: string | null;
        changed_at: string;
        curriculum_subtopics: { name: string } | { name: string }[] | null;
      };
      const subtopicName = Array.isArray(row.curriculum_subtopics)
        ? (row.curriculum_subtopics[0]?.name ?? "")
        : (row.curriculum_subtopics?.name ?? "");
      out.push({
        student_token: studentToken,
        classroom_token: tokenizer.classroomToken(row.classroom_id, ""),
        subtopic_token: tokenizer.subtopicToken(row.curriculum_subtopic_id, subtopicName),
        command_type: "progress",
        status: row.new_status,
        date: row.changed_at.slice(0, 10),
        comment: row.comment,
      });
    }

    for (const r of notes ?? []) {
      const row = r as {
        classroom_id: string;
        payload: { student_id?: string; text?: string };
        created_at: string;
      };
      if (row.payload?.student_id !== args.studentRef) continue;
      out.push({
        student_token: studentToken,
        classroom_token: tokenizer.classroomToken(row.classroom_id, ""),
        subtopic_token: null,
        command_type: "note",
        status: null,
        date: row.created_at.slice(0, 10),
        comment: row.payload?.text ?? null,
      });
    }

    return { commands: out, references: tokenizer.references() };
  }

  async getStudentProgressSummary(args: {
    studentRef: string;
  }): Promise<{ rows: TokenizedProgressRow[]; references: ReportReferenceSet }> {
    const tokenizer = new IncrementalTokenizer();

    const { data } = await this.supabase
      .from("student_progress")
      .select("curriculum_subtopic_id, status, comment, updated_at, curriculum_subtopics(name)")
      .eq("student_id", args.studentRef);

    const rows: TokenizedProgressRow[] = (data ?? []).map((r) => {
      const row = r as {
        curriculum_subtopic_id: string;
        status: "introduced" | "practicing" | "mastered" | "na";
        comment: string | null;
        updated_at: string;
        curriculum_subtopics: { name: string } | { name: string }[] | null;
      };
      const subtopicName = Array.isArray(row.curriculum_subtopics)
        ? (row.curriculum_subtopics[0]?.name ?? "")
        : (row.curriculum_subtopics?.name ?? "");
      return {
        subtopic_token: tokenizer.subtopicToken(row.curriculum_subtopic_id, subtopicName),
        status: row.status,
        comment: row.comment,
        updated_at: row.updated_at,
      };
    });

    return { rows, references: tokenizer.references() };
  }
}

/**
 * Stable token assigner: same UUID gets the same token across read tools so
 * the agent can correlate results.
 */
export class IncrementalTokenizer {
  private students = new Map<string, { token: string; display: string }>();
  private subtopics = new Map<string, { token: string; display: string }>();
  private classrooms = new Map<string, { token: string; display: string }>();

  studentToken(id: string, display: string): string {
    let entry = this.students.get(id);
    if (!entry) {
      entry = { token: `[STUDENT_${this.students.size + 1}]`, display };
      this.students.set(id, entry);
    } else if (display && !entry.display) {
      entry.display = display;
    }
    return entry.token;
  }

  subtopicToken(id: string, display: string): string {
    let entry = this.subtopics.get(id);
    if (!entry) {
      entry = { token: `[SUBTOPIC_${this.subtopics.size + 1}]`, display };
      this.subtopics.set(id, entry);
    } else if (display && !entry.display) {
      entry.display = display;
    }
    return entry.token;
  }

  classroomToken(id: string, display: string): string {
    let entry = this.classrooms.get(id);
    if (!entry) {
      entry = { token: `[CLASSROOM_${this.classrooms.size}]`, display };
      this.classrooms.set(id, entry);
    } else if (display && !entry.display) {
      entry.display = display;
    }
    return entry.token;
  }

  references(): ReportReferenceSet {
    const refs: ReportReferenceSet["refs"] = [];
    for (const [id, v] of this.students) {
      refs.push({ id, token: v.token, display: v.display, kind: "student" });
    }
    for (const [id, v] of this.subtopics) {
      refs.push({ id, token: v.token, display: v.display, kind: "subtopic" });
    }
    for (const [id, v] of this.classrooms) {
      refs.push({ id, token: v.token, display: v.display, kind: "classroom" });
    }
    return { refs };
  }
}
