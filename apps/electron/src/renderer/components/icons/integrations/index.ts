/**
 * @deprecated Integrations tab no longer in use. Local-first app does not use
 * cloud integrations. This file is scheduled for deletion.
 */
/**
 * @deprecated Integrations tab no longer in use. Local-first app does not use
 * cloud integrations. This file is scheduled for deletion.
 */
import { SlackIcon } from "./SlackIcon";
import { NotionIcon } from "./NotionIcon";
import { GitHubIcon } from "./GitHubIcon";
import { GoogleDriveIcon } from "./GoogleDriveIcon";
import { LinearIcon } from "./LinearIcon";
import { GmailIcon } from "./GmailIcon";
import { GranolaIcon } from "./GranolaIcon";
import { FirefliesIcon } from "./FirefliesIcon";
import type { IntegrationProvider } from "../../../console/src/types";

// Export individual icons
export {
  SlackIcon,
  NotionIcon,
  GitHubIcon,
  GoogleDriveIcon,
  LinearIcon,
  GmailIcon,
  GranolaIcon,
  FirefliesIcon,
};

// Icon mapping utility
export const integrationIcons: Record<IntegrationProvider, React.ComponentType> = {
  slack: SlackIcon,
  notion: NotionIcon,
  github: GitHubIcon,
  "google-drive": GoogleDriveIcon,
  linear: LinearIcon,
  gmail: GmailIcon,
  granola: GranolaIcon,
};

// Helper function to get icon component by provider
export const getIntegrationIcon = (provider: IntegrationProvider) => {
  return integrationIcons[provider] || SlackIcon; // fallback to Slack icon
};
