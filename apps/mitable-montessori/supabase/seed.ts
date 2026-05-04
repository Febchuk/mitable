/**
 * Seeds a fresh Supabase project with one school, one admin, one teacher,
 * one classroom, the default Montessori curriculum (5 topics, ~30 subtopics),
 * 10 students, and 1–2 guardians per student.
 *
 * Usage: npm run supabase:seed --workspace=@mitable/mitable-montessori
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
 * Uses the service role to bypass RLS (creates auth.users + public.users rows).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, randomBytes } from "node:crypto";

// Tiny .env.local loader so we don't pull in dotenv just for the seed.
const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, "..", ".env.local");
try {
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
} catch {
  console.warn(`No .env.local at ${envPath}; relying on process env.`);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ADMIN_EMAIL = "admin@example.school";
const TEACHER_EMAIL = "teacher@example.school";
const SHARED_PASSWORD = "montessori-demo-1!";

const MONTESSORI_CURRICULUM = [
  {
    name: "Practical Life",
    subtopics: [
      "Pouring (water)",
      "Spooning beans",
      "Tying laces",
      "Buttoning frame",
      "Polishing wood",
      "Sweeping",
    ],
  },
  {
    name: "Sensorial",
    subtopics: [
      "Pink Tower",
      "Brown Stair",
      "Red Rods",
      "Color Tablets (Box 2)",
      "Geometric Cabinet",
      "Sound Cylinders",
    ],
  },
  {
    name: "Language",
    subtopics: [
      "Sandpaper Letters",
      "Movable Alphabet",
      "Object-to-Picture matching",
      "Phonogram cards",
      "Reading folders",
      "Grammar boxes",
    ],
  },
  {
    name: "Mathematics",
    subtopics: [
      "Number Rods",
      "Sandpaper Numbers",
      "Spindle Box",
      "Cards and Counters",
      "Golden Bead Material",
      "Stamp Game",
    ],
  },
  {
    name: "Cultural",
    subtopics: [
      "Continent Globe",
      "Puzzle Map: World",
      "Land & Water Forms",
      "Botany Cabinet",
      "Life Cycle: Frog",
      "Life Cycle: Butterfly",
    ],
  },
];

const STUDENTS: Array<{
  first: string;
  last: string;
  nicknames?: string[];
  pref?: string;
  sex: string;
  notes?: string;
}> = [
  {
    first: "Ada",
    last: "Okafor",
    sex: "Female",
    notes:
      "Allergies: peanuts (carries epi-pen, see fridge). Lactose intolerant — oat milk in cubby.",
  },
  {
    first: "Bilal",
    last: "Hassan",
    nicknames: ["Billy"],
    sex: "Male",
    notes: "Allergies: bee stings. No dietary restrictions.",
  },
  {
    first: "Camila",
    last: "Rivera",
    pref: "Cami",
    sex: "Female",
    notes: "No known allergies. Wears glasses for close work.",
  },
  { first: "Daiyu", last: "Chen", sex: "Female" },
  { first: "Eitan", last: "Levi", sex: "Male" },
  { first: "Farida", last: "Ndiaye", sex: "Female" },
  { first: "Gus", last: "Hansen", sex: "Male" },
  { first: "Hina", last: "Shah", sex: "Female" },
  { first: "Idris", last: "Jallow", sex: "Male" },
  { first: "Lina", last: "Petrov", sex: "Female" },
];

async function ensureUser(email: string, role: "admin" | "teacher") {
  // Try create; if already exists, fetch instead.
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password: SHARED_PASSWORD,
    email_confirm: true,
  });
  if (created?.user) return created.user;
  if (createErr && !/already been registered|exists/i.test(createErr.message)) throw createErr;

  // Already exists — find it.
  let page = 1;
  while (page < 10) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (found) return found;
    if (data.users.length < 100) break;
    page++;
  }
  throw new Error(`Could not create or find auth user for ${email} (role ${role})`);
}

const SCHOOL_NAME = "Mitable Demo Montessori";

/**
 * Deletes every row owned by a given school so the seed can be re-run on
 * top of itself without producing duplicates. None of the FKs declare ON
 * DELETE CASCADE, so we walk the dependency graph manually in reverse.
 *
 * Auth users (`admin@example.school` / `teacher@example.school`) are NOT
 * deleted — they live in `auth.users` outside the public schema, and the
 * seed's `ensureUser()` already handles "already exists" cleanly. We just
 * unlink the public.users row that points at this school.
 */
