/**
 * Seed Dashboard Data — Additive script for Lorikeet org
 *
 * Inserts 14 days of mock userDailyActivities + activityBlocks for existing Lorikeet users.
 * Safe to re-run: uses ON CONFLICT DO NOTHING on the unique constraint.
 *
 * Usage: npx tsx apps/backend/src/scripts/seed-dashboard-data.ts
 */
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and } from "drizzle-orm";
import dotenv from "dotenv";
import * as schema from "../db/schema/index";

dotenv.config({ path: new URL("../../.env", import.meta.url).pathname });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
const db = drizzle(pool, { schema });

// ── Configuration ──────────────────────────────────────────

const CUSTOMERS = ["Acme Corp", "Nike Inc", "Stripe"];
const TOPICS = [
  "API Migration",
  "Dashboard Redesign",
  "Auth System",
  "Mobile App",
  "CI/CD Pipeline",
  "Design System",
];

const APPS = {
  development: ["VS Code", "Terminal", "GitHub"],
  communication: ["Slack", "Gmail", "Zoom"],
  meeting: ["Zoom", "Google Meet"],
  design: ["Figma", "Sketch"],
  research: ["Chrome", "Notion"],
  planning: ["Notion", "Linear"],
  review: ["GitHub", "VS Code"],
  documentation: ["Notion", "Google Docs"],
};

interface RoleProfile {
  categories: Record<string, number>; // category → weight (0-1)
  customerWeights: number[]; // weights for [Acme, Nike, Stripe, Internal]
  workMinRange: [number, number];
  meetingMinRange: [number, number];
}

const ROLE_PROFILES: Record<string, RoleProfile> = {
  engineer: {
    categories: {
      development: 0.5,
      review: 0.15,
      communication: 0.1,
      meeting: 0.1,
      research: 0.1,
      documentation: 0.05,
    },
    customerWeights: [0.3, 0.2, 0.15, 0.35],
    workMinRange: [240, 360],
    meetingMinRange: [30, 90],
  },
  pm: {
    categories: {
      planning: 0.3,
      communication: 0.25,
      meeting: 0.25,
      documentation: 0.1,
      review: 0.1,
    },
    customerWeights: [0.25, 0.25, 0.25, 0.25],
    workMinRange: [180, 300],
    meetingMinRange: [90, 180],
  },
  customer_success: {
    categories: {
      communication: 0.35,
      meeting: 0.3,
      documentation: 0.15,
      planning: 0.1,
      research: 0.1,
    },
    customerWeights: [0.35, 0.3, 0.25, 0.1],
    workMinRange: [150, 270],
    meetingMinRange: [120, 210],
  },
  sales: {
    categories: {
      meeting: 0.4,
      communication: 0.3,
      planning: 0.15,
      research: 0.1,
      documentation: 0.05,
    },
    customerWeights: [0.3, 0.35, 0.25, 0.1],
    workMinRange: [120, 240],
    meetingMinRange: [150, 240],
  },
  design: {
    categories: {
      design: 0.45,
      review: 0.2,
      communication: 0.1,
      meeting: 0.1,
      research: 0.1,
      documentation: 0.05,
    },
    customerWeights: [0.3, 0.25, 0.1, 0.35],
    workMinRange: [240, 360],
    meetingMinRange: [30, 90],
  },
  devops: {
    categories: {
      development: 0.4,
      review: 0.15,
      research: 0.15,
      documentation: 0.1,
      meeting: 0.1,
      communication: 0.1,
    },
    customerWeights: [0.1, 0.05, 0.05, 0.8],
    workMinRange: [270, 390],
    meetingMinRange: [20, 60],
  },
};

