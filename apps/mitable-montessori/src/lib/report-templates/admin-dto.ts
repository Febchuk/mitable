import {
  dbToRows,
  type SectionMeta,
  type TemplateSectionRow,
} from "@/lib/report-templates/sections";

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
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
