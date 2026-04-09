/**
 * Granola 30-Day Sync Script
 *
 * Pulls the past 30 days of Granola meeting notes via MCP tool calls,
 * creates activity_blocks, recalculates daily stats, and auto-discovers
 * customers from attendee domains — populating the admin dashboard.
 *
 * Targets LOCAL dev DB only (loads .env, never .env.production).
 *
 * Usage:
 *   npx tsx src/scripts/sync-granola-30d.ts
 *   npx tsx src/scripts/sync-granola-30d.ts --user-id <uuid>
 *   npx tsx src/scripts/sync-granola-30d.ts --dry-run
 *   npx tsx src/scripts/sync-granola-30d.ts --wipe
 */

import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";

// Always load dev env
dotenvConfig({ path: resolve(process.cwd(), ".env"), override: true });

// ─── CLI Args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

const targetUserId = getArg("--user-id");
const dryRun = args.includes("--dry-run");
const wipe = args.includes("--wipe");

// ─── XML-like response parsers ───────────────────────────────────────────────

interface ParsedMeeting {
  id: string;
  title: string;
  date: string;
  participants: { name: string; email: string }[];
  summary: string | null;
}

function parseMeetingList(text: string): ParsedMeeting[] {
  const meetings: ParsedMeeting[] = [];
  const meetingRegex =
    /<meeting\s+id="([^"]+)"\s+title="([^"]+)"\s+date="([^"]+)">([\s\S]*?)<\/meeting>/g;

  let match;
  while ((match = meetingRegex.exec(text)) !== null) {
    const [, id, title, date, body] = match;
    const participants = parseParticipants(body);
    const summaryMatch = body.match(/<summary>([\s\S]*?)<\/summary>/);
    meetings.push({
      id,
      title,
      date,
      participants,
      summary: summaryMatch ? summaryMatch[1].trim() : null,
    });
  }
  return meetings;
}

function parseParticipants(body: string): { name: string; email: string }[] {
  const participants: { name: string; email: string }[] = [];
  // Pattern: "Name (role) <email>" or "Name <email>"
  const participantRegex = /^\s*(.+?)\s*(?:\([^)]*\)\s*)?<([^>]+)>/gm;
  const partSection = body.match(/<known_participants>([\s\S]*?)<\/known_participants>/);
  if (partSection) {
    let m;
    while ((m = participantRegex.exec(partSection[1])) !== null) {
      participants.push({ name: m[1].trim(), email: m[2].trim() });
    }
  }
  return participants;
}

