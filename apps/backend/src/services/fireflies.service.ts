/**
 * Fireflies AI API Service
 *
 * GraphQL client for the Fireflies.ai API.
 * Each user provides their own API key (stored encrypted in the users table).
 *
 * API docs: https://docs.fireflies.ai/
 * Endpoint: https://api.fireflies.ai/graphql
 * Auth: Bearer {api_key}
 */

import { config } from "../config.js";
import { createLogger } from "../domains/shared-infra/lib/logger.js";

const logger = createLogger({ context: "fireflies-api" });
// ============================================================================
// Types
// ============================================================================

export interface FirefliesTranscript {
  id: string;
  title: string;
  date: number; // epoch ms
  duration: number; // seconds
  transcript_url?: string;
  audio_url?: string;
  host_email?: string;
  organizer_email?: string;
  participants?: string[];
  fireflies_users?: string[];
  meeting_attendees?: Array<{
    displayName?: string;
    email?: string;
    name?: string;
  }>;
  summary?: {
    keywords?: string[];
    action_items?: string[];
    outline?: string[];
    shorthand_bullet?: string[];
    overview?: string;
    bullet_gist?: string[];
    gist?: string;
    short_summary?: string;
    short_overview?: string;
    meeting_type?: string;
    topics_discussed?: string[];
    transcript_chapters?: Array<{ gist?: string; headline?: string; start?: number; end?: number }>;
  };
  speakers?: Array<{
    id?: string;
    name?: string;
  }>;
  sentences?: Array<{
    index: number;
    speaker_name?: string;
    text?: string;
    start_time?: number;
    end_time?: number;
  }>;
}

export interface FirefliesUser {
  user_id: string;
  email: string;
  name: string;
}

// ============================================================================
// GraphQL Queries
// ============================================================================

const TRANSCRIPTS_QUERY = `
  query Transcripts($fromDate: DateTime, $toDate: DateTime, $limit: Int, $skip: Int) {
    transcripts(fromDate: $fromDate, toDate: $toDate, limit: $limit, skip: $skip) {
      id
      title
      date
      duration
      transcript_url
      audio_url
      host_email
      organizer_email
      participants
      meeting_attendees {
        displayName
        email
        name
      }
      speakers {
        id
        name
      }
      summary {
        keywords
        action_items
        outline
        shorthand_bullet
        overview
        bullet_gist
        gist
        short_summary
        short_overview
        meeting_type
        topics_discussed
      }
    }
  }
`;

const TRANSCRIPT_DETAIL_QUERY = `
  query Transcript($transcriptId: String!) {
    transcript(id: $transcriptId) {
      id
      title
      date
      duration
      transcript_url
      audio_url
      host_email
      organizer_email
      participants
      meeting_attendees {
        displayName
        email
        name
      }
      speakers {
        id
        name
      }
      sentences {
        index
        speaker_name
        text
        start_time
        end_time
      }
      summary {
        keywords
        action_items
        overview
        short_summary
        meeting_type
        topics_discussed
      }
    }
  }
`;

const USER_QUERY = `
  query User {
    user {
      user_id
      email
      name
    }
  }
`;

// ============================================================================
// Service
// ============================================================================

class FirefliesService {
  /**
   * Execute a GraphQL query against the Fireflies API.
   */
  private async graphql<T>(
    apiKey: string,
    query: string,
    variables: Record<string, unknown> = {}
  ): Promise<T> {
    const response = await fetch(config.fireflies.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Fireflies API error ${response.status}: ${errorText}`);
    }

    const json = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };

    if (json.errors && json.errors.length > 0) {
      throw new Error(`Fireflies GraphQL error: ${json.errors[0].message}`);
    }

    if (!json.data) {
      throw new Error("Fireflies API returned no data");
    }

    return json.data;
  }

  /**
   * Validate an API key by fetching the user profile.
   */
  async validateApiKey(apiKey: string): Promise<FirefliesUser> {
    const data = await this.graphql<{ user: FirefliesUser }>(apiKey, USER_QUERY);
    return data.user;
  }

  /**
   * List recent transcripts.
   * @param fromDate - epoch ms to filter from (optional)
   * @param limit - max results (default 50)
   * @param skip - pagination offset
   */
  async listTranscripts(
    apiKey: string,
    options: { fromDate?: number; toDate?: number; limit?: number; skip?: number } = {}
  ): Promise<FirefliesTranscript[]> {
    const { fromDate, toDate, limit = 50, skip = 0 } = options;
    const variables: Record<string, unknown> = { limit, skip };
    if (fromDate) variables.fromDate = new Date(fromDate).toISOString();
    if (toDate) variables.toDate = new Date(toDate).toISOString();

    logger.info({ variables }, "Fireflies listTranscripts variables");

    const data = await this.graphql<{ transcripts: FirefliesTranscript[] }>(
      apiKey,
      TRANSCRIPTS_QUERY,
      variables
    );

    logger.info(
      { count: data.transcripts?.length ?? 0, firstId: data.transcripts?.[0]?.id },
      "Fireflies listTranscripts response"
    );

    return data.transcripts || [];
  }

  /**
   * Get detailed transcript (including sentences/transcript).
   */
  async getTranscript(apiKey: string, transcriptId: string): Promise<FirefliesTranscript> {
    const data = await this.graphql<{ transcript: FirefliesTranscript }>(
      apiKey,
      TRANSCRIPT_DETAIL_QUERY,
      { transcriptId }
    );

    return data.transcript;
  }
}

export const firefliesService = new FirefliesService();
