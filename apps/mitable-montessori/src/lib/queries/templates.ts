import { createAdminClient } from "@/utils/supabase/admin";
import { getCurrentUserContext } from "@/lib/app/active-classroom";
import type { SectionMeta } from "@/lib/report-templates/sections";

export type ReportTemplateKind = "Daily" | "Major" | "Incident";

export type ReportTemplate = {
  id: string;
  name: string;
  description: string | null;
  kind: ReportTemplateKind;
  sections: string[];
  sectionMeta: SectionMeta;
  iconTone: "clay" | "butter" | "blue" | "sage";
  isActive: boolean;
};

/** Active templates for the caller's school. Uses admin client + explicit
 *  school_id filter (auth gated by getCurrentUserContext). */
export async function listTemplates(): Promise<ReportTemplate[]> {
  const ctx = await getCurrentUserContext();
  if (!ctx) return [];

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("report_templates")
    .select("id, name, description, kind, sections, section_meta, icon_tone, is_active")
    .eq("school_id", ctx.schoolId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("listTemplates failed", error);
    return [];
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    kind: row.kind as ReportTemplate["kind"],
    sections: (row.sections as string[] | null) ?? [],
    sectionMeta: (row.section_meta as SectionMeta | null) ?? {},
    iconTone: row.icon_tone as ReportTemplate["iconTone"],
    isActive: row.is_active as boolean,
  }));
}
