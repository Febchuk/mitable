/**
 * Railway environment logs (GraphQL `environmentLogs`) for feedback and ops.
 *
 * Auth (see config.railway):
 * - **Project access token** (`RAILWAY_PROJECT_ACCESS_TOKEN`): uses `Project-Access-Token` header.
 *   Environment id is resolved automatically via Railway’s `projectToken { environmentId }` query
 *   (same as Public API docs) and cached for the process — `RAILWAY_ENVIRONMENT_ID` is optional.
 * - **Account/workspace token** (`RAILWAY_TOKEN` / `RAILWAY_API_TOKEN`): `Authorization: Bearer`.
 *   You must set `RAILWAY_ENVIRONMENT_ID` explicitly; projectToken resolution is not used with Bearer.
 *
 * Optional: `RAILWAY_BACKEND_SERVICE_ID` for `@service:` log filters.
 */

import { config } from "../../../config.js";
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

type GqlProjectTokenResponse = {
  data?: { projectToken?: { projectId?: string; environmentId?: string } | null };
  errors?: { message: string }[];
};

/** Project tokens are scoped to one env; Railway exposes its id via this query (no RAILWAY_ENVIRONMENT_ID needed). */
let cachedEnvironmentIdFromProjectToken: string | undefined;

async function resolveEnvironmentIdFromProjectToken(): Promise<string> {
  if (cachedEnvironmentIdFromProjectToken !== undefined) {
    return cachedEnvironmentIdFromProjectToken;
  }
  const pt = config.railway.projectAccessToken;
  if (!pt) {
    cachedEnvironmentIdFromProjectToken = "";
    return "";
  }
  const res = await fetch(RAILWAY_GQL_URL, {
    method: "POST",
    headers: { "Project-Access-Token": pt, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "query { projectToken { projectId environmentId } }" }),
  });
  if (!res.ok) {
    log.warn({ status: res.status }, "Railway projectToken GraphQL HTTP error");
    cachedEnvironmentIdFromProjectToken = "";
    return "";
  }
  const json = (await res.json()) as GqlProjectTokenResponse;
  if (json.errors?.length) {
    log.warn({ errors: json.errors.map((e) => e.message) }, "Railway projectToken GraphQL errors");
    cachedEnvironmentIdFromProjectToken = "";
    return "";
  }
  const id = json.data?.projectToken?.environmentId?.trim() ?? "";
  cachedEnvironmentIdFromProjectToken = id;
  if (!id) {
    log.warn("Railway projectToken returned no environmentId");
  }
  return id;
}

async function getRailwayEnvironmentId(): Promise<string> {
  const explicit = config.railway.environmentId.trim();
  if (explicit) return explicit;
  return resolveEnvironmentIdFromProjectToken();
}

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
 * (Project-Access-Token header). Environment id: set RAILWAY_ENVIRONMENT_ID, or omit it when using
 * a project access token (Railway returns it via `projectToken { environmentId }`). Optional:
 * RAILWAY_BACKEND_SERVICE_ID for @service filtering.
 */
export async function fetchRecentBackendLogsForUser(options: {
  userId: string;
  hoursBack?: number;
  maxLines?: number;
}): Promise<string> {
  const { userId, hoursBack = 4, maxLines = 2500 } = options;
  const envId = await getRailwayEnvironmentId();
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

/**
 * Feedback logs when we **don't** have a userId (login / register screens).
 * In production, returns a recent excerpt for the backend service (no user filter).
 * In development, returns empty (we only capture dev logs by userId today).
 */
export async function fetchBackendLogsForFeedbackUnauth(options?: {
  hoursBack?: number;
  maxLines?: number;
}): Promise<string> {
  if (config.nodeEnv !== "production") {
    return "";
  }

  const hoursBack = options?.hoursBack ?? 1;
  const maxLines = options?.maxLines ?? 2500;

  // NOTE: We can't easily reuse the internal env resolver without exporting it.
  // So we just call the GraphQL query path directly by re-implementing the small subset here.
  const headers = railwayHeaders();
  const actualEnvId = await (async () => {
    if (config.railway.environmentId.trim()) return config.railway.environmentId.trim();
    // If env id isn't configured and we have a project access token, resolve via projectToken query.
    if (config.railway.projectAccessToken) {
      try {
        const res = await fetch(RAILWAY_GQL_URL, {
          method: "POST",
          headers: {
            "Project-Access-Token": config.railway.projectAccessToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: "query { projectToken { environmentId } }" }),
        });
        if (!res.ok) return "";
        const json = (await res.json()) as GqlProjectTokenResponse;
        return json.data?.projectToken?.environmentId?.trim() ?? "";
      } catch {
        return "";
      }
    }
    return "";
  })();

  if (!actualEnvId || !headers) {
    return "";
  }

  const afterDate = new Date(Date.now() - hoursBack * 3600 * 1000).toISOString();
  const serviceId = config.railway.backendServiceId.trim();
  const filter = serviceId ? `@service:${serviceId}` : null;

  const json = await postGraphql({
    query: ENVIRONMENT_LOGS_QUERY,
    variables: {
      environmentId: actualEnvId,
      afterDate,
      afterLimit: maxLines,
      filter,
    },
  });

  if (json.errors?.length) {
    log.warn({ errors: json.errors.map((e) => e.message) }, "Railway GraphQL errors (unauth)");
  }

  const rows = json.data?.environmentLogs ?? [];
  if (rows.length === 0) return "";
  return rows.map((r) => `${r.timestamp} [${r.severity}] ${r.message}`).join("\n");
}
