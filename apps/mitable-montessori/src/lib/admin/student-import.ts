import { z } from "zod";
import type {
  StudentImportCandidate,
  StudentImportGuardianCandidate,
} from "@/lib/admin/student-import-candidates";

export type ImportField =
  | "first_name"
  | "middle_name"
  | "last_name"
  | "full_name"
  | "preferred_name"
  | "admission_number"
  | "birth_date"
  | "sex"
  | "classroom"
  | "academic_term"
  | "academic_year"
  | "state"
  | "country"
  | "school_attended"
  | "health_info"
  | "religion"
  | "parent_marital_status"
  | "hospital"
  | "place_of_worship"
  | "house"
  | "term_status_changed"
  | "student_status"
  | "year_status_changed"
  | "guardian_name"
  | "guardian_email"
  | "guardian_phone"
  | "guardian_alternative_phone"
  | "guardian_contact_address"
  | "guardian_relationship"
  | "father_name"
  | "father_email"
  | "father_phone"
  | "father_alternative_phone"
  | "mother_name"
  | "mother_email"
  | "mother_phone"
  | "mother_alternative_phone"
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
  guardianPrimary: boolean;
  guardianAlternativePhone: string;
  guardianContactAddress: string;
  additionalGuardians: StudentImportGuardianDraft[];
  profile: StudentImportProfile;
}

/** Child-owned details from school information systems. */
export interface StudentImportProfile {
  middleName: string;
  preferredName: string;
  admissionNumber: string;
  sex: string;
  academicTerm: string;
  academicYear: string;
  state: string;
  country: string;
  schoolAttended: string;
  healthInfo: string;
  religion: string;
  parentMaritalStatus: string;
  hospital: string;
  placeOfWorship: string;
  house: string;
  termStatusChanged: string;
  studentStatus: string;
  yearStatusChanged: string;
}

export interface StudentImportGuardianDraft {
  name: string;
  email: string;
  phone: string;
  alternativePhone: string;
  contactAddress: string;
  relationship: string;
  primary: boolean;
}

export const EMPTY_STUDENT_IMPORT_PROFILE: StudentImportProfile = {
  middleName: "",
  preferredName: "",
  admissionNumber: "",
  sex: "",
  academicTerm: "",
  academicYear: "",
  state: "",
  country: "",
  schoolAttended: "",
  healthInfo: "",
  religion: "",
  parentMaritalStatus: "",
  hospital: "",
  placeOfWorship: "",
  house: "",
  termStatusChanged: "",
  studentStatus: "",
  yearStatusChanged: "",
};

export interface GuardianImport {
  name: string;
  email: string;
  phone?: string;
  alternativePhone?: string;
  contactAddress?: string;
  relationship: string;
  primary: boolean;
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
    /** When null, child is added to the school roster only (no classroom enrollment from this row). */
    classroomId: string | null;
    classroomName: string;
    studentKey: string;
    guardians: GuardianImport[];
    profile: StudentImportProfile;
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
    classroomId: string | null;
    profile: StudentImportProfile;
    guardians: GuardianImport[];
  }>;
  guardiansForExisting: Array<{
    studentId: string;
    guardian: GuardianImport;
  }>;
}

export const STUDENT_IMPORT_TEMPLATE =
  "admission_number,first_name,middle_name,last_name,birth_date,sex,classroom,guardian_name,guardian_email,guardian_phone,guardian_relationship\n" +
  "ADM-101,Maya,,Patel,2019-04-15,Female,Primary East,Asha Patel,asha.patel@example.com,,Mother\n" +
  "ADM-102,Eli,,Johansson,15 April 2018,Male,Elementary West,Linnea Johansson,linnea@example.com,,Mother\n" +
  "ADM-103,Sam,,Taylor,,Non-binary,Primary East,,parent@example.com,555-0100,Guardian\n";

export function shouldParseStudentImportFileLocally(input: {
  name: string;
  type?: string;
}): boolean {
  const type = input.type?.trim().toLowerCase();
  if (type === "text/csv" || type === "text/tab-separated-values" || type === "text/plain") {
    return true;
  }
  const extension = input.name.trim().split(".").pop()?.toLowerCase();
  return extension === "csv" || extension === "tsv" || extension === "txt";
}