async function wipeDemoSchool(schoolId: string) {
  console.log(`  · wiping data for school ${schoolId}`);

  // 1. Find every student in this school — most leaf tables key on student_id.
  const { data: students, error: studErr } = await supabase
    .from("students")
    .select("id")
    .eq("school_id", schoolId);
  if (studErr) throw studErr;
  const studentIds = (students ?? []).map((s) => s.id);

  // 2. Find every classroom in this school — classroom_teacher_assignments + commands key on it.
  const { data: classrooms, error: classErr } = await supabase
    .from("classrooms")
    .select("id")
    .eq("school_id", schoolId);
  if (classErr) throw classErr;
  const classroomIds = (classrooms ?? []).map((c) => c.id);

  // 3. Find curricula → topics → subtopics ids (curriculum_topics keys on curriculum_id).
  const { data: curricula } = await supabase
    .from("curricula")
    .select("id")
    .eq("school_id", schoolId);
  const curriculumIds = (curricula ?? []).map((c) => c.id);
  const { data: topics } = curriculumIds.length
    ? await supabase.from("curriculum_topics").select("id").in("curriculum_id", curriculumIds)
    : { data: [] };
  const topicIds = (topics ?? []).map((t) => t.id);

  // 4. Find guardian + report ids for the secondary FK chains.
  const { data: guardians } = await supabase
    .from("guardians")
    .select("id")
    .eq("school_id", schoolId);
  const guardianIds = (guardians ?? []).map((g) => g.id);
  const { data: reports } =
    studentIds.length > 0
      ? await supabase.from("reports").select("id").in("student_id", studentIds)
      : { data: [] };
  const reportIds = (reports ?? []).map((r) => r.id);

  // Helper that deletes from a table either by `student_id` IN (...) or `id` IN (...).
  // Supabase JS won't accept .in() with an empty array, so guard.
  async function delByIds(table: string, column: string, ids: string[]) {
    if (ids.length === 0) return;
    const { error } = await supabase.from(table).delete().in(column, ids);
    if (error) throw new Error(`delete ${table}.${column}: ${error.message}`);
  }
  async function delBySchool(table: string, column = "school_id") {
    const { error } = await supabase.from(table).delete().eq(column, schoolId);
    if (error) throw new Error(`delete ${table}.${column}: ${error.message}`);
  }

  // ---- Phase 1: leaves ----
  // Curriculum events + whole-child observations + axis assessments → key on student_id.
  await delByIds("curriculum_events", "student_id", studentIds);
  await delByIds("whole_child_observations", "student_id", studentIds);
  await delByIds("axis_assessments", "student_id", studentIds);
  // Progress + history + attendance key on student_id.
  await delByIds("student_progress_history", "student_id", studentIds);
  await delByIds("student_progress", "student_id", studentIds);
  await delByIds("attendance_records", "student_id", studentIds);
  // Commands has no student_id column (student lives in payload jsonb), so
  // delete by school_id — the seed only ever inserts commands for this school.
  await delBySchool("commands");

  // student_guardians + guardian invitations + guardian links keyed on student_id / guardian_id.
  await delByIds("student_guardians", "student_id", studentIds);
  await delByIds("guardian_invitations", "guardian_id", guardianIds);
  // Reports → review actions + recipients first, then the report rows themselves.
  await delByIds("report_review_actions", "report_id", reportIds);
  await delByIds("report_recipients", "report_id", reportIds);
  await delByIds("reports", "student_id", studentIds);
  await delBySchool("guardians");
  // Enrollments: delete by classroom (or student — either works).
  await delByIds("student_classroom_enrollments", "student_id", studentIds);
  // Axes (school-scoped catalog) — must drop before students/users since none reference it back.
  await delBySchool("axes");
  // Report templates — school-scoped, no FKs to roster.
  await delBySchool("report_templates");

  // ---- Phase 2: middle layer ----
  await delByIds("classroom_teacher_assignments", "classroom_id", classroomIds);
  await delByIds("students", "school_id", [schoolId]);
  await delByIds("classrooms", "school_id", [schoolId]);
  // Curriculum: subtopics → topics → curricula.
  await delByIds("curriculum_subtopics", "topic_id", topicIds);
  await delByIds("curriculum_topics", "curriculum_id", curriculumIds);
  await delByIds("curricula", "school_id", [schoolId]);

  // ---- Phase 3: top of the tree ----
  // audit_log.actor_id references users(id); seed never inserts here, but if
  // any rows leaked from app testing they'd block the user delete. The FK is
  // nullable so we could null-out instead, but a wholesale delete is simpler
  // for a demo school and matches our "clean slate" intent.
  const { data: schoolUsers } = await supabase.from("users").select("id").eq("school_id", schoolId);
  await delByIds(
    "audit_log",
    "actor_id",
    (schoolUsers ?? []).map((u) => u.id)
  );
  // public.users links the auth user → school. We just unlink (delete the rows);
  // the auth.users record stays, and ensureUser() will reuse it next run.
  await delBySchool("users");
  await delByIds("school_crypto_salts", "school_id", [schoolId]);
  // Finally the school itself.
  await delByIds("schools", "id", [schoolId]);

  console.log(
    `  · wiped ${studentIds.length} students, ${classroomIds.length} classrooms, ${curriculumIds.length} curricula, school deleted`
  );
}

