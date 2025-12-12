/**
 * Demo Recipients - Re-exports from centralized config
 *
 * This file maintains backward compatibility with existing imports
 * while using the centralized demoConfig.ts as the source of truth.
 */

import {
  DEMO_CONFIG,
  getRecipientByIdFromConfig,
  getAllRecipientsFromConfig,
  type DemoUser,
  type DemoChannel,
} from "./demoConfig";

// Re-export types with backward-compatible names
export interface Recipient {
  id: string;
  name: string;
  type: "user" | "channel";
  avatar?: string;
  isPrivate?: boolean;
}

// Transform config data into the expected Recipient format
export const DEMO_RECIPIENTS: Recipient[] = [
  // Users
  ...DEMO_CONFIG.recipients.users.map((user) => ({
    id: user.id,
    name: user.name,
    type: "user" as const,
  })),
  // Channels
  ...DEMO_CONFIG.recipients.channels.map((channel) => ({
    id: channel.id,
    name: channel.name,
    type: "channel" as const,
    isPrivate: channel.isPrivate,
  })),
];

export function getRecipientById(id: string): Recipient | undefined {
  return DEMO_RECIPIENTS.find((r) => r.id === id);
}

export function filterRecipients(query: string): Recipient[] {
  const lowerQuery = query.toLowerCase();
  return DEMO_RECIPIENTS.filter((r) =>
    r.name.toLowerCase().includes(lowerQuery)
  );
}

// Re-export config helpers for direct access
export { DEMO_CONFIG };
