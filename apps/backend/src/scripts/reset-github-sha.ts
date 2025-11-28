import { db } from "../db/client.js";
import { githubRepos } from "../db/schema/index.js";
import { eq } from "drizzle-orm";

async function resetGitHubSha() {
  console.log("Resetting lastIndexedCommitSha to 78622e9...");

  await db
    .update(githubRepos)
    .set({ lastIndexedCommitSha: "78622e9" })
    .where(eq(githubRepos.fullName, "Npounengnong/mitableai"));

  console.log("✅ Reset complete!");
  process.exit(0);
}

resetGitHubSha().catch((error) => {
  console.error("❌ Failed:", error);
  process.exit(1);
});