async function main() {
  // Idempotency: if a previous run already created the demo school, wipe its
  // data first so this run produces a clean slate. Auth users are reused.
  console.log(`→ Checking for existing demo school "${SCHOOL_NAME}"`);
  const { data: existingSchools, error: lookupErr } = await supabase
    .from("schools")
    .select("id")
    .eq("name", SCHOOL_NAME);
  if (lookupErr) throw lookupErr;
  for (const s of existingSchools ?? []) {
    await wipeDemoSchool(s.id);
  }

  console.log("→ Creating school");
  const schoolId = randomUUID();
  const { error: schoolErr } = await supabase.from("schools").insert({
    id: schoolId,
    name: SCHOOL_NAME,
    timezone: "America/Los_Angeles",
  });
  if (schoolErr) throw schoolErr;

  console.log("→ Creating per-school crypto salt");
  const salt = randomBytes(32).toString("base64");
  const { error: saltErr } = await supabase
    .from("school_crypto_salts")
    .insert({ school_id: schoolId, salt });
  if (saltErr) throw saltErr;

  console.log("→ Creating admin auth user");
  const adminAuth = await ensureUser(ADMIN_EMAIL, "admin");
  console.log("→ Creating teacher auth user");
  const teacherAuth = await ensureUser(TEACHER_EMAIL, "teacher");

  const { error: usersErr } = await supabase.from("users").upsert(
    [
      {
        id: adminAuth.id,
        school_id: schoolId,
        role: "admin",
        first_name: "Maya",
        last_name: "Admin",
        email: ADMIN_EMAIL,
        status: "active",
        privacy_acknowledged_at: new Date().toISOString(),
      },
      {
        id: teacherAuth.id,
        school_id: schoolId,
        role: "teacher",
        first_name: "Jordan",
        last_name: "Teacher",
        email: TEACHER_EMAIL,
        status: "active",
      },
    ],
    { onConflict: "id" }
  );
  if (usersErr) throw usersErr;

  console.log("→ Seeding 7 axes for the school (catalog)");
  await seedAxesForSchool(schoolId);

  console.log("→ Seeding 5 starter report templates");
  const { error: tplErr } = await supabase.rpc("seed_default_report_templates", {
    p_school_id: schoolId,
  });
  if (tplErr) throw tplErr;

  console.log("→ Creating curriculum (5 topics, 30 subtopics)");
  const curriculumId = randomUUID();
  const { error: currErr } = await supabase.from("curricula").insert({
    id: curriculumId,
    school_id: schoolId,
    name: "Montessori (default)",
    framework: "Montessori",
    description: "Default Montessori scope and sequence.",
    is_active: true,
    created_by_user_id: adminAuth.id,
  });
  if (currErr) throw currErr;

  // Capture subtopic ids so we can seed student_progress later. Keyed by
  // "TopicName / SubtopicName" for stable lookup.
  const subtopicIds = new Map<string, string>();
  for (let i = 0; i < MONTESSORI_CURRICULUM.length; i++) {
    const topic = MONTESSORI_CURRICULUM[i];
    const topicId = randomUUID();
    const { error: tErr } = await supabase.from("curriculum_topics").insert({
      id: topicId,
      curriculum_id: curriculumId,
      name: topic.name,
      sort_order: i,
      is_active: true,
    });
    if (tErr) throw tErr;
    const subRows = topic.subtopics.map((name, idx) => {
      const id = randomUUID();
      subtopicIds.set(`${topic.name} / ${name}`, id);
      return {
        id,
        topic_id: topicId,
        name,
        sort_order: idx,
        is_active: true,
        aliases: [] as string[],
      };
    });
    const { error: sErr } = await supabase.from("curriculum_subtopics").insert(subRows);
    if (sErr) throw sErr;
  }

  console.log("→ Creating classroom + teacher assignment");
  const classroomId = randomUUID();
  const { error: classErr } = await supabase.from("classrooms").insert({
    id: classroomId,
    school_id: schoolId,
    curriculum_id: curriculumId,
    name: "Cypress Room",
    code: "CYP",
  });
  if (classErr) throw classErr;

  const { error: assignErr } = await supabase.from("classroom_teacher_assignments").insert({
    classroom_id: classroomId,
    teacher_user_id: teacherAuth.id,
    classroom_role: "lead",
    start_date: new Date().toISOString().slice(0, 10),
  });
  if (assignErr) throw assignErr;

  // Deterministic guardian counts so re-runs produce identical state.
  // Index parity = "has co-parent" → first/third/fifth/... students get two guardians.
  console.log("→ Creating 10 students + enrollments + guardians");
  const studentIdsByFirst = new Map<string, string>();
  for (let i = 0; i < STUDENTS.length; i++) {
    const s = STUDENTS[i];
    const studentId = randomUUID();
    studentIdsByFirst.set(s.first, studentId);
    // Birth dates spread across 2020–2022 so ages vary between children.
    const birthYear = 2020 + (i % 3);
    const birthMonth = ((i * 5) % 12) + 1;
    const birthDay = ((i * 7) % 27) + 1;
    const birthDate = `${birthYear}-${String(birthMonth).padStart(2, "0")}-${String(birthDay).padStart(2, "0")}`;
    const { error: stErr } = await supabase.from("students").insert({
      id: studentId,
      school_id: schoolId,
      first_name: s.first,
      last_name: s.last,
      preferred_name: s.pref ?? null,
      nicknames: s.nicknames ?? [],
      birth_date: birthDate,
      sex: s.sex,
      notes: s.notes ?? null,
    });
    if (stErr) throw stErr;

    const { error: enrErr } = await supabase.from("student_classroom_enrollments").insert({
      student_id: studentId,
      classroom_id: classroomId,
      start_date: "2024-09-03",
      is_primary: true,
    });
    if (enrErr) throw enrErr;

    const guardianCount = i % 2 === 0 ? 2 : 1;
    for (let g = 0; g < guardianCount; g++) {
      const guardianId = randomUUID();
      const { error: gErr } = await supabase.from("guardians").insert({
        id: guardianId,
        school_id: schoolId,
        first_name: g === 0 ? "Parent" : "Co-Parent",
        last_name: s.last,
        email: `${s.last.toLowerCase()}.${g === 0 ? "p1" : "p2"}@example.com`,
        preferred_contact_method: "email",
      });
      if (gErr) throw gErr;
      const { error: linkErr } = await supabase.from("student_guardians").insert({
        student_id: studentId,
        guardian_id: guardianId,
        relationship: g === 0 ? "mother" : "father",
        is_primary_contact: g === 0,
        receives_reports: true,
      });
      if (linkErr) throw linkErr;
    }
  }

  // Demo profiles — each illustrates a different state of richness so the
  // demo can show the spectrum without clicking through fresh empty pages.
  const adaId = studentIdsByFirst.get("Ada");
  const bilalId = studentIdsByFirst.get("Bilal");
  const camilaId = studentIdsByFirst.get("Camila");

  if (adaId) {
    await seedFullDemoChild({
      label: "Ada Okafor (rich profile)",
      schoolId,
      studentId: adaId,
      classroomId,
      teacherUserId: teacherAuth.id,
      subtopicIds,
    });
  }
  if (bilalId) {
    await seedAxesOnlyChild({
      label: "Bilal Hassan (axes only)",
      schoolId,
      studentId: bilalId,
      teacherUserId: teacherAuth.id,
    });
  }
  if (camilaId) {
    await seedCurriculumOnlyChild({
      label: "Camila Rivera (curriculum only)",
      studentId: camilaId,
      classroomId,
      teacherUserId: teacherAuth.id,
      subtopicIds,
    });
  }

  console.log("\n✓ Seed complete.\n");
  console.log(`  Admin:    ${ADMIN_EMAIL} / ${SHARED_PASSWORD}`);
  console.log(`  Teacher:  ${TEACHER_EMAIL} / ${SHARED_PASSWORD}`);
  console.log(`  School:   ${schoolId}`);
  console.log(`  Classroom (Cypress Room): ${classroomId}`);
  if (adaId) console.log(`  Ada Okafor (rich):     ${adaId}`);
  if (bilalId) console.log(`  Bilal Hassan (axes):   ${bilalId}`);
  if (camilaId) console.log(`  Camila Rivera (curr):  ${camilaId}`);
}