const FIELD_PATTERNS: Record<Exclude<ImportField, "ignore">, RegExp[]> = {
  first_name: [/^first[\s_-]*name$/i, /^first$/i, /^fname$/i, /^given[\s_-]*name$/i],
  middle_name: [/^middle[\s_-]*name$/i, /^middle$/i, /^mname$/i],
  last_name: [/^last[\s_-]*name$/i, /^last$/i, /^lname$/i, /^surname$/i, /^family[\s_-]*name$/i],
  full_name: [
    /^name$/i,
    /^full[\s_-]*name$/i,
    /^child([\s_-]*name)?$/i,
    /^student([\s_-]*name)?$/i,
  ],
  preferred_name: [/^preferred[\s_-]*name$/i, /^known[\s_-]*as$/i],
  admission_number: [
    /^admission[\s_-]*(number|no\.?|#)$/i,
    /^student[\s_-]*(number|no\.?|#)$/i,
    /^admission$/i,
  ],
  birth_date: [/^birth[\s_-]*date$/i, /^birthday$/i, /^dob$/i, /^date[\s_-]*of[\s_-]*birth$/i],
  sex: [/^sex$/i, /^gender$/i],
  classroom: [/^classroom$/i, /^class$/i, /^room$/i, /^classroom[\s_-]*name$/i],
  academic_term: [/^academic[\s_-]*term$/i, /^term$/i],
  academic_year: [/^academic[\s_-]*year$/i, /^school[\s_-]*year$/i, /^year$/i],
  state: [/^state$/i, /^state[\s_-]*of[\s_-]*origin$/i],
  country: [/^country$/i, /^nationality$/i],
  school_attended: [/^(previous[\s_-]*)?school[\s_-]*attended$/i, /^previous[\s_-]*school$/i],
  health_info: [/^health[\s_-]*(info|information)$/i, /^medical[\s_-]*(info|information)$/i],
  religion: [/^religion$/i],
  parent_marital_status: [/^parent[\s_-]*marital[\s_-]*status$/i, /^marital[\s_-]*status$/i],
  hospital: [/^hospital$/i],
  place_of_worship: [/^place[\s_-]*of[\s_-]*worship$/i],
  house: [/^house$/i],
  term_status_changed: [/^term[\s_-]*status[\s_-]*changed$/i],
  student_status: [/^student[\s_-]*status$/i],
  year_status_changed: [/^year[\s_-]*status[\s_-]*changed$/i],
  guardian_name: [
    /^guardian([\s_-]*name)?$/i,
    /^parent([\s_-]*name)?$/i,
    /^parent[\s_-]*or[\s_-]*guardian$/i,
    /^carer([\s_-]*name)?$/i,
  ],
  guardian_email: [
    /^guardian[\s_-]*e?-?mail$/i,
    /^parent[\s_-]*e?-?mail$/i,
    /^parent[\s_-]*primary[\s_-]*e?-?mail$/i,
    /^contact[\s_-]*e?-?mail$/i,
    /^email$/i,
  ],
  guardian_phone: [
    /^guardian[\s_-]*phone$/i,
    /^parent[\s_-]*phone$/i,
    /^contact[\s_-]*phone$/i,
    /^primary[\s_-]*phone([\s_-]*(number|no\.?))?$/i,
    /^phone$/i,
  ],
  guardian_alternative_phone: [
    /^(guardian|parent|contact)[\s_-]*(alternative|alternate|secondary)[\s_-]*phone$/i,
    /^(alternative|alternate|secondary)[\s_-]*phone([\s_-]*(number|no\.?))?$/i,
  ],
  guardian_contact_address: [
    /^(guardian|parent|contact)[\s_-]*address$/i,
    /^contact[\s_-]*address$/i,
    /^address$/i,
  ],
  guardian_relationship: [
    /^guardian[\s_-]*relationship$/i,
    /^relationship$/i,
    /^relation$/i,
    /^parent[\s_-]*relationship$/i,
  ],
  father_name: [/^father[\s_-]*name$/i],
  father_email: [/^father[\s_-]*e?-?mail$/i],
  father_phone: [/^father[\s_-]*phone$/i],
  father_alternative_phone: [/^father[\s_-]*contact$/i],
  mother_name: [/^mother[\s_-]*name$/i],
  mother_email: [/^mother[\s_-]*e?-?mail$/i],
  mother_phone: [/^mother[\s_-]*phone$/i],
  mother_alternative_phone: [/^mother[\s_-]*contact$/i],
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
    let guardianAlternativePhone = "";
    let guardianContactAddress = "";
    const profile = { ...EMPTY_STUDENT_IMPORT_PROFILE };
    const father = { ...emptyGuardianDraft(), relationship: "father" };
    const mother = { ...emptyGuardianDraft(), relationship: "mother" };

    cells.forEach((value, index) => {
      switch (mapping[index]) {
        case "first_name":
          firstName = value;
          break;
        case "middle_name":
          profile.middleName = value;
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
        case "preferred_name":
          profile.preferredName = value;
          break;
        case "admission_number":
          profile.admissionNumber = value;
          break;
        case "sex":
          profile.sex = value;
          break;
        case "classroom":
          classroomName = value;
          break;
        case "academic_term":
          profile.academicTerm = value;
          break;
        case "academic_year":
          profile.academicYear = value;
          break;
        case "state":
          profile.state = value;
          break;
        case "country":
          profile.country = value;
          break;
        case "school_attended":
          profile.schoolAttended = value;
          break;
        case "health_info":
          profile.healthInfo = value;
          break;
        case "religion":
          profile.religion = value;
          break;
        case "parent_marital_status":
          profile.parentMaritalStatus = value;
          break;
        case "hospital":
          profile.hospital = value;
          break;
        case "place_of_worship":
          profile.placeOfWorship = value;
          break;
        case "house":
          profile.house = value;
          break;
        case "term_status_changed":
          profile.termStatusChanged = value;
          break;
        case "student_status":
          profile.studentStatus = value;
          break;
        case "year_status_changed":
          profile.yearStatusChanged = value;
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
        case "guardian_alternative_phone":
          guardianAlternativePhone = value;
          break;
        case "guardian_contact_address":
          guardianContactAddress = value;
          break;
        case "guardian_relationship":
          guardianRelationship = value;
          break;
        case "father_name":
          father.name = value;
          break;
        case "father_email":
          father.email = value;
          break;
        case "father_phone":
          father.phone = value;
          break;
        case "father_alternative_phone":
          father.alternativePhone = value;
          break;
        case "mother_name":
          mother.name = value;
          break;
        case "mother_email":
          mother.email = value;
          break;
        case "mother_phone":
          mother.phone = value;
          break;
        case "mother_alternative_phone":
          mother.alternativePhone = value;
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

    const guardianEmails = guardianEmail
      .split(/[;,\n]+/)
      .map((email) => email.trim())
      .filter(Boolean);
    guardianEmail = guardianEmails.shift() ?? "";
    const additionalEmailGuardians = guardianEmails.map((email) => ({
      ...emptyGuardianDraft(),
      email,
    }));

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
      guardianPrimary: Boolean(
        guardianName || guardianEmail || guardianPhone || guardianAlternativePhone
      ),
      guardianAlternativePhone,
      guardianContactAddress,
      additionalGuardians: [...additionalEmailGuardians, father, mother].filter(
        hasGuardianDraftData
      ),
      profile,
    };
  });
}

/** Converts an AI-extracted document into the same editable drafts as a CSV import. */
export function buildDraftsFromStudentCandidates(
  candidates: StudentImportCandidate[]
): StudentImportDraft[] {
  return candidates.map((candidate, index) => {
    const guardians = candidate.guardians
      .map(candidateGuardianToDraft)
      .filter((guardian) => guardian.name || guardian.email);
    const primary = guardians[0] ?? emptyGuardianDraft();
    return {
      id: `ai_${index + 1}_${Math.random().toString(36).slice(2, 8)}`,
      sourceRow: index + 1,
      firstName: candidate.first_name,
      lastName: candidate.last_name,
      birthDate: candidate.birth_date,
      classroomName: candidate.classroom,
      guardianName: primary.name,
      guardianEmail: primary.email,
      guardianPhone: primary.phone,
      guardianRelationship: primary.relationship,
      guardianPrimary: primary.primary,
      guardianAlternativePhone: primary.alternativePhone,
      guardianContactAddress: primary.contactAddress,
      additionalGuardians: guardians.slice(1),
      profile: {
        middleName: candidate.middle_name,
        preferredName: candidate.preferred_name,
        admissionNumber: candidate.admission_number,
        sex: candidate.sex,
        academicTerm: candidate.academic_term,
        academicYear: candidate.academic_year,
        state: candidate.state,
        country: candidate.country,
        schoolAttended: candidate.school_attended,
        healthInfo: candidate.health_info,
        religion: candidate.religion,
        parentMaritalStatus: candidate.parent_marital_status,
        hospital: candidate.hospital,
        placeOfWorship: candidate.place_of_worship,
        house: candidate.house,
        termStatusChanged: candidate.term_status_changed,
        studentStatus: candidate.student_status,
        yearStatusChanged: candidate.year_status_changed,
      },
    };
  });
}

function candidateGuardianToDraft(
  guardian: StudentImportGuardianCandidate
): StudentImportGuardianDraft {
  return {
    name: `${guardian.first_name} ${guardian.last_name}`.trim(),
    email: guardian.email,
    phone: guardian.phone,
    alternativePhone: guardian.alternative_phone,
    contactAddress: guardian.contact_address,
    relationship: guardian.relationship,
    primary: guardian.is_primary_contact,
  };
}

function emptyGuardianDraft(): StudentImportGuardianDraft {
  return {
    name: "",
    email: "",
    phone: "",
    alternativePhone: "",
    contactAddress: "",
    relationship: "guardian",
    primary: false,
  };
}

function hasGuardianDraftData(guardian: StudentImportGuardianDraft): boolean {
  return Boolean(
    guardian.name.trim() ||
    guardian.email.trim() ||
    guardian.phone.trim() ||
    guardian.alternativePhone.trim() ||
    guardian.contactAddress.trim()
  );
}

export function analyzeImportDraft(
  draft: StudentImportDraft,
  classrooms: ClassroomOption[],
  options?: { allowUnassignedClassroom?: boolean }
): DraftAnalysis {
  const allowUnassigned = options?.allowUnassignedClassroom === true;
  const issues: ImportIssue[] = [];
  const firstName = draft.firstName.trim();
  const lastName = draft.lastName.trim();
  const fullName = `${firstName} ${lastName}`.trim();

  if (!firstName || !lastName) issues.push({ kind: "missing_name" });

  const parsedDate = parseFlexibleDate(draft.birthDate);
  if (draft.birthDate.trim() && !parsedDate) {
    issues.push({ kind: "invalid_birth_date", value: draft.birthDate });
  }

  const trimmedClassroom = draft.classroomName.trim();
  const classroomMatch = matchClassroom(draft.classroomName, classrooms);
  if (trimmedClassroom) {
    if (!classroomMatch.exact) {
      issues.push({
        kind: "unknown_classroom",
        value: draft.classroomName,
        suggestion: classroomMatch.suggestion,
      });
    }
  } else if (!allowUnassigned) {
    issues.push({ kind: "missing_classroom" });
  }

  const guardianDrafts: StudentImportGuardianDraft[] = [
    {
      name: draft.guardianName,
      email: draft.guardianEmail,
      phone: draft.guardianPhone,
      alternativePhone: draft.guardianAlternativePhone,
      contactAddress: draft.guardianContactAddress,
      relationship: draft.guardianRelationship,
      primary: draft.guardianPrimary,
    },
    ...draft.additionalGuardians,
  ];
  let guardians: GuardianImport[] = [];
  for (const guardianDraft of guardianDrafts) {
    const result = validateGuardianDraft(guardianDraft);
    if (result.issue) issues.push(result.issue);
    if (result.guardian) {
      const duplicateIndex = guardians.findIndex((guardian) =>
        sameGuardianContact(guardian, result.guardian!)
      );
      if (duplicateIndex >= 0) {
        guardians[duplicateIndex] = mergeGuardianContacts(
          guardians[duplicateIndex]!,
          result.guardian
        );
      } else {
        guardians.push(result.guardian);
      }
    }
  }
  // An imported spreadsheet can flag more than one contact as primary.
  // Keep the first reviewed contact primary; the database must have a
  // deterministic single primary contact for each child.
  let hasPrimaryGuardian = false;
  guardians = guardians.map((guardian) => {
    const primary = guardian.primary && !hasPrimaryGuardian;
    if (primary) hasPrimaryGuardian = true;
    return { ...guardian, primary };
  });

  const classroomResolved = trimmedClassroom ? Boolean(classroomMatch.exact) : allowUnassigned;

  const exact = classroomMatch.exact;
  const ready =
    issues.length === 0 && classroomResolved
      ? {
          fullName,
          birthDate: parsedDate ? parsedDate.iso : null,
          classroomId: exact ? exact.id : null,
          classroomName: exact ? exact.name : "",
          studentKey: parsedDate
            ? `${fullName.toLowerCase()}|${parsedDate.iso}`
            : `${fullName.toLowerCase()}|__nodob__|${exact ? exact.id : "__school__"}`,
          guardians,
          profile: draft.profile,
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
    } else {
      existingByKey.set(`${nameKey}|__nodob__|__school__`, student);
    }
  });

  const newStudentsByKey = new Map<string, StudentImportPlan["newStudents"][number]>();
  const guardiansForExisting: StudentImportPlan["guardiansForExisting"] = [];

  analyses.forEach((analysis) => {
    if (!analysis.ready) return;
    const ready = analysis.ready;
    const existing = existingByKey.get(ready.studentKey);

    if (existing) {
      if (ready.guardians.length === 0) {
        duplicateIssues.set(analysis.draft.id, [
          { kind: "duplicate_without_guardian", name: existing.name },
        ]);
        return;
      }
      for (const guardian of ready.guardians) {
        guardiansForExisting.push({ studentId: existing.id, guardian });
      }
      return;
    }

    const alreadyInBatch = newStudentsByKey.get(ready.studentKey);
    if (alreadyInBatch) {
      if (ready.guardians.length === 0) {
        duplicateIssues.set(analysis.draft.id, [
          { kind: "duplicate_without_guardian", name: ready.fullName },
        ]);
        return;
      }
      alreadyInBatch.guardians.push(...ready.guardians);
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
      profile: ready.profile,
      guardians: ready.guardians,
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

function validateGuardianDraft(draft: StudentImportGuardianDraft): {
  guardian: GuardianImport | null;
  issue: ImportIssue | null;
} {
  const name = draft.name.trim();
  const email = draft.email.trim();
  const phone = draft.phone.trim();
  const alternativePhone = draft.alternativePhone.trim();
  const contactAddress = draft.contactAddress.trim();
  const hasAnyData = Boolean(name || email || phone || alternativePhone || contactAddress);
  if (!hasAnyData) return { guardian: null, issue: null };

  const emailOk = email ? z.string().email().safeParse(email).success : false;
  if (email && !emailOk) {
    return { guardian: null, issue: { kind: "invalid_guardian_email", value: email } };
  }
  const nameParts = name.split(/\s+/).filter(Boolean);
  if (!emailOk && nameParts.length < 2) {
    return { guardian: null, issue: { kind: "guardian_incomplete" } };
  }
  return {
    guardian: {
      name,
      email,
      phone: phone || undefined,
      alternativePhone: alternativePhone || undefined,
      contactAddress: contactAddress || undefined,
      relationship: draft.relationship.trim() || "Guardian",
      primary: draft.primary,
    },
    issue: null,
  };
}

function sameGuardianContact(a: GuardianImport, b: GuardianImport): boolean {
  const aEmail = a.email.trim().toLowerCase();
  const bEmail = b.email.trim().toLowerCase();
  if (aEmail && bEmail) return aEmail === bEmail;

  const aName = a.name.trim().toLowerCase();
  const bName = b.name.trim().toLowerCase();
  return Boolean(aName && bName && aName === bName);
}

function mergeGuardianContacts(a: GuardianImport, b: GuardianImport): GuardianImport {
  const aRelationship = a.relationship.trim();
  const bRelationship = b.relationship.trim();
  const relationship =
    (!aRelationship || aRelationship.toLowerCase() === "guardian") && bRelationship
      ? bRelationship
      : aRelationship || bRelationship || "Guardian";

  return {
    name: a.name.trim() || b.name.trim(),
    email: a.email.trim() || b.email.trim(),
    phone: a.phone?.trim() || b.phone?.trim() || undefined,
    alternativePhone: a.alternativePhone?.trim() || b.alternativePhone?.trim() || undefined,
    contactAddress: a.contactAddress?.trim() || b.contactAddress?.trim() || undefined,
    relationship,
    primary: a.primary || b.primary,
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