// Map user first names to role profiles
const USER_ROLE_MAP: Record<string, string> = {
  // Lorikeet users
  Emily: "engineer",
  Alex: "engineer",
  Jordan: "engineer",
  Priya: "engineer",
  Carlos: "engineer",
  Jessica: "engineer",
  Miguel: "engineer",
  Rachel: "pm",
  James: "pm",
  Sophie: "customer_success",
  Daniel: "customer_success",
  Olivia: "sales",
  Ethan: "design",
  Maya: "devops",
  // Mitable users
  Febe: "pm",
  Aurel: "pm",
  Mikun: "pm",
  Amara: "engineer",
  Chisom: "engineer",
  Ella: "design",
  Jide: "engineer",
  Kamsi: "engineer",
  Nneka: "customer_success",
  Tunde: "devops",
  Yemi: "engineer",
  Test: "engineer",
};

// ── Helpers ──────────────────────────────────────────

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function distributeMinutes(
  total: number,
  buckets: string[],
  weights: Record<string, number>
): Map<string, number> {
  const result = new Map<string, number>();
  const weightArr = buckets.map((b) => weights[b] || 0);
  const weightTotal = weightArr.reduce((a, b) => a + b, 0);
  let remaining = total;

  for (let i = 0; i < buckets.length; i++) {
    const isLast = i === buckets.length - 1;
    const share = isLast ? remaining : Math.round((total * weightArr[i]!) / weightTotal);
    const clamped = Math.min(share, remaining);
    if (clamped > 0) result.set(buckets[i]!, clamped);
    remaining -= clamped;
  }

  return result;
}

// ── Main ──────────────────────────────────────────

