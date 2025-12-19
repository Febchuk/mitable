/**
 * Linear Service
 *
 * Handles Linear API interactions for per-user OAuth:
 * - Fetching user's assigned issues
 * - Creating comments on issues
 * - Updating issue status
 */

import { config } from "../config.js";

const LINEAR_API_URL = "https://api.linear.app/graphql";
const LINEAR_OAUTH_TOKEN_URL = "https://api.linear.app/oauth/token";

interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  state: {
    id: string;
    name: string;
    color: string;
  };
  team: {
    id: string;
    name: string;
    key: string;
  };
  url: string;
  createdAt: string;
  updatedAt: string;
}

interface LinearWorkflowState {
  id: string;
  name: string;
  color: string;
  type: string;
}

interface LinearTeam {
  id: string;
  name: string;
  key: string;
  states: LinearWorkflowState[];
}

interface LinearViewer {
  id: string;
  name: string;
  email: string;
  displayName: string;
}

interface LinearOAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

class LinearService {
  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<LinearOAuthTokenResponse> {
    const response = await fetch(LINEAR_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: config.linear.redirectUri,
        client_id: config.linear.clientId,
        client_secret: config.linear.clientSecret,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to exchange code for token: ${errorText}`);
    }

    return response.json() as Promise<LinearOAuthTokenResponse>;
  }

  /**
   * Refresh an expired access token
   */
  async refreshToken(refreshToken: string): Promise<LinearOAuthTokenResponse> {
    const response = await fetch(LINEAR_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: config.linear.clientId,
        client_secret: config.linear.clientSecret,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to refresh token: ${errorText}`);
    }

    return response.json() as Promise<LinearOAuthTokenResponse>;
  }

  /**
   * Execute a GraphQL query against Linear API
   */
  private async graphql<T>(
    accessToken: string,
    query: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
    const response = await fetch(LINEAR_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Linear API error: ${errorText}`);
    }

    const result = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };

    if (result.errors && result.errors.length > 0) {
      throw new Error(`Linear GraphQL error: ${result.errors[0].message}`);
    }

    return result.data as T;
  }

  /**
   * Get the current user (viewer) info
   */
  async getViewer(accessToken: string): Promise<LinearViewer> {
    const query = `
      query Viewer {
        viewer {
          id
          name
          email
          displayName
        }
      }
    `;

    const data = await this.graphql<{ viewer: LinearViewer }>(accessToken, query);
    return data.viewer;
  }

  /**
   * Get issues assigned to the current user
   */
  async getAssignedIssues(accessToken: string): Promise<LinearIssue[]> {
    const query = `
      query AssignedIssues {
        viewer {
          assignedIssues(
            first: 50
            orderBy: updatedAt
          ) {
            nodes {
              id
              identifier
              title
              description
              url
              createdAt
              updatedAt
              state {
                id
                name
                color
              }
              team {
                id
                name
                key
              }
            }
          }
        }
      }
    `;

    const data = await this.graphql<{
      viewer: { assignedIssues: { nodes: LinearIssue[] } };
    }>(accessToken, query);

    return data.viewer.assignedIssues.nodes;
  }

  /**
   * Get teams the user has access to (with workflow states)
   */
  async getTeams(accessToken: string): Promise<LinearTeam[]> {
    const query = `
      query Teams {
        teams {
          nodes {
            id
            name
            key
            states {
              nodes {
                id
                name
                color
                type
              }
            }
          }
        }
      }
    `;

    const data = await this.graphql<{
      teams: {
        nodes: Array<{
          id: string;
          name: string;
          key: string;
          states: { nodes: LinearWorkflowState[] };
        }>;
      };
    }>(accessToken, query);

    return data.teams.nodes.map((team) => ({
      ...team,
      states: team.states.nodes,
    }));
  }

  /**
   * Create a comment on an issue
   */
  async createComment(
    accessToken: string,
    issueId: string,
    body: string
  ): Promise<{ id: string; success: boolean }> {
    const mutation = `
      mutation CommentCreate($issueId: String!, $body: String!) {
        commentCreate(input: { issueId: $issueId, body: $body }) {
          success
          comment {
            id
          }
        }
      }
    `;

    const data = await this.graphql<{
      commentCreate: { success: boolean; comment: { id: string } };
    }>(accessToken, mutation, { issueId, body });

    return {
      id: data.commentCreate.comment.id,
      success: data.commentCreate.success,
    };
  }

  /**
   * Update an issue's status (workflow state)
   */
  async updateIssueState(
    accessToken: string,
    issueId: string,
    stateId: string
  ): Promise<{ success: boolean; issue: LinearIssue }> {
    const mutation = `
      mutation IssueUpdate($issueId: String!, $stateId: String!) {
        issueUpdate(id: $issueId, input: { stateId: $stateId }) {
          success
          issue {
            id
            identifier
            title
            url
            state {
              id
              name
              color
            }
            team {
              id
              name
              key
            }
          }
        }
      }
    `;

    const data = await this.graphql<{
      issueUpdate: { success: boolean; issue: LinearIssue };
    }>(accessToken, mutation, { issueId, stateId });

    return {
      success: data.issueUpdate.success,
      issue: data.issueUpdate.issue,
    };
  }

  /**
   * Get a single issue by ID
   */
  async getIssue(accessToken: string, issueId: string): Promise<LinearIssue | null> {
    const query = `
      query Issue($issueId: String!) {
        issue(id: $issueId) {
          id
          identifier
          title
          description
          url
          createdAt
          updatedAt
          state {
            id
            name
            color
          }
          team {
            id
            name
            key
          }
        }
      }
    `;

    try {
      const data = await this.graphql<{ issue: LinearIssue }>(accessToken, query, { issueId });
      return data.issue;
    } catch {
      return null;
    }
  }
}

export const linearService = new LinearService();
export type {
  LinearIssue,
  LinearTeam,
  LinearWorkflowState,
  LinearViewer,
  LinearOAuthTokenResponse,
};
