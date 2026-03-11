/**
 * Graph Incremental Sync Service
 *
 * Fire-and-forget functions to sync subscribers and topics to Neo4j
 * immediately on session end. Uses MERGE — safe to call multiple times.
 *
 * The nightly graph-sync still runs as full reconciliation.
 */

import { graphClientService } from "./graph-client.service.js";
import { graphScoringService } from "./graph-scoring.service.js";
import { SOURCE_RELIABILITY_WEIGHTS } from "./task-archetype-map.js";
import { normalizeName } from "../normalize-name.js";
import { config } from "../../config.js";
import { createLogger } from "../../lib/logger.js";

const logger = createLogger({ context: "graph-incremental-sync" });

/**
 * Sync a subscriber to Neo4j immediately (fire-and-forget).
 * Uses MERGE — safe to call multiple times with same name.
 */
export async function syncSubscriberToGraph(
  orgId: string,
  subscriberName: string,
  personKey: string,
  totalMinutes: number
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
     SET sub.name = $name,
         sub.totalMinutes = coalesce(sub.totalMinutes, 0) + $totalMinutes,
         sub.lastSeenAt = datetime()
     MERGE (person:Person {personKey: $personKey})
     MERGE (person)-[r:SERVES]->(sub)
     SET r.weight = $weight,
         r.totalMinutes = coalesce(r.totalMinutes, 0) + $totalMinutes,
         r.evidenceCount = coalesce(r.evidenceCount, 0) + 1,
         r.lastSeenAt = datetime()`,
    { orgId, normalizedName, name: subscriberName, totalMinutes, personKey, weight }
  );

  logger.debug({ orgId, subscriberName, totalMinutes }, "Synced subscriber to graph");
}

/**
 * Sync a topic to Neo4j immediately (fire-and-forget).
 * Uses MERGE — safe to call multiple times with same name.
 */
export async function syncTopicToGraph(
  orgId: string,
  topicName: string,
  personKey: string,
  parentCategory: string,
  totalMinutes: number
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
         topic.totalMinutes = coalesce(topic.totalMinutes, 0) + $totalMinutes,
         topic.lastSeenAt = datetime()
     MERGE (person:Person {personKey: $personKey})
     MERGE (person)-[r:WORKS_ON_TOPIC]->(topic)
     SET r.weight = $weight,
         r.totalMinutes = coalesce(r.totalMinutes, 0) + $totalMinutes,
         r.evidenceCount = coalesce(r.evidenceCount, 0) + 1,
         r.lastSeenAt = datetime()
     MERGE (task:TaskArchetype {name: $parentCategory})
     MERGE (topic)-[:TOPIC_IN_CATEGORY]->(task)`,
    { orgId, normalizedName, name: topicName, parentCategory, totalMinutes, personKey, weight }
  );

  logger.debug({ orgId, topicName, parentCategory, totalMinutes }, "Synced topic to graph");
}