async function main() {
  // Support --org=domain CLI arg, default to mitable.ai
  const orgDomainArg = process.argv.find((a) => a.startsWith("--org="));
  const orgDomain = orgDomainArg ? orgDomainArg.split("=")[1]! : "mitable.ai";

  console.log(`🌱 Seeding dashboard data for ${orgDomain} org...\n`);

  // 1. Find the org
  const [org] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.domain, orgDomain))
    .limit(1);

  if (!org) {
    console.error(`❌ Org with domain "${orgDomain}" not found.`);
    process.exit(1);
  }
  console.log(`✅ Found org: ${org.name} (${org.id})`);

  // 2. Get all users in the org
  const users = await db
    .select({
      id: schema.users.id,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
      role: schema.users.role,
    })
    .from(schema.users)
    .where(eq(schema.users.organizationId, org.id));

  if (users.length === 0) {
    console.error("❌ No users found in org.");
    process.exit(1);
  }
  console.log(`✅ Found ${users.length} users\n`);

  // 3. Generate 14 days of data
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dates: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    // Skip weekends
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    dates.push(d.toISOString().split("T")[0]!);
  }

  let totalDays = 0;
  let totalBlocks = 0;
  let skippedDays = 0;

  for (const user of users) {
    const firstName = user.firstName || "Unknown";
    const roleKey = USER_ROLE_MAP[firstName] || "engineer";
    const profile = ROLE_PROFILES[roleKey]!;

    console.log(`👤 ${firstName} ${user.lastName || ""} (${roleKey})`);

    for (const dateStr of dates) {
      // Check if data already exists
      const existing = await db
        .select({ id: schema.userDailyActivities.id })
        .from(schema.userDailyActivities)
        .where(
          and(
            eq(schema.userDailyActivities.userId, user.id),
            eq(schema.userDailyActivities.activityDate, dateStr),
            eq(schema.userDailyActivities.periodType, "daily")
          )
        )
        .limit(1);

      // If row exists, update breakdown fields that may be missing from an older seed
      if (existing.length > 0) {
        // Generate breakdowns for the update
        const workMin = rand(profile.workMinRange[0], profile.workMinRange[1]);
        const meetingMin = rand(profile.meetingMinRange[0], profile.meetingMinRange[1]);
        const activeMin = workMin + meetingMin;

        const categories = Object.keys(profile.categories);
        const catDistrib = distributeMinutes(activeMin, categories, profile.categories);
        const categoryBreakdownUpd = [...catDistrib.entries()].map(([category, minutes]) => ({
          category,
          minutes,
          percentage: activeMin > 0 ? Math.round((minutes / activeMin) * 100) : 0,
        }));

        const numTopics = rand(3, Math.min(5, TOPICS.length));
        const shuffledTopics = [...TOPICS].sort(() => Math.random() - 0.5).slice(0, numTopics);
        const topicWeights: Record<string, number> = {};
        for (const t of shuffledTopics) topicWeights[t] = Math.random() + 0.2;
        const topicDistrib = distributeMinutes(activeMin, shuffledTopics, topicWeights);
        const topicBreakdownUpd = [...topicDistrib.entries()].map(([topicName, minutes]) => ({
          topicName,
          minutes,
          percentage: activeMin > 0 ? Math.round((minutes / activeMin) * 100) : 0,
        }));

        const appMinutes = new Map<string, number>();
        for (const [cat, mins] of catDistrib) {
          const apps = APPS[cat as keyof typeof APPS] || ["Chrome"];
          const perApp = Math.round(mins / apps.length);
          for (const app of apps) appMinutes.set(app, (appMinutes.get(app) || 0) + perApp);
        }
        const appBreakdownUpd = [...appMinutes.entries()].map(([app, minutes]) => ({
          app,
          minutes,
        }));

        await db
          .update(schema.userDailyActivities)
          .set({
            categoryBreakdown: categoryBreakdownUpd,
            topicBreakdown: topicBreakdownUpd,
            appBreakdown: appBreakdownUpd,
          })
          .where(eq(schema.userDailyActivities.id, existing[0]!.id));

        skippedDays++;
        continue;
      }

      // Generate daily metrics
      const workMin = rand(profile.workMinRange[0], profile.workMinRange[1]);
      const meetingMin = rand(profile.meetingMinRange[0], profile.meetingMinRange[1]);
      const activeMin = workMin + meetingMin;

      // Category breakdown
      const categories = Object.keys(profile.categories);
      const catDistrib = distributeMinutes(activeMin, categories, profile.categories);
      const categoryBreakdown = [...catDistrib.entries()].map(([category, minutes]) => ({
        category,
        minutes,
        percentage: activeMin > 0 ? Math.round((minutes / activeMin) * 100) : 0,
      }));

      // Customer (subscriber) breakdown
      const allCustomers = [...CUSTOMERS, "Internal"];
      const subDistrib = distributeMinutes(activeMin, allCustomers, {
        [CUSTOMERS[0]!]: profile.customerWeights[0]!,
        [CUSTOMERS[1]!]: profile.customerWeights[1]!,
        [CUSTOMERS[2]!]: profile.customerWeights[2]!,
        Internal: profile.customerWeights[3]!,
      });
      const subscriberBreakdown = [...subDistrib.entries()].map(([subscriberName, minutes]) => ({
        subscriberName,
        minutes,
        percentage: activeMin > 0 ? Math.round((minutes / activeMin) * 100) : 0,
      }));

      // Topic breakdown — pick 3-4 topics with random weights
      const numTopics = rand(3, Math.min(5, TOPICS.length));
      const shuffledTopics = [...TOPICS].sort(() => Math.random() - 0.5).slice(0, numTopics);
      const topicWeights: Record<string, number> = {};
      for (const t of shuffledTopics) {
        topicWeights[t] = Math.random() + 0.2;
      }
      const topicDistrib = distributeMinutes(activeMin, shuffledTopics, topicWeights);
      const topicBreakdown = [...topicDistrib.entries()].map(([topicName, minutes]) => ({
        topicName,
        minutes,
        percentage: activeMin > 0 ? Math.round((minutes / activeMin) * 100) : 0,
      }));

      // App breakdown
      const appMinutes = new Map<string, number>();
      for (const [cat, mins] of catDistrib) {
        const apps = APPS[cat as keyof typeof APPS] || ["Chrome"];
        const perApp = Math.round(mins / apps.length);
        for (const app of apps) {
          appMinutes.set(app, (appMinutes.get(app) || 0) + perApp);
        }
      }
      const appBreakdown = [...appMinutes.entries()].map(([app, minutes]) => ({ app, minutes }));

      // Insert daily activity
      const [dailyActivity] = await db
        .insert(schema.userDailyActivities)
        .values({
          userId: user.id,
          organizationId: org.id,
          activityDate: dateStr,
          periodType: "daily",
          totalWorkMinutes: workMin,
          totalMeetingMinutes: meetingMin,
          totalActiveMinutes: activeMin,
          totalSessions: rand(3, 8),
          totalCaptures: rand(20, 60),
          workPercentage: activeMin > 0 ? Math.round((workMin / activeMin) * 100) : 0,
          meetingPercentage: activeMin > 0 ? Math.round((meetingMin / activeMin) * 100) : 0,
          categoryBreakdown,
          topicBreakdown,
          subscriberBreakdown,
          appBreakdown,
          daySummary: `${firstName} worked on ${shuffledTopics.slice(0, 2).join(" and ")} for ${CUSTOMERS[rand(0, CUSTOMERS.length - 1)]}.`,
          keyAccomplishments: [
            `Completed ${shuffledTopics[0]} task`,
            `Reviewed ${shuffledTopics[1] || "code"} changes`,
          ],
          status: "completed",
        })
        .returning({ id: schema.userDailyActivities.id });

      totalDays++;

      // Generate 3-6 activity blocks for this day
      const numBlocks = rand(3, 6);
      let blockStartHour = 9;
      const blockTopics = [...topicDistrib.entries()];
      const blockSubs = [...subDistrib.entries()];

      for (let b = 0; b < numBlocks; b++) {
        const durMin = Math.round(activeMin / numBlocks) + rand(-15, 15);
        const clampedDur = Math.max(15, Math.min(durMin, 120));
        const startTime = new Date(
          `${dateStr}T${String(blockStartHour).padStart(2, "0")}:${String(rand(0, 30)).padStart(2, "0")}:00Z`
        );
        const endTime = new Date(startTime.getTime() + clampedDur * 60 * 1000);

        const blockType = b % 3 === 2 && meetingMin > 30 ? "meeting" : "work";
        const topicEntry = blockTopics[b % blockTopics.length]!;
        const subEntry = blockSubs[b % blockSubs.length]!;
        const category = categories[b % categories.length]!;
        const apps = APPS[category as keyof typeof APPS] || ["Chrome"];

        await db.insert(schema.activityBlocks).values({
          dailyActivityId: dailyActivity!.id,
          userId: user.id,
          blockType,
          name:
            blockType === "meeting"
              ? `${subEntry[0]} sync - ${topicEntry[0]}`
              : `${topicEntry[0]} ${category}`,
          startTime,
          endTime,
          durationMinutes: clampedDur,
          description: `${blockType === "meeting" ? "Meeting" : "Work"} on ${topicEntry[0]} for ${subEntry[0]}`,
          apps,
          category,
          topicName: topicEntry[0],
          subscriberName: subEntry[0] === "Internal" ? null : subEntry[0],
          sequenceNumber: b,
          participants: blockType === "meeting" ? ["Team member 1", "Team member 2"] : [],
        });

        totalBlocks++;
        blockStartHour += Math.ceil(clampedDur / 60) + (Math.random() > 0.5 ? 1 : 0);
        if (blockStartHour > 17) blockStartHour = 17;
      }
    }
  }

  console.log(`\n✅ Done!`);
  console.log(`   ${totalDays} daily activity rows inserted`);
  console.log(`   ${totalBlocks} activity blocks inserted`);
  if (skippedDays > 0) console.log(`   ${skippedDays} days skipped (already existed)`);

  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  pool.end();
  process.exit(1);
});
