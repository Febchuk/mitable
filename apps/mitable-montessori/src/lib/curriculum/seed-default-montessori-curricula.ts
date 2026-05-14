import { DEFAULT_CURRICULA } from "@/lib/admin/curriculum-data";
import { createAdminClient } from "@/utils/supabase/admin";

export type ServiceRoleClient = ReturnType<typeof createAdminClient>;

export interface SeedDefaultMontessoriParams {
  schoolId: string;
  /** Optional `users.id` of the admin who triggered the seed (FK on `curricula`). */
  createdByUserId?: string | null;
}

/** Removes one curriculum row and its topic/subtopic tree (`curriculum_subjects` cascade from curricula). */
export async function deleteCurriculumTree(db: ServiceRoleClient, curriculumId: string) {
  const { data: topicRows } = await db
    .from("curriculum_topics")
    .select("id")
    .eq("curriculum_id", curriculumId);
  const topicIds = (topicRows ?? []).map((r) => r.id as string);
  if (topicIds.length > 0) {
    const { error: subErr } = await db
      .from("curriculum_subtopics")
      .delete()
      .in("topic_id", topicIds);
    if (subErr) throw new Error(subErr.message);
  }
  const { error: topErr } = await db
    .from("curriculum_topics")
    .delete()
    .eq("curriculum_id", curriculumId);
  if (topErr) throw new Error(topErr.message);
  const { error: curErr } = await db.from("curricula").delete().eq("id", curriculumId);
  if (curErr) throw new Error(curErr.message);
}

/** Deletes every curriculum (and trees) for a school — for rollback / repair. */
export async function deleteAllCurriculaForSchool(db: ServiceRoleClient, schoolId: string) {
  const { data: curriculumRows } = await db
    .from("curricula")
    .select("id")
    .eq("school_id", schoolId);
  for (const row of curriculumRows ?? []) {
    await deleteCurriculumTree(db, row.id as string);
  }
}

/**
 * Inserts the five standard Montessori level curricula (from `DEFAULT_CURRICULA`)
 * for a school when they are missing. Skips any curriculum whose `name` already
 * exists for that school (idempotent).
 */
export async function ensureDefaultMontessoriCurricula(
  db: ServiceRoleClient,
  params: SeedDefaultMontessoriParams
): Promise<{ inserted: number; skipped: number }> {
  const { schoolId, createdByUserId } = params;
  let inserted = 0;
  let skipped = 0;

  for (const def of DEFAULT_CURRICULA) {
    const { data: existing } = await db
      .from("curricula")
      .select("id")
      .eq("school_id", schoolId)
      .eq("name", def.name)
      .maybeSingle();

    if (existing) {
      skipped += 1;
      continue;
    }

    const { data: curRow, error: cErr } = await db
      .from("curricula")
      .insert({
        school_id: schoolId,
        name: def.name,
        framework: "montessori",
        description: def.ageRange
          ? `Mitable standard scope · ${def.ageRange}`
          : "Mitable standard scope and sequence",
        is_active: true,
        created_by_user_id: createdByUserId ?? null,
      })
      .select("id")
      .single();

    if (cErr || !curRow) {
      throw new Error(cErr?.message ?? "Failed to insert curriculum");
    }

    const curriculumId = curRow.id as string;

    try {
      let topicSortIndex = 0;

      for (let s = 0; s < def.subjects.length; s++) {
        const subject = def.subjects[s];
        const { data: subjRow, error: sjErr } = await db
          .from("curriculum_subjects")
          .insert({
            curriculum_id: curriculumId,
            name: subject.name,
            sort_order: s,
            is_active: true,
          })
          .select("id")
          .single();

        if (sjErr || !subjRow) {
          throw new Error(sjErr?.message ?? "Failed to insert curriculum subject");
        }

        const subjectId = subjRow.id as string;

        for (const topic of subject.topics) {
          const { data: tRow, error: tErr } = await db
            .from("curriculum_topics")
            .insert({
              curriculum_id: curriculumId,
              subject_id: subjectId,
              name: topic.name,
              sort_order: topicSortIndex,
              is_active: true,
            })
            .select("id")
            .single();

          topicSortIndex += 1;

          if (tErr || !tRow) {
            throw new Error(tErr?.message ?? "Failed to insert curriculum topic");
          }

          const topicId = tRow.id as string;
          const subRows = topic.subtopics.map((name, idx) => ({
            topic_id: topicId,
            name,
            sort_order: idx,
            is_active: true,
            aliases: [] as string[],
          }));

          if (subRows.length > 0) {
            const { error: stErr } = await db.from("curriculum_subtopics").insert(subRows);
            if (stErr) {
              throw new Error(stErr.message);
            }
          }
        }
      }

      inserted += 1;
    } catch (err) {
      await deleteCurriculumTree(db, curriculumId);
      throw err;
    }
  }

  return { inserted, skipped };
}
