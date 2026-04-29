/**
 * Seed: The Learning Place — demo Montessori organization.
 *
 * Idempotent: safe to re-run. Wipes and re-seeds the montessori_* tables
 * for a single organization (default "The Learning Place"). Does NOT touch
 * users, organizations beyond the demo one, or any non-Montessori table.
 *
 * Run with:
 *   npm run seed:montessori --workspace=apps/backend
 *
 * Optional env:
 *   SEED_ORG_NAME — override the demo organization name (default
 *                   "The Learning Place"). The org is created if missing.
 *
 * User accounts are NOT created here. Sign in via the Montessori app's
 * /login flow once your Supabase user is associated with this org.
 */

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import "dotenv/config";

import * as schema from "../db/schema/index.js";

const ORG_NAME = process.env.SEED_ORG_NAME ?? "The Learning Place";

// ─── Curriculum ──────────────────────────────────────────────────────

interface DomainSeed {
    name: string;
    level: "primary" | "elementary";
    hue: number;
    topics: string[];
}

const PRIMARY_DOMAINS: DomainSeed[] = [
    {
        name: "Practical Life",
        level: "primary",
        hue: 28,
        topics: ["Pouring Water", "Sweeping", "Dressing Frames", "Care of Plants", "Hand Washing"],
    },
    {
        name: "Sensorial",
        level: "primary",
        hue: 340,
        topics: [
            "Pink Tower",
            "Brown Stair",
            "Red Rods",
            "Colour Tablets",
            "Geometric Solids",
            "Binomial Cube",
        ],
    },
    {
        name: "Language",
        level: "primary",
        hue: 200,
        topics: [
            "Sandpaper Letters",
            "Moveable Alphabet",
            "Phonetic Object Box",
            "Three Part Cards",
            "Sentence Analysis",
        ],
    },
    {
        name: "Mathematics",
        level: "primary",
        hue: 150,
        topics: [
            "Number Rods",
            "Sandpaper Numbers",
            "Spindle Box",
            "Golden Beads",
            "Stamp Game",
            "Snake Game",
        ],
    },
    {
        name: "Cultural",
        level: "primary",
        hue: 90,
        topics: [
            "Continent Globe",
            "Puzzle Maps",
            "Parts of a Plant",
            "Parts of an Animal",
            "Calendar Work",
        ],
    },
];

const ELEMENTARY_DOMAINS: DomainSeed[] = [
    {
        name: "Language Arts",
        level: "elementary",
        hue: 200,
        topics: [
            "Reading Analysis",
            "Creative Writing",
            "Grammar Symbols",
            "Sentence Analysis",
            "Research Skills",
        ],
    },
    {
        name: "Mathematics",
        level: "elementary",
        hue: 150,
        topics: [
            "Bead Chains",
            "Long Division",
            "Fraction Work",
            "Decimal Board",
            "Geometry Cabinet",
        ],
    },
    {
        name: "Geometry",
        level: "elementary",
        hue: 340,
        topics: ["Triangle Box", "Constructive Triangles", "Area of Figures", "Volume Work"],
    },
    {
        name: "History & Geography",
        level: "elementary",
        hue: 28,
        topics: ["Timeline of Life", "Clock of Eras", "Land and Water Forms", "Political Maps"],
    },
    {
        name: "Science",
        level: "elementary",
        hue: 90,
        topics: [
            "Classification of Living Things",
            "Experiments with Air",
            "Experiments with Water",
            "Plant Biology",
        ],
    },
];

// ─── Roster ──────────────────────────────────────────────────────────

const PRIMARY_STUDENTS: Array<{ name: string; age: number }> = [
    { name: "Amara", age: 5 },
    { name: "Kofi", age: 4 },
    { name: "Temi", age: 6 },
    { name: "Zara", age: 3 },
    { name: "Emeka", age: 5 },
    { name: "Aisha", age: 4 },
    { name: "Liam", age: 6 },
    { name: "Nadia", age: 4 },
];

