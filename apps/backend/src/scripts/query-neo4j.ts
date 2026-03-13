/**
 * Quick Neo4j query script — reads graph config from .env.production
 *
 * Usage:
 *   npx tsx src/scripts/query-neo4j.ts --prod
 */

import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";

const isProd = process.argv.includes("--prod");
dotenvConfig({
  path: resolve(process.cwd(), isProd ? ".env.production" : ".env"),
  override: true,
});

async function main() {
  const neo4j = await import("neo4j-driver");

  const uri = process.env.GRAPH_URI;
  const user = process.env.GRAPH_USER;
  const password = process.env.GRAPH_PASSWORD;
  const database = process.env.GRAPH_DATABASE || "neo4j";
  const enabled = process.env.GRAPH_ENABLED;

  console.log(`Environment: ${isProd ? "PRODUCTION" : "DEVELOPMENT"}`);
  console.log(`GRAPH_ENABLED: ${enabled}`);
  console.log(`GRAPH_URI: ${uri ? uri.slice(0, 30) + "..." : "(not set)"}`);
  console.log(`GRAPH_USER: ${user || "(not set)"}`);
  console.log(`GRAPH_DATABASE: ${database}`);
  console.log(`GRAPH_PASSWORD: ${password ? "***set***" : "(not set)"}`);

  if (!uri || !user || !password) {
    console.error(
      "\n❌ Missing Neo4j credentials in env. Graph sync was likely skipped during backfill."
    );
    process.exit(1);
  }

  const driver = neo4j.default.driver(uri, neo4j.default.auth.basic(user, password));
  const session = driver.session({ database });

  try {
    // 1. Node counts by label
    console.log("\n═══ Node Counts ═══");
    const countResult = await session.run(
      "MATCH (n) RETURN labels(n) AS type, count(n) AS count ORDER BY count DESC"
    );
    for (const r of countResult.records) {
      console.log(`  ${r.get("type")}: ${r.get("count").toNumber()}`);
    }

    // 2. Subscribers in Mitable org
    console.log("\n═══ Subscribers (Mitable org) ═══");
    const subResult = await session.run(
      `MATCH (s:Subscriber {orgId: 'fce490bf-e411-44ae-bd74-6b573a8f628b'})
       RETURN s.name AS name, s.totalMinutes AS mins, s.lastSeenAt AS lastSeen
       ORDER BY s.totalMinutes DESC LIMIT 10`
    );
    if (subResult.records.length === 0) console.log("  (none found)");
    for (const r of subResult.records) {
      console.log(`  ${r.get("name")} — ${r.get("mins")}min — ${r.get("lastSeen")}`);
    }

    // 3. Topics in Mitable org
    console.log("\n═══ Topics (Mitable org) ═══");
    const topicResult = await session.run(
      `MATCH (t:Topic {orgId: 'fce490bf-e411-44ae-bd74-6b573a8f628b'})
       RETURN t.name AS name, t.totalMinutes AS mins, t.parentCategory AS cat
       ORDER BY t.totalMinutes DESC LIMIT 10`
    );
    if (topicResult.records.length === 0) console.log("  (none found)");
    for (const r of topicResult.records) {
      console.log(`  ${r.get("name")} [${r.get("cat")}] — ${r.get("mins")}min`);
    }

    // 4. Person → Subscriber relationships
    console.log("\n═══ Person → Subscriber (SERVES) ═══");
    const servesResult = await session.run(
      `MATCH (p:Person)-[r:SERVES]->(s:Subscriber {orgId: 'fce490bf-e411-44ae-bd74-6b573a8f628b'})
       RETURN p.personKey AS person, s.name AS subscriber, r.totalMinutes AS mins, r.evidenceCount AS evidence
       ORDER BY r.totalMinutes DESC LIMIT 10`
    );
    if (servesResult.records.length === 0) console.log("  (none found)");
    for (const r of servesResult.records) {
      console.log(
        `  ${r.get("person")?.toString().slice(0, 20)}... → ${r.get("subscriber")} — ${r.get("mins")}min (${r.get("evidence")} blocks)`
      );
    }

    // 5. Person → Topic relationships
    console.log("\n═══ Person → Topic (WORKS_ON_TOPIC) ═══");
    const topicRelResult = await session.run(
      `MATCH (p:Person)-[r:WORKS_ON_TOPIC]->(t:Topic {orgId: 'fce490bf-e411-44ae-bd74-6b573a8f628b'})
       RETURN p.personKey AS person, t.name AS topic, r.totalMinutes AS mins
       ORDER BY r.totalMinutes DESC LIMIT 10`
    );
    if (topicRelResult.records.length === 0) console.log("  (none found)");
    for (const r of topicRelResult.records) {
      console.log(
        `  ${r.get("person")?.toString().slice(0, 20)}... → ${r.get("topic")} — ${r.get("mins")}min`
      );
    }
  } finally {
    await session.close();
    await driver.close();
  }

  console.log("\n✅ Done");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
