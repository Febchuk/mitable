import { z } from "zod";

export type ImportField =
  | "first_name"
  | "last_name"
  | "full_name"
  | "birth_date"
  | "classroom"
  | "guardian_name"
  | "guardian_email"
  | "guardian_phone"
  | "guardian_relationship"
  | "ignore";

export type ImportMapping = Record<number, ImportField>;

export interface RawImportData {
  delimiter: "," | "\t" | ";";
  headers: string[];
  rows: string[][];
}

export interface ClassroomOption {
  id: string;
  name: string;
}

export interface ExistingStudent {
  id: string;
  name: string;
  birthDate?: string;
  /** Used to match roster rows when birthday is missing. */
  classroomId?: string;
}

export interface StudentImportDraft {
  id: string;
  sourceRow: number;
  firstName: string;
  lastName: string;
  birthDate: string;
  classroomName: string;
  guardianName: string;
  guardianEmail: string;
  guardianPhone: string;
  guardianRelationship: string;
}

export interface GuardianImport {
  name: string;
  email: string;
  phone?: string;
  relationship: string;
}

export type ImportIssue =
  | { kind: "missing_name" }
  | { kind: "invalid_birth_date"; value: string }
  | { kind: "missing_classroom" }
  | { kind: "unknown_classroom"; value: string; suggestion: ClassroomOption | null }
  | { kind: "guardian_incomplete" }
  | { kind: "invalid_guardian_email"; value: string }
  | { kind: "duplicate_without_guardian"; name: string };

export interface DraftAnalysis {
  draft: StudentImportDraft;
  issues: ImportIssue[];
  dateHint: string | null;
  ready: {
    fullName: string;
    birthDate: string | null;
    classroomId: string;
    classroomName: string;
    studentKey: string;
    guardian: GuardianImport | null;
  } | null;
}

export interface StudentImportPlan {
  newStudents: Array<{
    /** Stable id of the import draft row; used for name-collision UI. */
    draftId: string;
    studentKey: string;
    firstName: string;
    lastName: string;
    fullName: string;
    birthDate: string | null;
    classroomId: string;
    guardians: GuardianImport[];
  }>;
  guardiansForExisting: Array<{
    studentId: string;
    guardian: GuardianImport;
  }>;
}

export const STUDENT_IMPORT_TEMPLATE =
  "first_name,last_name,birth_date,classroom,guardian_name,guardian_email,guardian_phone,guardian_relationship\n" +
  "Maya,Patel,2019-04-15,Primary East,Asha Patel,asha.patel@example.com,,Mother\n" +
  "Maya,Patel,2019-04-15,Primary East,Rohan Patel,rohan.patel@example.com,,Father\n" +
  "Eli,Johansson,15 April 2018,Elementary West,Linnea Johansson,linnea@example.com,,Mother\n" +
  "Sam,Taylor,,Primary East,,parent@example.com,555-0100,Guardian\n";

const FIELD_PATTERNS: Record<Exclude<ImportField, "ignore">, RegExp[]> = {
  first_name: [/^first[\s_-]*name$/i, /^first$/i, /^fname$/i, /^given[\s_-]*name$/i],
  last_name: [/^last[\s_-]*name$/i, /^last$/i, /^lname$/i, /^surname$/i, /^family[\s_-]*name$/i],
  full_name: [
    /^name$/i,
    /^full[\s_-]*name$/i,
    /^child([\s_-]*name)?$/i,
    /^student([\s_-]*name)?$/i,
  ],
  birth_date: [/^birth[\s_-]*date$/i, /^birthday$/i, /^dob$/i, /^date[\s_-]*of[\s_-]*birth$/i],
  classroom: [/^classroom$/i, /^class$/i, /^room$/i, /^classroom[\s_-]*name$/i],
  guardian_name: [/^guardian([\s_-]*name)?$/i, /^parent([\s_-]*name)?$/i, /^carer([\s_-]*name)?$/i],
  guardian_email: [
    /^guardian[\s_-]*e?-?mail$/i,
    /^parent[\s_-]*e?-?mail$/i,
    /^contact[\s_-]*e?-?mail$/i,
    /^email$/i,
  ],
  guardian_phone: [
    /^guardian[\s_-]*phone$/i,
    /^parent[\s_-]*phone$/i,
    /^contact[\s_-]*phone$/i,
    /^phone$/i,
  ],
  guardian_relationship: [
    /^guardian[\s_-]*relationship$/i,
    /^relationship$/i,
    /^relation$/i,
    /^parent[\s_-]*relationship$/i,
  ],
};

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