/**
 * Seeds the Whole-child + Curriculum data for the rich-profile demo student
 * so the Child Detail page renders with realistic content out of the box.
 * Mirrors the shape of the prototype's mock data.
 */
async function seedFullDemoChild({
  label,
  schoolId,
  studentId,
  classroomId,
  teacherUserId,
  subtopicIds,
}: {
  label: string;
  schoolId: string;
  studentId: string;
  classroomId: string;
  teacherUserId: string;
  subtopicIds: Map<string, string>;
}) {
  console.log(`→ Seeding ${label}`);

  // The 7 axes were inserted by migration 0012 for every school; look them up.
  const { data: axisRows, error: axesErr } = await supabase
    .from("axes")
    .select("key")
    .eq("school_id", schoolId);
  if (axesErr) throw axesErr;
  const axisKeys = new Set((axisRows ?? []).map((r) => r.key));

  // Assessments — current level per axis. Mirrors the prototype's seed.
  const assessments: Array<{ axis_key: string; level: string; daysAgo: number }> = [
    { axis_key: "concentration", level: "Practicing", daysAgo: 5 },
    { axis_key: "material-progression", level: "Practicing", daysAgo: 7 },
    { axis_key: "self-correction", level: "Leading", daysAgo: 3 },
    { axis_key: "independence", level: "Deepening", daysAgo: 9 },
    { axis_key: "choice-quality", level: "Practicing", daysAgo: 11 },
    { axis_key: "error-resilience", level: "Emerging", daysAgo: 15 },
    { axis_key: "motivation", level: "Deepening", daysAgo: 6 },
  ].filter((a) => axisKeys.has(a.axis_key));

  for (const a of assessments) {
    const assessedAt = daysAgoIso(a.daysAgo);
    const { error } = await supabase.from("axis_assessments").insert({
      student_id: studentId,
      axis_key: a.axis_key,
      level: a.level,
      assessed_at: assessedAt,
      author_user_id: teacherUserId,
    });
    if (error) throw error;
  }

  // Observations — teacher notes. Mix of level moves and confirming notes.
  const observations: Array<{
    axis_key: string;
    from_level: string | null;
    to_level: string | null;
    note: string;
    daysAgo: number;
  }> = [
    {
      axis_key: "self-correction",
      from_level: "Deepening",
      to_level: "Leading",
      note: "Caught her own missing-cube on the pink tower without prompt — explained the control of error to a younger child. Bumping to Leading.",
      daysAgo: 3,
    },
    {
      axis_key: "motivation",
      from_level: "Practicing",
      to_level: "Deepening",
      note: "Sequenced 11–16 on her own initiative, asked to bring out the teen board the next day. Initiation is broadening past Sensorial.",
      daysAgo: 6,
    },
    {
      axis_key: "concentration",
      from_level: null,
      to_level: null,
      note: "27-minute work cycle on knobless cylinders. No reset. Confirms Practicing — not yet Deepening (still resets after lunch transition).",
      daysAgo: 7,
    },
    {
      axis_key: "independence",
      from_level: "Practicing",
      to_level: "Deepening",
      note: "Set up dressing frame, completed it, returned every piece, refilled the basket. No adult cue at any step.",
      daysAgo: 9,
    },
    {
      axis_key: "choice-quality",
      from_level: null,
      to_level: null,
      note: "Picked map of Africa because 'Iris was working with it yesterday.' Choice still proximity-driven — staying at Practicing for now.",
      daysAgo: 11,
    },
    {
      axis_key: "error-resilience",
      from_level: null,
      to_level: null,
      note: "Cried briefly when red rods didn't sequence — abandoned the work. Still at Emerging. Watch over the next two weeks.",
      daysAgo: 15,
    },
    {
      axis_key: "material-progression",
      from_level: "Emerging",
      to_level: "Practicing",
      note: "Bridged Sensorial → Math intentionally — used pink tower experience to anchor teen board quantity work. First cross-area connection.",
      daysAgo: 18,
    },
  ].filter((o) => axisKeys.has(o.axis_key));

  for (const o of observations) {
    const { error } = await supabase.from("whole_child_observations").insert({
      student_id: studentId,
      axis_key: o.axis_key,
      from_level: o.from_level,
      to_level: o.to_level,
      note: o.note,
      author_user_id: teacherUserId,
      created_at: daysAgoIso(o.daysAgo),
    });
    if (error) throw error;
  }

  // Curriculum progress — mirrors SUBTOPICS in the prototype mock-data,
  // mapped onto the actual subtopics we seeded above. Status order is
  // introduced (i) → practicing (p) → mastered (m); we also write history
  // so the SubtopicDetail step diagram has real dates.
  const progressRows: Array<{
    topicSlash: string;
    status: "introduced" | "practicing" | "mastered";
    introducedDaysAgo: number;
    practicingDaysAgo?: number;
    masteredDaysAgo?: number;
  }> = [
    {
      topicSlash: "Sensorial / Pink Tower",
      status: "practicing",
      introducedDaysAgo: 60,
      practicingDaysAgo: 44,
    },
    {
      topicSlash: "Sensorial / Brown Stair",
      status: "practicing",
      introducedDaysAgo: 56,
      practicingDaysAgo: 28,
    },
    { topicSlash: "Sensorial / Red Rods", status: "introduced", introducedDaysAgo: 18 },
    {
      topicSlash: "Sensorial / Sound Cylinders",
      status: "mastered",
      introducedDaysAgo: 76,
      practicingDaysAgo: 60,
      masteredDaysAgo: 22,
    },
    {
      topicSlash: "Mathematics / Number Rods",
      status: "practicing",
      introducedDaysAgo: 41,
      practicingDaysAgo: 16,
    },
    { topicSlash: "Mathematics / Spindle Box", status: "introduced", introducedDaysAgo: 14 },
    {
      topicSlash: "Language / Sandpaper Letters",
      status: "practicing",
      introducedDaysAgo: 62,
      practicingDaysAgo: 38,
    },
    { topicSlash: "Language / Movable Alphabet", status: "introduced", introducedDaysAgo: 11 },
    {
      topicSlash: "Practical Life / Pouring (water)",
      status: "mastered",
      introducedDaysAgo: 100,
      practicingDaysAgo: 84,
      masteredDaysAgo: 60,
    },
    {
      topicSlash: "Practical Life / Buttoning frame",
      status: "practicing",
      introducedDaysAgo: 54,
      practicingDaysAgo: 24,
    },
    { topicSlash: "Cultural / Puzzle Map: World", status: "introduced", introducedDaysAgo: 9 },
    {
      topicSlash: "Cultural / Land & Water Forms",
      status: "practicing",
      introducedDaysAgo: 48,
      practicingDaysAgo: 21,
    },
  ];

  for (const p of progressRows) {
    const subtopicId = subtopicIds.get(p.topicSlash);
    if (!subtopicId) {
      console.warn(`  (skip) no subtopic id for "${p.topicSlash}"`);
      continue;
    }
    const updatedAt = daysAgoIso(p.masteredDaysAgo ?? p.practicingDaysAgo ?? p.introducedDaysAgo);
    const { data: progress, error } = await supabase
      .from("student_progress")
      .insert({
        student_id: studentId,
        classroom_id: classroomId,
        curriculum_subtopic_id: subtopicId,
        status: p.status,
        updated_by_user_id: teacherUserId,
        updated_at: updatedAt,
      })
      .select("id")
      .single();
    if (error) throw error;

    // History rows so the step diagram can show first-introduced/first-practicing/first-mastered dates.
    const transitions: Array<{ prev: string | null; next: string; daysAgo: number }> = [
      { prev: null, next: "introduced", daysAgo: p.introducedDaysAgo },
    ];
    if (p.practicingDaysAgo !== undefined)
      transitions.push({ prev: "introduced", next: "practicing", daysAgo: p.practicingDaysAgo });
    if (p.masteredDaysAgo !== undefined)
      transitions.push({ prev: "practicing", next: "mastered", daysAgo: p.masteredDaysAgo });

    for (const t of transitions) {
      const { error: hErr } = await supabase.from("student_progress_history").insert({
        student_progress_id: progress.id,
        student_id: studentId,
        curriculum_subtopic_id: subtopicId,
        previous_status: t.prev,
        new_status: t.next,
        changed_by_user_id: teacherUserId,
        changed_at: daysAgoIso(t.daysAgo),
      });
      if (hErr) throw hErr;
    }
  }

  // Curriculum events — mirrors the prototype's TIMELINE. Pairs each entry
  // with a real subtopic id; entries that introduced/promoted a subtopic
  // also set transition_to_status so the activity feed badges match.
  const events: Array<{
    topicSlash: string;
    comment: string;
    transition: "introduced" | "practicing" | "mastered" | null;
    daysAgo: number;
  }> = [
    {
      topicSlash: "Sensorial / Pink Tower",
      comment: "Built it correctly on first try — third return this week.",
      transition: null,
      daysAgo: 0,
    },
    {
      topicSlash: "Mathematics / Number Rods",
      comment: "Sequenced 11 through 16 unprompted.",
      transition: null,
      daysAgo: 2,
    },
    {
      topicSlash: "Sensorial / Brown Stair",
      comment: "Paired with pink tower — noticed the missing dimension.",
      transition: null,
      daysAgo: 4,
    },
    {
      topicSlash: "Practical Life / Buttoning frame",
      comment: "Buttoned top to bottom; did not ask for help.",
      transition: null,
      daysAgo: 6,
    },
    {
      topicSlash: "Cultural / Puzzle Map: World",
      comment: "First presentation. Held the puzzle map for a long time.",
      transition: "introduced",
      daysAgo: 9,
    },
    {
      topicSlash: "Language / Movable Alphabet",
      comment: "First presentation — picked out 'cat' on her own.",
      transition: "introduced",
      daysAgo: 11,
    },
    {
      topicSlash: "Mathematics / Spindle Box",
      comment: "First presentation. Counted to 7 confidently.",
      transition: "introduced",
      daysAgo: 14,
    },
    {
      topicSlash: "Mathematics / Number Rods",
      comment: "Built 11 through 14 with quantity beads.",
      transition: "practicing",
      daysAgo: 16,
    },
    {
      topicSlash: "Sensorial / Red Rods",
      comment: "First presentation; ordered them by length.",
      transition: "introduced",
      daysAgo: 18,
    },
    {
      topicSlash: "Cultural / Land & Water Forms",
      comment: "Sorted the small objects without prompting.",
      transition: "practicing",
      daysAgo: 21,
    },
    {
      topicSlash: "Sensorial / Sound Cylinders",
      comment: "Completed all four boxes blindfolded.",
      transition: "mastered",
      daysAgo: 22,
    },
    {
      topicSlash: "Sensorial / Brown Stair",
      comment: "Returned to it three times this week.",
      transition: "practicing",
      daysAgo: 28,
    },
    {
      topicSlash: "Language / Sandpaper Letters",
      comment: "Traced 'a', 'm', 's' with strong tactile interest.",
      transition: "practicing",
      daysAgo: 38,
    },
    {
      topicSlash: "Sensorial / Pink Tower",
      comment: "Built tower independently — two tries, both correct.",
      transition: "practicing",
      daysAgo: 44,
    },
  ];

  let eventCount = 0;
  for (const ev of events) {
    const subtopicId = subtopicIds.get(ev.topicSlash);
    if (!subtopicId) {
      console.warn(`  (skip event) no subtopic id for "${ev.topicSlash}"`);
      continue;
    }
    const { error } = await supabase.from("curriculum_events").insert({
      student_id: studentId,
      subtopic_id: subtopicId,
      comment: ev.comment,
      transition_to_status: ev.transition,
      author_user_id: teacherUserId,
      created_at: daysAgoIso(ev.daysAgo),
    });
    if (error) throw error;
    eventCount++;
  }

  console.log(`  ✓ ${assessments.length} axis assessments`);
  console.log(`  ✓ ${observations.length} whole-child observations`);
  console.log(`  ✓ ${progressRows.length} curriculum progress rows`);
  console.log(`  ✓ ${eventCount} curriculum events`);
}

