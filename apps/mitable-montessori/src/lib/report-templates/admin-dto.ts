import {
  dbToRows,
  type SectionMeta,
  type TemplateSectionRow,
} from "@/lib/report-templates/sections";

export type ReportingPeriod =
  | "daily"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "end_of_term";

export const REPORTING_PERIOD_LABEL: Record<ReportingPeriod, string> = {
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Bi-weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  end_of_term: "End of term",
};

export const REPORTING_PERIOD_VALUES: ReportingPeriod[] = [
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "end_of_term",
];

/** Number of days of history to pull for each reporting period. */
export const REPORTING_PERIOD_DAYS: Record<ReportingPeriod, number> = {
  daily: 1,
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  quarterly: 91,
  end_of_term: 120,
};

export type ContextModeDefault = "history" | "input_only";

export type AdminReportTemplateDto = {
  id: string;
  name: string;
  description: string | null;
  kind: string;
  sections: string[];
  sectionGuidance: Record<string, string>;
  sectionMeta: SectionMeta;
  templateSections: TemplateSectionRow[];
  writingStyle: string;
  logoUrl: string | null;
  iconTone: string;
  isActive: boolean;
  reportingPeriod: ReportingPeriod | null;
  contextModeDefault: ContextModeDefault;
  createdAt: string;
  updatedAt: string;
};

export function toAdminTemplateDto(row: Record<string, unknown>): AdminReportTemplateDto {
  const sections = (row.sections as string[] | null) ?? [];
  const sectionGuidance = (row.section_guidance as Record<string, string> | null) ?? {};
  const sectionMeta = (row.section_meta as SectionMeta | null) ?? {};
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    kind: row.kind as string,
    sections,
    sectionGuidance,
    sectionMeta,
    templateSections: dbToRows(sections, sectionGuidance, sectionMeta),
    writingStyle: (row.writing_style as string | null) ?? "",
    logoUrl: (row.logo_url as string | null) ?? null,
    iconTone: row.icon_tone as string,
    isActive: row.is_active as boolean,
    reportingPeriod: (row.reporting_period as ReportingPeriod | null) ?? null,
    contextModeDefault: ((row.context_mode_default as string | null) ??
      "history") as ContextModeDefault,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