export function parseImportText(text: string): RawImportData | null {
  const stripped = text.replace(/^\uFEFF/, "").trim();
  if (!stripped) return null;
  const lines = stripped.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) return null;

  const delimiter = detectDelimiter(lines[0]);
  return {
    delimiter,
    headers: tokenizeLine(lines[0], delimiter).map((cell) => cell.trim()),
    rows: lines.slice(1).map((line) => tokenizeLine(line, delimiter).map((cell) => cell.trim())),
  };
}

export function detectImportMapping(headers: string[]): ImportMapping {
  const mapping: ImportMapping = {};
  const used = new Set<ImportField>();

  headers.forEach((header, index) => {
    let field: ImportField = "ignore";
    for (const [candidate, patterns] of Object.entries(FIELD_PATTERNS) as [
      Exclude<ImportField, "ignore">,
      RegExp[],
    ][]) {
      if (used.has(candidate)) continue;
      if (patterns.some((pattern) => pattern.test(header.trim()))) {
        field = candidate;
        break;
      }
    }
    mapping[index] = field;
    if (field !== "ignore") used.add(field);
  });

  return mapping;
}

export function buildImportDrafts(rows: string[][], mapping: ImportMapping): StudentImportDraft[] {
  return rows.map((cells, rowIndex) => {
    let firstName = "";
    let lastName = "";
    let fullName = "";
    let birthDate = "";
    let classroomName = "";
    let guardianName = "";
    let guardianEmail = "";
    let guardianPhone = "";
    let guardianRelationship = "";

    cells.forEach((value, index) => {
      switch (mapping[index]) {
        case "first_name":
          firstName = value;
          break;
        case "last_name":
          lastName = value;
          break;
        case "full_name":
          fullName = value;
          break;
        case "birth_date":
          birthDate = value;
          break;
        case "classroom":
          classroomName = value;
          break;
        case "guardian_name":
          guardianName = value;
          break;
        case "guardian_email":
          guardianEmail = value;
          break;
        case "guardian_phone":
          guardianPhone = value;
          break;
        case "guardian_relationship":
          guardianRelationship = value;
          break;
        default:
          break;
      }
    });

    if (fullName && !firstName && !lastName) {
      const parts = fullName.split(/\s+/);
      firstName = parts[0] ?? "";
      lastName = parts.slice(1).join(" ");
    }

    return {
      id: `row_${rowIndex + 2}_${Math.random().toString(36).slice(2, 8)}`,
      sourceRow: rowIndex + 2,
      firstName,
      lastName,
      birthDate,
      classroomName,
      guardianName,
      guardianEmail,
      guardianPhone,
      guardianRelationship,
    };
  });
}