/**
 * Demo profile B: only axis assessments + a handful of whole-child observations,
 * no curriculum progress. Exercises the "axes filled, curriculum empty" UI state.
 */
async function seedAxesOnlyChild({
  label,
  schoolId,
  studentId,
  teacherUserId,
}: {
  label: string;
  schoolId: string;
  studentId: string;
  teacherUserId: string;
}) {
  console.log(`→ Seeding ${label}`);
  const { data: axisRows } = await supabase.from("axes").select("key").eq("school_id", schoolId);
  const axisKeys = new Set((axisRows ?? []).map((r) => r.key));

  // Earlier-stage child: mostly Emerging/Practicing.
  const assessments = [
    { axis_key: "concentration", level: "Emerging", daysAgo: 12 },
    { axis_key: "material-progression", level: "Emerging", daysAgo: 14 },
    { axis_key: "self-correction", level: "Emerging", daysAgo: 9 },
    { axis_key: "independence", level: "Practicing", daysAgo: 5 },
    { axis_key: "choice-quality", level: "Emerging", daysAgo: 18 },
    { axis_key: "error-resilience", level: "Emerging", daysAgo: 21 },
    { axis_key: "motivation", level: "Practicing", daysAgo: 8 },
  ].filter((a) => axisKeys.has(a.axis_key));

  for (const a of assessments) {
    const { error } = await supabase.from("axis_assessments").insert({
      student_id: studentId,
      axis_key: a.axis_key,
      level: a.level,
      assessed_at: daysAgoIso(a.daysAgo),
      author_user_id: teacherUserId,
    });
    if (error) throw error;
  }

  const observations = [
    {
      axis_key: "independence",
      from_level: "Emerging",
      to_level: "Practicing",
      note: "Returned the dressing frame to the shelf without prompting today — first time.",
      daysAgo: 5,
    },
    {
      axis_key: "motivation",
      from_level: "Emerging",
      to_level: "Practicing",
      note: "Asked unprompted to revisit the brown stair after lunch.",
      daysAgo: 8,
    },
    {
      axis_key: "self-correction",
      from_level: null,
      to_level: null,
      note: "Still requires adult to point out mismatches on the colour tablets — staying at Emerging for now.",
      daysAgo: 9,
    },
  ].filter((o) => axisKeys.has(o.axis_key));

  for (const o of observations) {
    const { error } = await supabase.from("whole_child_observations").insert({
      student_id: studentId,
      axis_key: o.axis_key,
      from_level: o.from_level,
      to_level: o.to_level,
      note: o.note,
      author_user_id: teacherUserId,
      created_at: daysAgoIso(o.daysAgo),
    });
    if (error) throw error;
  }

  console.log(`  ✓ ${assessments.length} axis assessments`);
  console.log(`  ✓ ${observations.length} whole-child observations`);
}

