import * as React from "react";

/**
 * SSR-safe media query subscription. Returns false on the server and during the
 * first client render, then settles on the real value. Used to branch report
 * detail rendering between the desktop split and the mobile FAB + sheet.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);
  return matches;
}
