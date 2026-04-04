import { config } from "../config.js";
import { getDevBackendLogsForUser } from "../lib/dev-log-buffer.js";
import { createLogger } from "../lib/logger.js";

const log = createLogger({ context: "railway-logs" });

const RAILWAY_GQL_URL = "https://backboard.railway.com/graphql/v2";

const ENVIRONMENT_LOGS_QUERY = `
query EnvironmentLogs(
  $environmentId: String!
  $afterDate: String
  $afterLimit: Int
  $filter: String
) {
  environmentLogs(
    environmentId: $environmentId
    afterDate: $afterDate
    afterLimit: $afterLimit
    filter: $filter
  ) {
    message
    severity
    timestamp
  }
}
`;

type RailwayLogRow = { message: string; severity: string; timestamp: string };

type GqlLogsResponse = {
  data?: { environmentLogs?: RailwayLogRow[] | null };
  errors?: { message: string }[];
};

function railwayHeaders(): Record<string, string> | null {
  const pt = config.railway.projectAccessToken;
  const bearer = config.railway.apiToken;
  if (pt) {
    return {
      "Project-Access-Token": pt,
      "Content-Type": "application/json",
    };
  }
  if (bearer) {
    return {
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
    };
  }
  return null;
}

async function postGraphql(body: object): Promise<GqlLogsResponse> {
  const headers = railwayHeaders();
  if (!headers) {
    return {};
  }
  const res = await fetch(RAILWAY_GQL_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    log.warn({ status: res.status, statusText: res.statusText }, "Railway GraphQL HTTP error");
    return {};
  }
  return (await res.json()) as GqlLogsResponse;
}

/**
 * Fetches recent Railway environment logs for the backend service, scoped to lines that
 * mention the given user id (pino-http adds userId on request logs).
 *
 * Uses Railway's Public GraphQL API (same as the dashboard). Requires either
 * RAILWAY_TOKEN or RAILWAY_API_TOKEN (account/workspace, Bearer) or RAILWAY_PROJECT_ACCESS_TOKEN
 * (Project-Access-Token header), plus RAILWAY_ENVIRONMENT_ID and optionally
 * RAILWAY_BACKEND_SERVICE_ID for @service filtering.
 */
export async function fetchRecentBackendLogsForUser(options: {
  userId: string;
  hoursBack?: number;
  maxLines?: number;
}): Promise<string> {
  const { userId, hoursBack = 4, maxLines = 2500 } = options;
  const envId = config.railway.environmentId.trim();
  const serviceId = config.railway.backendServiceId.trim();

  if (!envId || !railwayHeaders()) {
    return "";
  }

  const afterDate = new Date(Date.now() - hoursBack * 3600 * 1000).toISOString();

  const runQuery = async (filter: string | null): Promise<RailwayLogRow[]> => {
    const json = await postGraphql({
      query: ENVIRONMENT_LOGS_QUERY,
      variables: {
        environmentId: envId,
        afterDate,
        afterLimit: maxLines,
        filter,
      },
    });
    if (json.errors?.length) {
      log.warn({ errors: json.errors.map((e) => e.message) }, "Railway GraphQL errors");
    }
    return json.data?.environmentLogs ?? [];
  };

  let rows: RailwayLogRow[] = [];

  if (serviceId) {
    const strictFilter = `@service:${serviceId} AND "${userId}"`;
    rows = await runQuery(strictFilter);
    if (rows.length === 0) {
      const serviceOnly = await runQuery(`@service:${serviceId}`);
      rows = serviceOnly.filter((r) => r.message.includes(userId));
    }
  } else {
    rows = await runQuery(`"${userId}"`);
    if (rows.length === 0) {
      log.warn("Railway logs: no RAILWAY_BACKEND_SERVICE_ID — skipping broad fetch (privacy)");
    }
  }

  if (rows.length === 0) {
    return "";
  }

  return rows.map((r) => `${r.timestamp} [${r.severity}] ${r.message}`).join("\n");
}

/**
 * Server-side log text for feedback: in **development**, uses an in-memory capture of this
 * process's pino JSON lines (so dev-DB user IDs match). In **production**, uses Railway GraphQL.
 */
export async function fetchBackendLogsForFeedbackUser(options: {
  userId: string;
  hoursBack?: number;
  maxLines?: number;
}): Promise<string> {
  if (config.nodeEnv !== "production") {
    return getDevBackendLogsForUser(options.userId, options.maxLines ?? 2500);
  }
  return fetchRecentBackendLogsForUser(options);
}
