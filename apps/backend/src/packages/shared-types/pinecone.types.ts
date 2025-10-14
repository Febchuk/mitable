import type { DateRange } from "./date.types";

export interface PineconeMatch {
  id: string;
  score?: number;
  metadata?: Record<string, any>;
}

export interface QueryOptions {
  embedding: number[];
  indexName: string;
  topK?: number;
  dateRange?: DateRange;
  namespace?: string;
}
