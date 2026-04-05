import { apiRequest } from "./api";

export type BragbookView = "weekly" | "monthly" | "quarterly";

export interface BragbookPeriod {
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  accomplishments: string[];
  isEdited: boolean;
  hasEntry: boolean;
}

export interface BragbookResponse {
  periods: BragbookPeriod[];
}

export async function fetchBragbook(view: BragbookView = "weekly"): Promise<BragbookResponse> {
  return apiRequest<BragbookResponse>(`/my-bragbook?view=${view}`);
}

export async function saveBragbookPeriod(
  periodType: BragbookView,
  periodStart: string,
  accomplishments: string[]
): Promise<{ success: boolean }> {
  return apiRequest(`/my-bragbook/${periodType}/${periodStart}`, {
    method: "PUT",
    body: JSON.stringify({ accomplishments }),
  });
}

export async function generateBragbookPeriod(
  periodType: BragbookView,
  periodStart: string
): Promise<{ accomplishments: string[]; sessionsUsed: number }> {
  return apiRequest(`/my-bragbook/generate`, {
    method: "POST",
    body: JSON.stringify({ periodType, periodStart }),
  });
}

export async function resetBragbookPeriod(
  periodType: BragbookView,
  periodStart: string
): Promise<{ success: boolean }> {
  return apiRequest(`/my-bragbook/${periodType}/${periodStart}`, {
    method: "DELETE",
  });
}
