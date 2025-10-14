import type { PineconeMatch } from "./pinecone.types";

export interface FormattedContext {
  text: string;
  sourceType: string;
  sourceName: string;
  timestamp?: number;
}

export interface ContextOptions {
  matches: PineconeMatch[];
  scoreThreshold?: number;
  useLooseThreshold?: boolean;
  boostDocuments?: boolean; // Whether to prioritize documents over chat
}