const ELEMENTARY_STUDENTS: Array<{ name: string; age: number }> = [
    { name: "Jude", age: 8 },
    { name: "Fatima", age: 10 },
    { name: "Obinna", age: 7 },
    { name: "Sade", age: 11 },
    { name: "Chidi", age: 9 },
    { name: "Yemi", age: 8 },
];

// ─── Deterministic "spread" for demo observations ────────────────────

function hashStr(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = (h ^ s.charCodeAt(i)) * 16777619;
    return Math.abs(h >>> 0);
}

type ObsLevel = "introduced" | "practising" | "mastered";

function pseudoLevel(studentName: string, topicName: string): ObsLevel | null {
    const h = hashStr(studentName + "|" + topicName) % 10;
    if (h < 3) return null; // 30% empty cells — a real classroom mid-term
    if (h < 5) return "introduced";
    if (h < 8) return "practising";
    return "mastered";
}

// ─── Seed runner ─────────────────────────────────────────────────────

async function main() {
    if (!process.env.DATABASE_URL) {
        console.error("DATABASE_URL is not set. Aborting.");
        process.exit(1);
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes("sslmode=disable")
            ? undefined
            : { rejectUnauthorized: false },
    });
    const db = drizzle(pool, { schema });

    try {
        console.log(`Seeding Montessori demo data for org "${ORG_NAME}"…\n`);

        // 1. Find or create the organization.
        let [org] = await db
            .select()
            .from(schema.organizations)
            .where(eq(schema.organizations.name, ORG_NAME))
            .limit(1);

        if (!org) {
            console.log(`Organization "${ORG_NAME}" not found — creating.`);
            const inserted = await db
                .insert(schema.organizations)
                .values({ name: ORG_NAME, settings: {} })
                .returning();
            org = inserted[0]!;
        } else {
            console.log(`Found organization "${ORG_NAME}" (${org.id}).`);
        }

        const orgId = org.id;

        // 2. Wipe Montessori rows scoped to this org. Cascade FKs handle
        //    students/topics/observations/etc. when we drop classrooms /
        //    domains, but we delete bottom-up explicitly to be defensive.
        console.log("Wiping existing Montessori rows for this org…");
        await db
            .delete(schema.montessoriObservations)
            .where(eq(schema.montessoriObservations.organizationId, orgId));
        await db
            .delete(schema.montessoriAttendance)
            .where(eq(schema.montessoriAttendance.organizationId, orgId));
        await db
            .delete(schema.montessoriReports)
            .where(eq(schema.montessoriReports.organizationId, orgId));
        await db
            .delete(schema.montessoriReportTemplates)
            .where(eq(schema.montessoriReportTemplates.organizationId, orgId));
        // Agent messages cascade-delete from their threads:
        await db
            .delete(schema.montessoriAgentThreads)
            .where(eq(schema.montessoriAgentThreads.organizationId, orgId));
        await db
            .delete(schema.montessoriStudents)
            .where(eq(schema.montessoriStudents.organizationId, orgId));
        await db
            .delete(schema.montessoriClassrooms)
            .where(eq(schema.montessoriClassrooms.organizationId, orgId));
        await db
            .delete(schema.montessoriTopics)
            .where(eq(schema.montessoriTopics.organizationId, orgId));
        await db
            .delete(schema.montessoriDomains)
            .where(eq(schema.montessoriDomains.organizationId, orgId));

        // 3. Classrooms
        console.log("Inserting classrooms…");
        const [primaryClass] = await db
            .insert(schema.montessoriClassrooms)
            .values({
                organizationId: orgId,
                name: "Primary Classroom",
                level: "primary",
                ageRange: "3–6",
            })
            .returning();
        const [elementaryClass] = await db
            .insert(schema.montessoriClassrooms)
            .values({
                organizationId: orgId,
                name: "Elementary Classroom",
                level: "elementary",
                ageRange: "6–12",
            })
            .returning();

        // 4. Students
        console.log("Inserting students…");
        const studentRows = await db
            .insert(schema.montessoriStudents)
            .values([
                ...PRIMARY_STUDENTS.map((s) => ({
                    organizationId: orgId,
                    classroomId: primaryClass!.id,
                    name: s.name,
                    age: s.age,
                })),
                ...ELEMENTARY_STUDENTS.map((s) => ({
                    organizationId: orgId,
                    classroomId: elementaryClass!.id,
                    name: s.name,
                    age: s.age,
                })),
            ])
            .returning();

        // 5. Curriculum: domains + topics
        console.log("Inserting curriculum…");
        const allDomainSeeds = [...PRIMARY_DOMAINS, ...ELEMENTARY_DOMAINS];
        const topicRows: Array<{ id: string; name: string; level: string }> = [];
        let domainSortOrder = 0;
        for (const seed of allDomainSeeds) {
            const [domain] = await db
                .insert(schema.montessoriDomains)
                .values({
                    organizationId: orgId,
                    name: seed.name,
                    level: seed.level,
                    colorHue: seed.hue,
                    sortOrder: domainSortOrder++,
                })
                .returning();
            let topicSortOrder = 0;
            for (const topicName of seed.topics) {
                const [topic] = await db
                    .insert(schema.montessoriTopics)
                    .values({
                        organizationId: orgId,
                        domainId: domain!.id,
                        name: topicName,
                        level: seed.level,
                        sortOrder: topicSortOrder++,
                    })
                    .returning();
                topicRows.push({ id: topic!.id, name: topic!.name, level: topic!.level });
            }
        }

        // 6. Observations — deterministic spread for demo realism
        console.log("Inserting demo observations…");
        const observationsToInsert: Array<{
            organizationId: string;
            studentId: string;
            topicId: string;
            level: "introduced" | "practising" | "mastered";
            inputMethod: string;
            authorType: string;
        }> = [];
        for (const student of studentRows) {
            const studentLevel: "primary" | "elementary" =
                student.classroomId === primaryClass!.id ? "primary" : "elementary";
            for (const topic of topicRows) {
                if (topic.level !== studentLevel && topic.level !== "both") continue;
                const lv = pseudoLevel(student.name, topic.name);
                if (!lv) continue;
                observationsToInsert.push({
                    organizationId: orgId,
                    studentId: student.id,
                    topicId: topic.id,
                    level: lv,
                    inputMethod: "grid",
                    authorType: "teacher",
                });
            }
        }
        if (observationsToInsert.length) {
            // Chunk inserts to keep parameters under postgres' limit.
            const CHUNK = 500;
            for (let i = 0; i < observationsToInsert.length; i += CHUNK) {
                await db
                    .insert(schema.montessoriObservations)
                    .values(observationsToInsert.slice(i, i + CHUNK));
            }
        }

        // 7. Attendance — last 3 weekdays, mostly present
        console.log("Inserting demo attendance…");
        const today = new Date();
        const dates: string[] = [];
        for (let offset = 1; offset <= 5 && dates.length < 5; offset++) {
            const d = new Date(today);
            d.setDate(d.getDate() - offset);
            const day = d.getDay();
            if (day === 0 || day === 6) continue; // skip weekends
            dates.push(d.toISOString().slice(0, 10));
        }
        const attendanceToInsert: Array<{
            organizationId: string;
            studentId: string;
            date: string;
            status: "present" | "absent";
        }> = [];
        for (const student of studentRows) {
            for (const date of dates) {
                const absent = (hashStr(student.id + date) % 10) === 0; // ~10% absence
                attendanceToInsert.push({
                    organizationId: orgId,
                    studentId: student.id,
                    date,
                    status: absent ? "absent" : "present",
                });
            }
        }
        if (attendanceToInsert.length) {
            await db.insert(schema.montessoriAttendance).values(attendanceToInsert);
        }

        console.log("\nDone.");
        console.log(`  org:           ${ORG_NAME} (${orgId})`);
        console.log(`  classrooms:    2`);
        console.log(`  students:      ${studentRows.length}`);
        console.log(`  topics:        ${topicRows.length}`);
        console.log(`  observations:  ${observationsToInsert.length}`);
        console.log(`  attendance:    ${attendanceToInsert.length}`);
    } catch (err) {
        console.error("Seed failed:", err);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
