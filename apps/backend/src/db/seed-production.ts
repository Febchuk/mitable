import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { reset } from "drizzle-seed";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { eq } from "drizzle-orm";
import * as schema from "./schema/index";

dotenv.config();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const db = drizzle(pool, { schema });

// Supabase client for creating auth users
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Configuration for Lorikeet
const CONFIG = {
  orgName: process.env.SEED_ORG_NAME || "Lorikeet",
  orgDomain: process.env.SEED_ORG_DOMAIN || "lorikeetcx.ai",
  adminEmail: process.env.SEED_ADMIN_EMAIL || "adva@lorikeetcx.ai",
  adminPassword: process.env.SEED_ADMIN_PASSWORD || "Password123!",
};

// Standard password for all test accounts
const TEST_PASSWORD = "Password123!";

// ============================================
// Seed Functions
// ============================================

async function seedOrganization() {
  console.log("📦 Seeding organization...");

  const [organization] = await db
    .insert(schema.organizations)
    .values({
      name: CONFIG.orgName,
      domain: CONFIG.orgDomain,
      settings: {
        features: {
          aiAgents: true,
          multiChannel: true,
          analytics: true,
          nudges: true,
          roadmaps: true,
        },
        theme: "dark",
        security: {
          enforceSSO: false,
          requireMFA: false,
        },
      },
    })
    .returning();

  console.log(`✅ Created organization: ${organization.name}`);
  return organization;
}

async function seedUsers(organizationId: string) {
  console.log("👥 Seeding Lorikeet users (3 total)...");

  const today = new Date();
  const getDate = (daysAgo: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().split("T")[0];
  };

  // Lorikeet team - minimal seed
  const userData = [
    // Admin User
    {
      email: CONFIG.adminEmail,
      firstName: "Adva",
      lastName: "Milshtein",
      role: "admin",
      avatarUrl: "https://i.pravatar.cc/150?img=1",
      currentWeek: null,
      startDate: null,
      status: "active",
    },
    // Forward Deployed Engineers
    {
      email: "dylank@lorikeetcx.ai",
      firstName: "Dylan",
      lastName: "Klein",
      role: "employee",
      avatarUrl: "https://i.pravatar.cc/150?img=14",
      currentWeek: 1,
      startDate: getDate(7),
      status: "active",
    },
    {
      email: "jonah@lorikeetcx.ai",
      firstName: "Jonah",
      lastName: "Epstein",
      role: "employee",
      avatarUrl: "https://i.pravatar.cc/150?img=15",
      currentWeek: 1,
      startDate: getDate(7),
      status: "active",
    },
  ];

  // Clear existing Supabase Auth users (idempotent)
  console.log("🗑️  Clearing existing Supabase Auth users...");
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  if (existingUsers?.users) {
    for (const user of existingUsers.users) {
      await supabase.auth.admin.deleteUser(user.id);
    }
  }

  // Create Supabase Auth users (database profiles will be created by trigger)
  const users = [];

  for (const user of userData) {
    console.log(`Creating auth user for ${user.email}...`);

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: user.email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: {
        first_name: user.firstName,
        last_name: user.lastName,
        organization_id: organizationId,
      },
    });

    if (authError) {
      console.error(`Failed to create auth user for ${user.email}:`, authError);
      continue;
    }

    if (!authData.user) {
      console.error(`No user data returned for ${user.email}`);
      continue;
    }

    // Wait for trigger to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Query the created user profile
    const [dbUser] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, authData.user.id))
      .limit(1);

    if (dbUser) {
      // Update additional fields
      const [updatedUser] = await db
        .update(schema.users)
        .set({
          role: user.role as "admin" | "employee",
          avatarUrl: user.avatarUrl,
          currentWeek: user.currentWeek,
          startDate: user.startDate,
        })
        .where(eq(schema.users.id, authData.user.id))
        .returning();

      users.push(updatedUser);
    } else {
      console.error(`User profile not found for ${user.email} after trigger`);
    }
  }

  console.log(`✅ Created ${users.length} users with Supabase Auth accounts`);
  console.log(`🔑 All accounts use password: ${TEST_PASSWORD}`);
  return users;
}

async function seedIntegrations(organizationId: string) {
  console.log("🔌 Seeding integrations...");

  const integrations = await db
    .insert(schema.integrations)
    .values([
      {
        organizationId,
        provider: "slack",
        status: "disconnected",
        accessTokenEncrypted: "",
        metadata: {},
      },
      {
        organizationId,
        provider: "notion",
        status: "disconnected",
        accessTokenEncrypted: "",
        metadata: {},
      },
      {
        organizationId,
        provider: "github",
        status: "disconnected",
        accessTokenEncrypted: "",
        metadata: {},
      },
      {
        organizationId,
        provider: "google-drive",
        status: "disconnected",
        accessTokenEncrypted: "",
        metadata: {},
      },
    ])
    .returning();

  console.log(`✅ Created ${integrations.length} integration records (all disconnected)`);
  return integrations;
}

// ============================================
// Main Seed Function
// ============================================

async function main() {
  console.log("🌱 Starting Lorikeet production database seed...");
  console.log(`📍 Organization: ${CONFIG.orgName} (${CONFIG.orgDomain})`);
  console.log(`👤 Admin: ${CONFIG.adminEmail}`);
  console.log("");

  try {
    // Clear existing data (idempotent)
    console.log("🗑️  Clearing existing data...");
    await reset(db, schema);

    // Seed data in order (minimal - org, users, integrations only)
    const organization = await seedOrganization();
    const users = await seedUsers(organization.id);
    const integrations = await seedIntegrations(organization.id);

    console.log("");
    console.log("✅ Lorikeet production seed completed successfully!");
    console.log("");
    console.log("📊 Summary:");
    console.log(`   Organization: ${organization.name}`);
    console.log(`   Users: ${users.length} (1 admin + ${users.length - 1} employees)`);
    console.log(`   Integrations: ${integrations.length} (all disconnected)`);
    console.log("");
    console.log("🔐 Login Credentials:");
    console.log(`   Admin: ${CONFIG.adminEmail}`);
    console.log(`   Employees: dylank@lorikeetcx.ai, jonah@lorikeetcx.ai`);
    console.log(`   Password: ${TEST_PASSWORD}`);
  } catch (error) {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
