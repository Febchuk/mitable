import { Pinecone } from "@pinecone-database/pinecone";
import type { PineconeMatch, QueryOptions } from "../shared-types/pinecone.types";

let pinecone: Pinecone | null = null;

function getPinecone(): Pinecone {
  if (!pinecone) {
    if (!process.env.PINECONE_API_KEY) {
      throw new Error("PINECONE_API_KEY environment variable is required");
    }
    pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    });
  }
  return pinecone;
}

/**
 * Query Pinecone index with optional date filtering
 */
export async function queryVectors(options: QueryOptions): Promise<PineconeMatch[]> {
  const { embedding, indexName, topK = 5, dateRange, namespace } = options;
  
  const pc = getPinecone();
  const index = pc.index(indexName);
  
  const queryOptions: any = {
    vector: embedding,
    topK: dateRange && dateRange.type !== "none" ? 10 : topK,
    includeMetadata: true,
  };

  if (namespace) {
    queryOptions.namespace = namespace;
  }
  
  // Apply date filtering if provided
  if (dateRange && dateRange.type !== "none") {
    queryOptions.filter = {
      $or: [
        // Slack messages: createdAt
        { 
          $and: [
            { createdAt: { $gte: dateRange.startTimestamp } },
            { createdAt: { $lte: dateRange.endTimestamp } }
          ]
        },
        // Google Drive: modifiedTime (prefer recent edits)
        { 
          $and: [
            { modifiedTime: { $gte: dateRange.startTimestamp } },
            { modifiedTime: { $lte: dateRange.endTimestamp } }
          ]
        },
        // Google Drive: createdTime (when uploaded)
        { 
          $and: [
            { createdTime: { $gte: dateRange.startTimestamp } },
            { createdTime: { $lte: dateRange.endTimestamp } }
          ]
        },
        // Notion: lastEditedTime (prefer recent edits)
        { 
          $and: [
            { lastEditedTime: { $gte: dateRange.startTimestamp } },
            { lastEditedTime: { $lte: dateRange.endTimestamp } }
          ]
        },
        // Legacy documents: uploadedAt
        { 
          $and: [
            { uploadedAt: { $gte: dateRange.startTimestamp } },
            { uploadedAt: { $lte: dateRange.endTimestamp } }
          ]
        }
      ]
    };
    
    console.log(`Applied Pinecone filter: ${dateRange.startTimestamp} to ${dateRange.endTimestamp}`);
  }
  
  const response = await index.query(queryOptions);
  
  return response.matches.map(match => ({
    id: match.id,
    score: match.score,
    metadata: match.metadata as Record<string, any>
  }));
}
