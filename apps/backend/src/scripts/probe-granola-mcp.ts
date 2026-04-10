/**
 * Probe Granola MCP: dump raw summary text to see exact format
 */
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
dotenvConfig({ path: resolve(process.cwd(), ".env"), override: true });

async function main() {
  const { db } = await import("../db/client");
  const schema = await import("../db/schema/index");
  const { isNotNull } = await import("drizzle-orm");
  const { encryptionService } = await import("../domains/auth/services/encryption.service");
  const { granolaService } = await import("../domains/integrations/granola/granola.service");

  const [user] = await db
    .select({ token: schema.users.granolaAccessTokenEncrypted })
    .from(schema.users)
    .where(isNotNull(schema.users.granolaAccessTokenEncrypted))
    .limit(1);

  if (!user?.token) {
    console.log("No Granola-connected user found");
    process.exit(0);
  }

  const accessToken = encryptionService.decrypt(user.token);

  // Get the first meeting with full details
  const listResult = (await granolaService.listMeetings(accessToken, "this_week")) as any;
  const listText = listResult?.content?.[0]?.text || "";
  const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  const ids = [...new Set(listText.match(uuidRegex) || [])] as string[];

  if (ids.length === 0) {
    console.log("No meetings found");
    process.exit(0);
  }

  // Get detail for just 1 meeting
  const detailResult = (await granolaService.getMeetings(accessToken, [ids[0]])) as any;
  const detailText: string = detailResult?.content?.[0]?.text || "";

  // Dump the meeting tag attributes and structure (not the summary body)
  const meetingTagMatch = detailText.match(/<meeting[^>]*>/);
  if (meetingTagMatch) {
    console.log("=== MEETING TAG ===");
    console.log(meetingTagMatch[0]);
  }

  // Look for duration, end_time, length, or any time-related fields
  console.log("\n=== FIRST 800 CHARS OF DETAIL ===");
  console.log(detailText.slice(0, 800));

  // Also check if list_meetings has duration info
  console.log("\n=== FIRST MEETING FROM LIST (raw) ===");
  const firstMeetingMatch = listText.match(/<meeting[^>]*>[\s\S]*?<\/meeting>/);
  if (firstMeetingMatch) {
    console.log(firstMeetingMatch[0].slice(0, 500));
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