function extractMcpText(result: unknown): string {
  const content = (result as { content?: { type: string; text: string }[] })?.content;
  if (content && content[0]?.text) return content[0].text;
  return "";
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const { db } = await import("../db/client");
  const schema = await import("../db/schema/index");
  const { eq, and, isNotNull } = await import("drizzle-orm");
  const { granolaService } = await import("../domains/integrations/granola/granola.service");
  const { encryptionService } = await import("../domains/auth/services/encryption.service");
  const { recalculateDailyStats } = await import("../services/activity-materializer.service");
  const { addDiscoveredCustomers } = await import("../domains/auth/services/known-customers.service");

  console.log("╔══════════════════════════════════════════╗");
  console.log("║   Granola 30-Day Sync (DEV)              ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log(`  Dry run: ${dryRun}`);
  console.log(`  Wipe: ${wipe}`);

  // Find users with Granola connected
  const conditions = [isNotNull(schema.users.granolaAccessTokenEncrypted)];
  if (targetUserId) {
    conditions.push(eq(schema.users.id, targetUserId));
  }

  const users = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      organizationId: schema.users.organizationId,
      granolaAccessTokenEncrypted: schema.users.granolaAccessTokenEncrypted,
      granolaRefreshTokenEncrypted: schema.users.granolaRefreshTokenEncrypted,
      granolaTokenExpiresAt: schema.users.granolaTokenExpiresAt,
      granolaOAuthClientId: schema.users.granolaOAuthClientId,
    })
    .from(schema.users)
    .where(and(...conditions));

  if (users.length === 0) {
    console.log("\nNo users with Granola connected found.");
    process.exit(0);
  }

  console.log(`\n  Found ${users.length} user(s) with Granola connected:`);
  for (const u of users) {
    console.log(`    - ${u.email} [${u.id.slice(0, 8)}]`);
  }

  let totalMeetingsProcessed = 0;
  let totalBlocksCreated = 0;
  let totalBlocksUpdated = 0;
  let totalErrors = 0;

  for (const user of users) {
    console.log(`\n━━━ ${user.email} ━━━`);

    // Resolve access token (refresh if expired)
    let accessToken: string;
    try {
      accessToken = encryptionService.decrypt(user.granolaAccessTokenEncrypted!);

      const isExpired =
        user.granolaTokenExpiresAt && new Date(user.granolaTokenExpiresAt) < new Date();

      if (isExpired) {
        if (!user.granolaRefreshTokenEncrypted) {
          console.log("  Token expired, no refresh token. Skipping.");
          continue;
        }
        console.log("  Token expired, refreshing...");
        const refreshToken = encryptionService.decrypt(user.granolaRefreshTokenEncrypted);
        const newTokenData = await granolaService.refreshToken(
          refreshToken,
          user.granolaOAuthClientId ?? undefined
        );
        accessToken = newTokenData.access_token;

        await db
          .update(schema.users)
          .set({
            granolaAccessTokenEncrypted: encryptionService.encrypt(newTokenData.access_token),
            granolaRefreshTokenEncrypted: newTokenData.refresh_token
              ? encryptionService.encrypt(newTokenData.refresh_token)
              : user.granolaRefreshTokenEncrypted,
            granolaTokenExpiresAt: new Date(Date.now() + newTokenData.expires_in * 1000),
            updatedAt: new Date(),
          })
          .where(eq(schema.users.id, user.id));
        console.log("  Token refreshed.");
      }
    } catch (error) {
      console.error(`  Token error: ${error instanceof Error ? error.message : String(error)}`);
      totalErrors++;
      continue;
    }

    // Step 1: List meetings (last 30 days) via MCP
    console.log("  Calling list_meetings (last_30_days)...");
    let meetingIds: string[];
    let listMeetings: ParsedMeeting[];
    try {
      const listResult = await granolaService.listMeetings(accessToken, "last_30_days");
      const listText = extractMcpText(listResult);
      listMeetings = parseMeetingList(listText);
      meetingIds = listMeetings.map((m) => m.id);
      console.log(`  Found ${meetingIds.length} meetings`);
    } catch (error) {
      console.error(
        `  list_meetings error: ${error instanceof Error ? error.message : String(error)}`
      );
      totalErrors++;
      continue;
    }

    if (meetingIds.length === 0) {
      console.log("  No meetings in date range.");
      continue;
    }

    // Step 2: Fetch details in batches of 10
    const allMeetings: ParsedMeeting[] = [];
    for (let i = 0; i < meetingIds.length; i += 10) {
      const batch = meetingIds.slice(i, i + 10);
      console.log(
        `  Fetching details batch ${Math.floor(i / 10) + 1} (${batch.length} meetings)...`
      );
      try {
        const detailResult = await granolaService.getMeetings(accessToken, batch);
        const detailText = extractMcpText(detailResult);
        const detailed = parseMeetingList(detailText);
        allMeetings.push(...detailed);

        // Rate limit: 200ms between batches
        if (i + 10 < meetingIds.length) {
          await new Promise((r) => setTimeout(r, 200));
        }
      } catch (error) {
        console.error(
          `  get_meetings batch error: ${error instanceof Error ? error.message : String(error)}`
        );
        // Fall back to list data for this batch
        const fallback = listMeetings.filter((m) => batch.includes(m.id));
        allMeetings.push(...fallback);
      }
    }

    console.log(
      `  Got details for ${allMeetings.length} meetings (${allMeetings.filter((m) => m.summary).length} with summaries)`
    );

    if (dryRun) {
      console.log("\n  DRY RUN — listing meetings:\n");
      for (const m of allMeetings) {
        console.log(
          `    ${m.date}  ${m.title}  [${m.participants.length} participants]${m.summary ? " (has summary)" : ""}`
        );
      }
      continue;
    }

    // Wipe existing Granola blocks for this user
    if (wipe) {
      await db
        .delete(schema.activityBlocks)
        .where(
          and(
            eq(schema.activityBlocks.userId, user.id),
            eq(schema.activityBlocks.blockType, "granola")
          )
        );
      console.log("  Wiped existing Granola blocks");
    }

    // Step 3: Create activity_blocks from meetings
    const affectedDailyActivityIds = new Set<string>();
    const discoveredSubscribers: string[] = [];

    const ignoreDomains = new Set([
      "gmail.com",
      "yahoo.com",
      "hotmail.com",
      "outlook.com",
      "icloud.com",
      "proton.me",
      "protonmail.com",
    ]);

    for (const meeting of allMeetings) {
      try {
        // Parse date from Granola format "Mar 16, 2026 8:08 PM" (times are UTC)
        const startTime = new Date(meeting.date + " UTC");
        if (isNaN(startTime.getTime())) {
          console.warn(`    Skipping ${meeting.title} — unparseable date: ${meeting.date}`);
          continue;
        }
        // Default meeting duration: 30min (Granola doesn't give end times in list)
        const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);
        const durationMinutes = 30;

        const attendeeEmails = meeting.participants.map((p) => p.email).filter(Boolean);

        // Use the Granola summary as the description (participants shown separately)
        const description = meeting.summary || null;

        // Extract subscriber from external domains
        const domains = new Set<string>();
        for (const email of attendeeEmails) {
          const domain = email.split("@")[1]?.toLowerCase();
          if (domain) domains.add(domain);
        }
        const externalDomains = [...domains].filter((d) => !ignoreDomains.has(d));
        let subscriberName: string | null = null;
        if (externalDomains.length === 1) {
          const parts = externalDomains[0].split(".");
          subscriberName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
        }

        if (subscriberName) discoveredSubscribers.push(subscriberName);

        // Ensure daily activity row
        const activityDate = startTime.toISOString().split("T")[0];
        let dailyActivityId: string;

        const [existingDay] = await db
          .select({ id: schema.userDailyActivities.id })
          .from(schema.userDailyActivities)
          .where(
            and(
              eq(schema.userDailyActivities.userId, user.id),
              eq(schema.userDailyActivities.activityDate, activityDate),
              eq(schema.userDailyActivities.periodType, "daily")
            )
          )
          .limit(1);

        if (existingDay) {
          dailyActivityId = existingDay.id;
        } else {
          const [created] = await db
            .insert(schema.userDailyActivities)
            .values({
              userId: user.id,
              organizationId: user.organizationId,
              activityDate,
              periodType: "daily",
              status: "completed",
            })
            .returning({ id: schema.userDailyActivities.id });
          dailyActivityId = created.id;
        }

        affectedDailyActivityIds.add(dailyActivityId);

        // Check for existing block (idempotency by Granola meeting ID in name)
        const blockName = `[Granola] ${meeting.title || "Meeting"}`;
        const [existingBlock] = await db
          .select({ id: schema.activityBlocks.id })
          .from(schema.activityBlocks)
          .where(
            and(
              eq(schema.activityBlocks.userId, user.id),
              eq(schema.activityBlocks.name, blockName)
            )
          )
          .limit(1);

        const blockData = {
          dailyActivityId,
          userId: user.id,
          blockType: "granola" as const,
          name: blockName,
          startTime,
          endTime,
          durationMinutes,
          description,
          apps: ["Granola"],
          category: "meeting",
          participants: meeting.participants,
          sourceSessionIds: [],
          topicName: meeting.title || null,
          subscriberName,
        };

        if (existingBlock) {
          await db
            .update(schema.activityBlocks)
            .set(blockData)
            .where(eq(schema.activityBlocks.id, existingBlock.id));
          totalBlocksUpdated++;
        } else {
          await db.insert(schema.activityBlocks).values({
            ...blockData,
            sequenceNumber: 0,
          });
          totalBlocksCreated++;
        }

        totalMeetingsProcessed++;

        const sub = subscriberName ? `  -> ${subscriberName}` : "";
        console.log(
          `    ${activityDate}  ${durationMinutes}min  ${meeting.title || "(untitled)"}  [${meeting.participants.length} participants]${sub}`
        );
      } catch (error) {
        totalErrors++;
        console.error(
          `    Error: ${meeting.id} — ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Step 4: Recalculate daily stats for all affected days
    console.log(`\n  Recalculating daily stats for ${affectedDailyActivityIds.size} day(s)...`);
    for (const dailyId of affectedDailyActivityIds) {
      try {
        await recalculateDailyStats(dailyId);
      } catch (error) {
        console.error(`    Stats error: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Step 5: Auto-discover customers from attendee domains
    if (discoveredSubscribers.length > 0) {
      const unique = [...new Set(discoveredSubscribers)];
      console.log(`  Discovered ${unique.length} customer(s): ${unique.join(", ")}`);
      try {
        await addDiscoveredCustomers(user.organizationId, unique);
        console.log("  Customers saved.");
      } catch (error) {
        console.error(
          `  Customer save error: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Update last synced timestamp
    await db
      .update(schema.users)
      .set({
        granolaLastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, user.id));
  }

  // Summary
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║   Sync Complete                          ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log(`  Meetings processed: ${totalMeetingsProcessed}`);
  console.log(`  Blocks created:     ${totalBlocksCreated}`);
  console.log(`  Blocks updated:     ${totalBlocksUpdated}`);
  console.log(`  Errors:             ${totalErrors}`);

  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