export function analyzeImportDraft(
  draft: StudentImportDraft,
  classrooms: ClassroomOption[]
): DraftAnalysis {
  const issues: ImportIssue[] = [];
  const firstName = draft.firstName.trim();
  const lastName = draft.lastName.trim();
  const fullName = `${firstName} ${lastName}`.trim();

  if (!firstName || !lastName) issues.push({ kind: "missing_name" });

  const parsedDate = parseFlexibleDate(draft.birthDate);
  if (draft.birthDate.trim() && !parsedDate) {
    issues.push({ kind: "invalid_birth_date", value: draft.birthDate });
  }

  const classroomMatch = matchClassroom(draft.classroomName, classrooms);
  if (!draft.classroomName.trim()) {
    issues.push({ kind: "missing_classroom" });
  } else if (!classroomMatch.exact) {
    issues.push({
      kind: "unknown_classroom",
      value: draft.classroomName,
      suggestion: classroomMatch.suggestion,
    });
  }

  const guardianName = draft.guardianName.trim();
  const guardianEmail = draft.guardianEmail.trim();
  const guardianPhone = draft.guardianPhone.trim();
  const hasValidEmail = guardianEmail ? z.string().email().safeParse(guardianEmail).success : false;

  if (guardianEmail && !hasValidEmail) {
    issues.push({ kind: "invalid_guardian_email", value: guardianEmail });
  } else if (guardianName && !hasValidEmail) {
    issues.push({ kind: "guardian_incomplete" });
  } else if (
    !hasValidEmail &&
    !guardianName &&
    (guardianPhone || draft.guardianRelationship.trim())
  ) {
    issues.push({ kind: "guardian_incomplete" });
  }

  const guardian: GuardianImport | null = hasValidEmail
    ? {
        name: guardianName,
        email: guardianEmail,
        phone: guardianPhone || undefined,
        relationship: draft.guardianRelationship.trim() || "Guardian",
      }
    : null;

  const ready =
    issues.length === 0 && classroomMatch.exact
      ? {
          fullName,
          birthDate: parsedDate ? parsedDate.iso : null,
          classroomId: classroomMatch.exact.id,
          classroomName: classroomMatch.exact.name,
          studentKey: parsedDate
            ? `${fullName.toLowerCase()}|${parsedDate.iso}`
            : `${fullName.toLowerCase()}|__nodob__|${classroomMatch.exact.id}`,
          guardian,
        }
      : null;

  return {
    draft,
    issues,
    dateHint: parsedDate?.hint ?? null,
    ready,
  };
}

export function buildStudentImportPlan(
  analyses: DraftAnalysis[],
  existingStudents: ExistingStudent[]
): { plan: StudentImportPlan | null; duplicateIssues: Map<string, ImportIssue[]> } {
  const duplicateIssues = new Map<string, ImportIssue[]>();
  if (!analyses.length || analyses.some((analysis) => analysis.issues.length > 0)) {
    return { plan: null, duplicateIssues };
  }

  const existingByKey = new Map<string, ExistingStudent>();
  existingStudents.forEach((student) => {
    const nameKey = student.name.trim().toLowerCase();
    if (student.birthDate) {
      existingByKey.set(`${nameKey}|${student.birthDate}`, student);
    } else if (student.classroomId) {
      existingByKey.set(`${nameKey}|__nodob__|${student.classroomId}`, student);
    }
  });

  const newStudentsByKey = new Map<string, StudentImportPlan["newStudents"][number]>();
  const guardiansForExisting: StudentImportPlan["guardiansForExisting"] = [];

  analyses.forEach((analysis) => {
    if (!analysis.ready) return;
    const ready = analysis.ready;
    const existing = existingByKey.get(ready.studentKey);

    if (existing) {
      if (!ready.guardian) {
        duplicateIssues.set(analysis.draft.id, [
          { kind: "duplicate_without_guardian", name: existing.name },
        ]);
        return;
      }
      guardiansForExisting.push({ studentId: existing.id, guardian: ready.guardian });
      return;
    }

    const alreadyInBatch = newStudentsByKey.get(ready.studentKey);
    if (alreadyInBatch) {
      if (!ready.guardian) {
        duplicateIssues.set(analysis.draft.id, [
          { kind: "duplicate_without_guardian", name: ready.fullName },
        ]);
        return;
      }
      alreadyInBatch.guardians.push(ready.guardian);
      return;
    }

    newStudentsByKey.set(ready.studentKey, {
      draftId: analysis.draft.id,
      studentKey: ready.studentKey,
      firstName: analysis.draft.firstName.trim(),
      lastName: analysis.draft.lastName.trim(),
      fullName: ready.fullName,
      birthDate: ready.birthDate,
      classroomId: ready.classroomId,
      guardians: ready.guardian ? [ready.guardian] : [],
    });
  });

  if (duplicateIssues.size > 0) return { plan: null, duplicateIssues };
  return {
    plan: {
      newStudents: Array.from(newStudentsByKey.values()),
      guardiansForExisting,
    },
    duplicateIssues,
  };
}

