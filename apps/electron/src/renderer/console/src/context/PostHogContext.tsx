import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useUser } from "./UserContext";
import { initPostHog, identifyUser, trackEvent, resetUser } from "../../../lib/posthog";

/**
 * PostHog analytics provider for the console renderer.
 * - Initializes PostHog on mount
 * - Auto-identifies user when authenticated
 * - Tracks hash-based route changes as pageviews
 */
export function PostHogTracker() {
  const { user, isAuthenticated } = useUser();
  const location = useLocation();
  const prevPathRef = useRef<string | null>(null);

  // Initialize PostHog once
  useEffect(() => {
    initPostHog();
  }, []);

  // Identify/reset user on auth changes
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      identifyUser({
        id: user.id,
        email: user.email,
        organizationId: user.organizationId,
        role: user.role,
        isManager: user.isManager,
      });
    } else if (!isAuthenticated) {
      resetUser();
    }
  }, [isAuthenticated, user?.id, user?.email, user?.organizationId, user?.role, user?.isManager]);

  // Track route changes as pageviews
  useEffect(() => {
    const path = location.pathname;
    if (path === prevPathRef.current) return;
    prevPathRef.current = path;

    const viewName = path.split("/")[1] || "home";
    trackEvent("$pageview", { path, view_name: viewName });
  }, [location.pathname]);

  return null;
}
