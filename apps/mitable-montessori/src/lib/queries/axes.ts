import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export type AxisRow = { key: string; label: string };

export type AxisCatalogRow = {
  key: string;
  label: string;
  descriptors: Record<string, string>;
  sort_order: number;
  is_active: boolean;
};

/** Returns axes (key + label) for a school. Cached per request. */
export const getAxesForSchool = cache(async function getAxesForSchool(
  schoolId: string | null
): Promise<AxisRow[]> {
  if (!schoolId) return [];
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data } = await supabase
    .from("axes")
    .select("key, label")
    .eq("school_id", schoolId)
    .returns<AxisRow[]>();
  return data ?? [];
});

/** Active axes with full catalog fields. Used by whole-child views. */
export const getActiveAxesCatalog = cache(async function getActiveAxesCatalog(): Promise<
  AxisCatalogRow[]
> {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data } = await supabase
    .from("axes")
    .select("key, label, descriptors, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .returns<AxisCatalogRow[]>();
  return data ?? [];
});
