import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export type ReportTemplate = {
  id: string;
  name: string;
  description: string | null;
  kind: "Daily" | "Major" | "Incident";
  sections: string[];
  iconTone: "clay" | "butter" | "blue" | "sage";
  isActive: boolean;
};

/** All active templates for the caller's school. RLS scopes to school_id. */
export async function listTemplates(): Promise<ReportTemplate[]> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data, error } = await supabase
    .from("report_templates")
    .select("id, name, description, kind, sections, icon_tone, is_active")
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
    iconTone: row.icon_tone as ReportTemplate["iconTone"],
    isActive: row.is_active as boolean,
  }));
}