/** Case-insensitive first + last match against the school roster (for import warnings). */
export function listSchoolStudentsMatchingName(
  firstName: string,
  lastName: string,
  schoolStudents: Array<{ id: string; firstName: string; lastName: string }>
): Array<{ id: string; firstName: string; lastName: string }> {
  const a = firstName.trim().toLowerCase();
  const b = lastName.trim().toLowerCase();
  if (!a || !b) return [];
  return schoolStudents.filter(
    (s) => s.firstName.trim().toLowerCase() === a && s.lastName.trim().toLowerCase() === b
  );
}

export function ageLabelFromBirthDate(iso: string): string {
  const birth = new Date(iso);
  if (Number.isNaN(birth.getTime())) return "";
  const now = new Date();
  let months = (now.getFullYear() - birth.getFullYear()) * 12 + now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) months -= 1;
  if (months < 0) return "";
  return `${Math.floor(months / 12)}y ${months % 12}m`;
}

function detectDelimiter(line: string): "," | "\t" | ";" {
  const tabs = (line.match(/\t/g) ?? []).length;
  const commas = (line.match(/,/g) ?? []).length;
  const semis = (line.match(/;/g) ?? []).length;
  if (tabs >= commas && tabs >= semis) return "\t";
  if (semis > commas) return ";";
  return ",";
}

function tokenizeLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === delimiter) {
      out.push(current);
      current = "";
    } else if (char === '"' && current === "") {
      inQuotes = true;
    } else {
      current += char;
    }
  }

  out.push(current);
  return out;
}

function parseFlexibleDate(input: string): { iso: string; hint: string | null } | null {
  const value = input.trim();
  if (!value) return null;

  let match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return makeDate(+match[1], +match[2], +match[3], null);

  match = value.match(/^(\d{4})[/](\d{1,2})[/](\d{1,2})$/);
  if (match) return makeDate(+match[1], +match[2], +match[3], "Read as YYYY/MM/DD.");

  match = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (match) {
    const first = +match[1];
    const second = +match[2];
    let year = +match[3];
    if (year < 100) year += year >= 50 ? 1900 : 2000;
    if (first > 12 && second <= 12) return makeDate(year, second, first, "Read as DD/MM/YYYY.");
    if (second > 12 && first <= 12) return makeDate(year, first, second, "Read as MM/DD/YYYY.");
    if (first <= 12 && second <= 12) {
      return makeDate(year, first, second, "Ambiguous date: read as MM/DD/YYYY. Edit if wrong.");
    }
    return null;
  }

  match = value.match(/^([A-Za-z]+)\s+(\d{1,2})[,\s]+(\d{4})$/);
  if (match) {
    const month = MONTHS[match[1].toLowerCase()];
    return month
      ? makeDate(+match[3], month, +match[2], `Read as ${match[1]} ${match[2]}, ${match[3]}.`)
      : null;
  }

  match = value.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (match) {
    const month = MONTHS[match[2].toLowerCase()];
    return month
      ? makeDate(+match[3], month, +match[1], `Read as ${match[1]} ${match[2]} ${match[3]}.`)
      : null;
  }

  return null;
}

function makeDate(year: number, month: number, day: number, hint: string | null) {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return {
    iso: `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
      .toString()
      .padStart(2, "0")}`,
    hint,
  };
}

function matchClassroom(value: string, classrooms: ClassroomOption[]) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return { exact: null, suggestion: null };

  const exact = classrooms.find((classroom) => classroom.name.trim().toLowerCase() === normalized);
  if (exact) return { exact, suggestion: null };

  let best: { classroom: ClassroomOption; distance: number } | null = null;
  const threshold = Math.max(2, Math.floor(normalized.length / 3));
  for (const classroom of classrooms) {
    const distance = levenshtein(normalized, classroom.name.trim().toLowerCase());
    if (distance <= threshold && (!best || distance < best.distance)) {
      best = { classroom, distance };
    }
  }

  return { exact: null, suggestion: best?.classroom ?? null };
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}
