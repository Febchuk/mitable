/**
 * Seed Montessori demo USERS (admin + teacher) + assign teacher to a classroom.
 * Creates Supabase Auth users via service role and inserts matching `users`
 * rows scoped to the demo Montessori org. Idempotent.
 */
import { createClient } from "@supabase/supabase-js";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and } from "drizzle-orm";
import "dotenv/config";

import * as schema from "../db/schema/index.js";

const ORG_NAME = "The Learning Place";
const ADMIN_EMAIL = "admin@thelearningplace.test";
const TEACHER_EMAIL = "teacher@thelearningplace.test";
const PASSWORD = "Montessori123!";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureAuthUser(email: string): Promise<string> {
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers({
    perPage: 1000,
  });
  if (listErr) throw listErr;
  const existing = list.users.find((u) => u.email === email);
  if (existing) {
    console.log(`  auth user exists: ${email} (${existing.id})`);
    return existing.id;
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  console.log(`  created auth user: ${email} (${data.user!.id})`);
  return data.user!.id;
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!connectionString) throw new Error("Missing DATABASE_URL");
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });

  try {
    const [org] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.name, ORG_NAME))
      .limit(1);
    if (!org) throw new Error(`Org "${ORG_NAME}" not found — run seed:montessori first`);
    console.log(`Org: ${org.name} (${org.id})`);

    console.log("\nProvisioning admin user…");
    const adminAuthId = await ensureAuthUser(ADMIN_EMAIL);
    const [existingAdmin] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, adminAuthId))
      .limit(1);
    if (!existingAdmin) {
      await db.insert(schema.users).values({
        id: adminAuthId,
        organizationId: org.id,
        email: ADMIN_EMAIL,
        firstName: "Maria",
        lastName: "Director",
        role: "admin",
        status: "active",
      });
      console.log(`  inserted users row for admin`);
    } else {
      console.log(`  users row exists for admin`);
    }

    console.log("\nProvisioning teacher user…");
    const teacherAuthId = await ensureAuthUser(TEACHER_EMAIL);
    const [existingTeacher] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, teacherAuthId))
      .limit(1);
    if (!existingTeacher) {
      await db.insert(schema.users).values({
        id: teacherAuthId,
        organizationId: org.id,
        email: TEACHER_EMAIL,
        firstName: "Sarah",
        lastName: "Guide",
        role: "employee",
        status: "active",
      });
      console.log(`  inserted users row for teacher`);
    } else {
      console.log(`  users row exists for teacher`);
    }

    // Assign teacher to the Primary Classroom for this org
    const [primary] = await db
      .select()
      .from(schema.montessoriClassrooms)
      .where(
        and(
          eq(schema.montessoriClassrooms.organizationId, org.id),
          eq(schema.montessoriClassrooms.name, "Primary Classroom")
        )
      )
      .limit(1);
    if (primary) {
      await db
        .update(schema.montessoriClassrooms)
        .set({ teacherId: teacherAuthId })
        .where(eq(schema.montessoriClassrooms.id, primary.id));
      console.log(`\nAssigned teacher to Primary Classroom`);
    }

    console.log("\nDone. Sign in with:");
    console.log(`  admin:   ${ADMIN_EMAIL} / ${PASSWORD}`);
    console.log(`  teacher: ${TEACHER_EMAIL} / ${PASSWORD}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
