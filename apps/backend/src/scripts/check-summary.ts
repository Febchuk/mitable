import { db } from "../db/client";
import { sessionSummaries } from "../db/schema/index";
import { eq } from "drizzle-orm";

const SESSION_ID = "13c9440e-7d94-465c-b59e-a0ba234bbb70";

async function checkSummary() {
  console.log("\n=== Checking summaries for session:", SESSION_ID, "===\n");

  // Get all summaries for this session (any type)
  const allSummaries = await db
    .select()
    .from(sessionSummaries)
    .where(eq(sessionSummaries.sessionId, SESSION_ID));

  console.log(`Found ${allSummaries.length} summaries:\n`);

  allSummaries.forEach((summary, index) => {
    console.log(`Summary ${index + 1}:`);
    console.log(`  - ID: ${summary.id}`);
    console.log(`  - Type: ${summary.summaryType}`);
    console.log(`  - Version: ${summary.version}`);
    console.log(`  - Model: ${summary.modelUsed}`);
    console.log(`  - Length: ${summary.narrativeSummary?.length || 0} chars`);
    console.log(`  - Created: ${summary.createdAt}`);
    console.log(`  - Preview: ${summary.narrativeSummary?.substring(0, 100)}...`);
    console.log("");
  });

  // Specifically check for master_story type
  const masterStory = await db.query.sessionSummaries.findFirst({
    where: eq(sessionSummaries.sessionId, SESSION_ID),
  });

  console.log("\nFirst summary found (any type):");
  console.log(masterStory);

  process.exit(0);
}

checkSummary().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