/**
 * Demo profile C: only curriculum progress + events, no axis assessments.
 * Exercises the "curriculum filled, whole-child empty" UI state.
 */
async function seedCurriculumOnlyChild({
  label,
  studentId,
  classroomId,
  teacherUserId,
  subtopicIds,
}: {
  label: string;
  studentId: string;
  classroomId: string;
  teacherUserId: string;
  subtopicIds: Map<string, string>;
}) {
  console.log(`→ Seeding ${label}`);

  const progressRows: Array<{
    topicSlash: string;
    status: "introduced" | "practicing" | "mastered";
    introducedDaysAgo: number;
    practicingDaysAgo?: number;
    masteredDaysAgo?: number;
  }> = [
    {
      topicSlash: "Practical Life / Pouring (water)",
      status: "mastered",
      introducedDaysAgo: 90,
      practicingDaysAgo: 70,
      masteredDaysAgo: 40,
    },
    {
      topicSlash: "Practical Life / Spooning beans",
      status: "practicing",
      introducedDaysAgo: 45,
      practicingDaysAgo: 18,
    },
    { topicSlash: "Sensorial / Pink Tower", status: "introduced", introducedDaysAgo: 12 },
    { topicSlash: "Language / Sandpaper Letters", status: "introduced", introducedDaysAgo: 6 },
  ];

  let progressCount = 0;
  const progressIds = new Map<string, string>();
  for (const p of progressRows) {
    const subtopicId = subtopicIds.get(p.topicSlash);
    if (!subtopicId) continue;
    const updatedAt = daysAgoIso(p.masteredDaysAgo ?? p.practicingDaysAgo ?? p.introducedDaysAgo);
    const { data: progress, error } = await supabase
      .from("student_progress")
      .insert({
        student_id: studentId,
        classroom_id: classroomId,
        curriculum_subtopic_id: subtopicId,
        status: p.status,
        updated_by_user_id: teacherUserId,
        updated_at: updatedAt,
      })
      .select("id")
      .single();
    if (error) throw error;
    progressIds.set(p.topicSlash, progress.id);
    progressCount++;

    const transitions: Array<{ prev: string | null; next: string; daysAgo: number }> = [
      { prev: null, next: "introduced", daysAgo: p.introducedDaysAgo },
    ];
    if (p.practicingDaysAgo !== undefined)
      transitions.push({ prev: "introduced", next: "practicing", daysAgo: p.practicingDaysAgo });
    if (p.masteredDaysAgo !== undefined)
      transitions.push({ prev: "practicing", next: "mastered", daysAgo: p.masteredDaysAgo });
    for (const t of transitions) {
      const { error: hErr } = await supabase.from("student_progress_history").insert({
        student_progress_id: progress.id,
        student_id: studentId,
        curriculum_subtopic_id: subtopicId,
        previous_status: t.prev,
        new_status: t.next,
        changed_by_user_id: teacherUserId,
        changed_at: daysAgoIso(t.daysAgo),
      });
      if (hErr) throw hErr;
    }
  }

  // A few curriculum events that match the progress rows above.
  const events = [
    {
      topicSlash: "Practical Life / Pouring (water)",
      comment: "Poured water between two pitchers without spilling — third time this week.",
      transition: null,
      daysAgo: 2,
    },
    {
      topicSlash: "Practical Life / Spooning beans",
      comment: "Worked through full set of beans without losing focus.",
      transition: null,
      daysAgo: 4,
    },
    {
      topicSlash: "Sensorial / Pink Tower",
      comment: "First presentation — built three of the cubes.",
      transition: "introduced" as const,
      daysAgo: 12,
    },
    {
      topicSlash: "Language / Sandpaper Letters",
      comment: "Traced 'm' and 's' with strong tactile interest.",
      transition: "introduced" as const,
      daysAgo: 6,
    },
  ];

  let eventCount = 0;
  for (const ev of events) {
    const subtopicId = subtopicIds.get(ev.topicSlash);
    if (!subtopicId) continue;
    const { error } = await supabase.from("curriculum_events").insert({
      student_id: studentId,
      subtopic_id: subtopicId,
      comment: ev.comment,
      transition_to_status: ev.transition,
      author_user_id: teacherUserId,
      created_at: daysAgoIso(ev.daysAgo),
    });
    if (error) throw error;
    eventCount++;
  }

  console.log(`  ✓ ${progressCount} progress rows`);
  console.log(`  ✓ ${eventCount} curriculum events`);
}

