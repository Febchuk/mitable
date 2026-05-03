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

const STUDENTS: Array<{ first: string; last: string; nicknames?: string[]; pref?: string }> = [
  { first: "Ada", last: "Okafor" },
  { first: "Bilal", last: "Hassan", nicknames: ["Billy"] },
  { first: "Camila", last: "Rivera", pref: "Cami" },
  { first: "Daiyu", last: "Chen" },
  { first: "Eitan", last: "Levi" },
  { first: "Farida", last: "Ndiaye" },
  { first: "Gus", last: "Hansen" },
  { first: "Hina", last: "Shah" },
  { first: "Idris", last: "Jallow" },
  { first: "Lina", last: "Petrov" },
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

async function main() {
  console.log("→ Creating school");
  const schoolId = randomUUID();
  const { error: schoolErr } = await supabase.from("schools").insert({
    id: schoolId,
    name: "Mitable Demo Montessori",
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

  console.log("→ Creating 10 students + enrollments + guardians");
  let demoStudentId: string | null = null;
  for (const s of STUDENTS) {
    const studentId = randomUUID();
    if (s.first === "Ada") demoStudentId = studentId;
    const { error: stErr } = await supabase.from("students").insert({
      id: studentId,
      school_id: schoolId,
      first_name: s.first,
      last_name: s.last,
      preferred_name: s.pref ?? null,
      nicknames: s.nicknames ?? [],
    });
    if (stErr) throw stErr;

    const { error: enrErr } = await supabase.from("student_classroom_enrollments").insert({
      student_id: studentId,
      classroom_id: classroomId,
      start_date: new Date().toISOString().slice(0, 10),
      is_primary: true,
    });
    if (enrErr) throw enrErr;

    const guardianCount = 1 + (Math.random() < 0.5 ? 1 : 0);
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

  if (demoStudentId) {
    await seedDemoChildData({
      schoolId,
      studentId: demoStudentId,
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
  if (demoStudentId) console.log(`  Demo student (Ada Okafor): ${demoStudentId}`);
}

/**
 * Seeds the Whole-child + Curriculum data for the demo student so the Child
 * Detail page renders with realistic content out of the box. Mirrors the shape
 * of the prototype's mock data.
 */
async function seedDemoChildData({
  schoolId,
  studentId,
  classroomId,
  teacherUserId,
  subtopicIds,
}: {
  schoolId: string;
  studentId: string;
  classroomId: string;
  teacherUserId: string;
  subtopicIds: Map<string, string>;
}) {
  console.log("→ Seeding whole-child assessments + observations for Ada");

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

  console.log(`  ✓ ${assessments.length} axis assessments`);
  console.log(`  ✓ ${observations.length} whole-child observations`);
  console.log(`  ✓ ${progressRows.length} curriculum progress rows`);
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
