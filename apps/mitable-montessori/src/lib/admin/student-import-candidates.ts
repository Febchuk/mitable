import { z } from "zod";

/**
 * The format shared by the Gemini extraction route and the import-review UI.
 * Fields are deliberately optional: an import must preserve what the source
 * says, not manufacture values for incomplete legacy records.
 */
export const StudentImportGuardianCandidateSchema = z.object({
  first_name: z.string().max(100).optional().default(""),
  last_name: z.string().max(100).optional().default(""),
  email: z.string().max(254).optional().default(""),
  phone: z.string().max(50).optional().default(""),
  alternative_phone: z.string().max(50).optional().default(""),
  contact_address: z.string().max(500).optional().default(""),
  relationship: z.enum(["mother", "father", "guardian", "other"]).default("guardian"),
  is_primary_contact: z.boolean().default(false),
});

export const StudentImportCandidateSchema = z.object({
  first_name: z.string().max(100).optional().default(""),
  middle_name: z.string().max(100).optional().default(""),
  last_name: z.string().max(100).optional().default(""),
  preferred_name: z.string().max(100).optional().default(""),
  admission_number: z.string().max(100).optional().default(""),
  birth_date: z.string().max(40).optional().default(""),
  sex: z.string().max(50).optional().default(""),
  classroom: z.string().max(200).optional().default(""),
  academic_term: z.string().max(100).optional().default(""),
  academic_year: z.string().max(100).optional().default(""),
  state: z.string().max(100).optional().default(""),
  country: z.string().max(100).optional().default(""),
  school_attended: z.string().max(300).optional().default(""),
  health_info: z.string().max(4000).optional().default(""),
  religion: z.string().max(100).optional().default(""),
  parent_marital_status: z.string().max(100).optional().default(""),
  hospital: z.string().max(300).optional().default(""),
  place_of_worship: z.string().max(300).optional().default(""),
  house: z.string().max(100).optional().default(""),
  term_status_changed: z.string().max(100).optional().default(""),
  student_status: z.string().max(100).optional().default(""),
  year_status_changed: z.string().max(100).optional().default(""),
  guardians: z.array(StudentImportGuardianCandidateSchema).max(4).default([]),
});

export const StudentImportExtractionSchema = z.object({
  students: z.array(StudentImportCandidateSchema).max(500),
});

export type StudentImportGuardianCandidate = z.infer<typeof StudentImportGuardianCandidateSchema>;
export type StudentImportCandidate = z.infer<typeof StudentImportCandidateSchema>;
export type StudentImportExtraction = z.infer<typeof StudentImportExtractionSchema>;

/** Gemini's JSON-schema subset is intentionally kept flat and small. */
export const STUDENT_IMPORT_EXTRACTION_JSON_SCHEMA = {
  type: "object",
  properties: {
    students: {
      type: "array",
      items: {
        type: "object",
        properties: {
          first_name: { type: "string" },
          middle_name: { type: "string" },
          last_name: { type: "string" },
          preferred_name: { type: "string" },
          admission_number: { type: "string" },
          birth_date: { type: "string" },
          sex: { type: "string" },
          classroom: { type: "string" },
          academic_term: { type: "string" },
          academic_year: { type: "string" },
          state: { type: "string" },
          country: { type: "string" },
          school_attended: { type: "string" },
          health_info: { type: "string" },
          religion: { type: "string" },
          parent_marital_status: { type: "string" },
          hospital: { type: "string" },
          place_of_worship: { type: "string" },
          house: { type: "string" },
          term_status_changed: { type: "string" },
          student_status: { type: "string" },
          year_status_changed: { type: "string" },
          guardians: {
            type: "array",
            items: {
              type: "object",
              properties: {
                first_name: { type: "string" },
                last_name: { type: "string" },
                email: { type: "string" },
                phone: { type: "string" },
                alternative_phone: { type: "string" },
                contact_address: { type: "string" },
                relationship: {
                  type: "string",
                  enum: ["mother", "father", "guardian", "other"],
                },
                is_primary_contact: { type: "boolean" },
              },
              required: [
                "first_name",
                "last_name",
                "email",
                "phone",
                "alternative_phone",
                "contact_address",
                "relationship",
                "is_primary_contact",
              ],
            },
          },
        },
        required: [
          "first_name",
          "middle_name",
          "last_name",
          "preferred_name",
          "admission_number",
          "birth_date",
          "sex",
          "classroom",
          "academic_term",
          "academic_year",
          "state",
          "country",
          "school_attended",
          "health_info",
          "religion",
          "parent_marital_status",
          "hospital",
          "place_of_worship",
          "house",
          "term_status_changed",
          "student_status",
          "year_status_changed",
          "guardians",
        ],
      },
    },
  },
  required: ["students"],
} as const;
