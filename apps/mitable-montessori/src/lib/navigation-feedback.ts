export const NAVIGATION_START_EVENT = "mitable:navigation-start";

/**
 * Starts the shared loading treatment before a client-side router push.
 * Links are handled automatically; buttons that navigate programmatically
 * should call this immediately before changing routes.
 */
export function startNavigationFeedback() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NAVIGATION_START_EVENT));
}