/**
 * Inserts the 7-axis catalog for a school. Migration 0012 also seeds these
 * via `cross join schools`, but only for schools that existed when the
 * migration ran. Schools created later (by this seed, or in production by
 * an admin onboarding flow) need their own copy.
 */
async function seedAxesForSchool(schoolId: string) {
  const AXES_SEED = [
    {
      key: "concentration",
      label: "Concentration",
      sort_order: 0,
      descriptors: {
        Emerging: "Brief, needs adult to redirect.",
        Practicing: "Sustained on familiar work; some resets after distraction.",
        Deepening: "Holds focus through full work cycle, resists interruption.",
        Leading: "Returns to a chosen work over days; protects own focus.",
      },
    },
    {
      key: "material-progression",
      label: "Material Progression",
      sort_order: 1,
      descriptors: {
        Emerging: "Repeats first presentation; new materials feel uncertain.",
        Practicing: "Moves through familiar shelf at her own pace.",
        Deepening: "Builds on prior work; seeks logical next step.",
        Leading: "Bridges areas — uses Sensorial to inform Math choices.",
      },
    },
    {
      key: "self-correction",
      label: "Self-Correction",
      sort_order: 2,
      descriptors: {
        Emerging: "Notices error only when adult points it out.",
        Practicing: "Catches obvious mismatches; sometimes asks for help.",
        Deepening: "Finds and fixes error in same work cycle.",
        Leading: "Uses material's own control of error fluently; explains it.",
      },
    },
    {
      key: "independence",
      label: "Independence",
      sort_order: 3,
      descriptors: {
        Emerging: "Looks to adult for each step.",
        Practicing: "Sets up familiar work; returns it to the shelf.",
        Deepening: "Chooses, completes, and restores work without prompting.",
        Leading: "Helps a younger child set up their own work.",
      },
    },
    {
      key: "choice-quality",
      label: "Choice Quality",
      sort_order: 4,
      descriptors: {
        Emerging: "Chooses by proximity or peer; abandons quickly.",
        Practicing: "Picks work she knows well; occasional stretch choice.",
        Deepening: "Chooses with intent — names goal before starting.",
        Leading: "Plans a work cycle across multiple materials.",
      },
    },
    {
      key: "error-resilience",
      label: "Error Resilience",
      sort_order: 5,
      descriptors: {
        Emerging: "Frustrated by mistakes; may abandon the work.",
        Practicing: "Tries again with encouragement.",
        Deepening: "Retries unprompted; treats error as information.",
        Leading: "Welcomes hard work; chooses materials at the edge of skill.",
      },
    },
    {
      key: "motivation",
      label: "Motivation",
      sort_order: 6,
      descriptors: {
        Emerging: "Works when adult invites; rarely initiates.",
        Practicing: "Initiates work she enjoys; flat on stretch tasks.",
        Deepening: "Initiates broadly; curious about new presentations.",
        Leading: "Articulates own goals; pursues work across days.",
      },
    },
  ];

  const rows = AXES_SEED.map((a) => ({
    school_id: schoolId,
    key: a.key,
    label: a.label,
    descriptors: a.descriptors,
    sort_order: a.sort_order,
    is_active: true,
  }));
  const { error } = await supabase.from("axes").upsert(rows, { onConflict: "school_id,key" });
  if (error) throw error;
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
