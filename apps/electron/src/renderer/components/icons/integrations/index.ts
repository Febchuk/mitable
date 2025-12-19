import { SlackIcon } from "./SlackIcon";
import { NotionIcon } from "./NotionIcon";
import { GitHubIcon } from "./GitHubIcon";
import { GoogleDriveIcon } from "./GoogleDriveIcon";
import { LinearIcon } from "./LinearIcon";
import type { IntegrationProvider } from "../../../console/src/types";

// Export individual icons
export { SlackIcon, NotionIcon, GitHubIcon, GoogleDriveIcon, LinearIcon };

// Icon mapping utility
export const integrationIcons: Record<IntegrationProvider, React.ComponentType> = {
  slack: SlackIcon,
  notion: NotionIcon,
  github: GitHubIcon,
  "google-drive": GoogleDriveIcon,
  linear: LinearIcon,
};

// Helper function to get icon component by provider
export const getIntegrationIcon = (provider: IntegrationProvider) => {
  return integrationIcons[provider] || SlackIcon; // fallback to Slack icon
};
