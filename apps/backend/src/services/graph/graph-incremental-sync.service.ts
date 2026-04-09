/**
 * Graph Incremental Sync Service
 *
 * Idempotent functions to sync subscribers and topics to Neo4j.
 * Called by the materializer with pre-computed totals from SQL.
 * Uses SET (overwrite) on relationships, then recomputes node
 * aggregates from all incoming edges — safe to call repeatedly.
 *
 * The nightly graph-sync still runs as full reconciliation.
 */

import { graphClientService } from "./graph-client.service.js";
import { graphScoringService } from "./graph-scoring.service.js";
import { SOURCE_RELIABILITY_WEIGHTS } from "./task-archetype-map.js";
import { normalizeName } from "../../domains/auth/services/normalize-name.js";
import { config } from "../../config.js";
import { createLogger } from "../../domains/shared-infra/lib/logger.js";

const logger = createLogger({ context: "graph-incremental-sync" });

/**
 * Sync a subscriber to Neo4j (idempotent).
 * Accepts pre-computed totals from SQL. Uses SET (overwrite) on the
 * relationship, then recomputes the Subscriber node's totalMinutes
 * as the sum of all incoming SERVES edges.
 */
export async function syncSubscriberToGraph(
  orgId: string,
  subscriberName: string,
  personKey: string,
  totalMinutes: number,
  evidenceCount: number
): Promise<void> {
  if (!config.graph.enabled) return;

  const normalizedName = normalizeName(subscriberName);
  const { weight } = graphScoringService.computeWeight({
    oldWeight: 0,
    daysSinceLastSeen: 0,
    sourceReliability: SOURCE_RELIABILITY_WEIGHTS.workstream!,
    confidence: Math.min(1, totalMinutes / 60),
  });

  await graphClientService.runQuery(
    `MERGE (org:Organization {orgId: $orgId})
     MERGE (sub:Subscriber {normalizedName: $normalizedName, orgId: $orgId})
     SET sub.name = $name, sub.lastSeenAt = datetime()
     MERGE (person:Person {personKey: $personKey})
     MERGE (person)-[r:SERVES]->(sub)
     SET r.weight = $weight,
         r.totalMinutes = $totalMinutes,
         r.evidenceCount = $evidenceCount,
         r.lastSeenAt = datetime()
     WITH sub
     OPTIONAL MATCH ()-[allR:SERVES]->(sub)
     WITH sub, sum(allR.totalMinutes) AS computed
     SET sub.totalMinutes = computed`,
    { orgId, normalizedName, name: subscriberName, totalMinutes, evidenceCount, personKey, weight }
  );

  logger.debug(
    { orgId, subscriberName, totalMinutes, evidenceCount },
    "Synced subscriber to graph"
  );
}

/**
 * Sync a topic to Neo4j (idempotent).
 * Accepts pre-computed totals from SQL. Uses SET (overwrite) on the
 * relationship, then recomputes the Topic node's totalMinutes
 * as the sum of all incoming WORKS_ON_TOPIC edges.
 */
export async function syncTopicToGraph(
  orgId: string,
  topicName: string,
  personKey: string,
  parentCategory: string,
  totalMinutes: number,
  evidenceCount: number
): Promise<void> {
  if (!config.graph.enabled) return;

  const normalizedName = normalizeName(topicName);
  const { weight } = graphScoringService.computeWeight({
    oldWeight: 0,
    daysSinceLastSeen: 0,
    sourceReliability: SOURCE_RELIABILITY_WEIGHTS.workstream!,
    confidence: Math.min(1, totalMinutes / 60),
  });

  await graphClientService.runQuery(
    `MERGE (topic:Topic {normalizedName: $normalizedName, orgId: $orgId})
     SET topic.name = $name,
         topic.parentCategory = $parentCategory,
         topic.lastSeenAt = datetime()
     MERGE (person:Person {personKey: $personKey})
     MERGE (person)-[r:WORKS_ON_TOPIC]->(topic)
     SET r.weight = $weight,
         r.totalMinutes = $totalMinutes,
         r.evidenceCount = $evidenceCount,
         r.lastSeenAt = datetime()
     MERGE (task:TaskArchetype {name: $parentCategory})
     MERGE (topic)-[:TOPIC_IN_CATEGORY]->(task)
     WITH topic
     OPTIONAL MATCH ()-[allR:WORKS_ON_TOPIC]->(topic)
     WITH topic, sum(allR.totalMinutes) AS computed
     SET topic.totalMinutes = computed`,
    {
      orgId,
      normalizedName,
      name: topicName,
      parentCategory,
      totalMinutes,
      evidenceCount,
      personKey,
      weight,
    }
  );

  logger.debug(
    { orgId, topicName, parentCategory, totalMinutes, evidenceCount },
    "Synced topic to graph"
  );
}

/**
 * Remove all SERVES and WORKS_ON_TOPIC relationships for a person.
 * Used by the backfill --wipe flow to clear stale graph data before
 * re-syncing from fresh SQL data.
 */
export async function clearGraphDataForPerson(personKey: string): Promise<void> {
  if (!config.graph.enabled) return;

  await graphClientService.runQuery(
    `MATCH (p:Person {personKey: $personKey})-[r:SERVES|WORKS_ON_TOPIC]->()
     DELETE r`,
    { personKey }
  );

  logger.info({ personKey: personKey.slice(0, 20) }, "Cleared graph relationships for person");
}
