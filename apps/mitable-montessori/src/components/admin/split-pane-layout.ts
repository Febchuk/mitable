import type { CSSProperties } from "react";
import { cardStyle } from "@/components/montessori/page-header";

/**
 * Split pane height — bottom of rail/detail cards lines up with the sidebar
 * footer band (Online + user row). PageHeader lives inside this container.
 */
export const ADMIN_SPLIT_VIEWPORT_OFFSET_PX = 72;

export const ADMIN_SPLIT_PAGE_HEIGHT = `calc(100dvh - ${ADMIN_SPLIT_VIEWPORT_OFFSET_PX}px)`;

export const adminSplitPageStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: ADMIN_SPLIT_PAGE_HEIGHT,
  maxHeight: ADMIN_SPLIT_PAGE_HEIGHT,
  minHeight: 0,
  overflow: "hidden",
};

export const adminSplitGridStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  marginTop: 20,
  padding: "0 24px 0",
  display: "grid",
  gridTemplateColumns: "minmax(240px, 320px) minmax(0, 1fr)",
  gridTemplateRows: "minmax(0, 1fr)",
  gap: 24,
  overflow: "hidden",
};

export const adminSplitRailStyle: CSSProperties = {
  ...cardStyle,
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  height: "100%",
  overflow: "hidden",
};

export const adminSplitDetailStyle: CSSProperties = {
  ...cardStyle,
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  height: "100%",
  overflow: "hidden",
};

export const adminSplitRailScrollStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
};

export const adminSplitDetailScrollStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
};

/** Tab row under PageHeader (e.g. Curricula / IEP / Speech). */
export const adminSplitSubnavStyle: CSSProperties = {
  display: "flex",
  gap: 4,
  padding: "0 24px",
  borderBottom: "1px solid var(--color-border)",
};

/** Scrollable body for a full-width tab panel (IEP / Speech admin). */
export const adminSplitTabPanelStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
};

/** Detail card title row (Classrooms + Curriculum admin). */
export const adminSplitDetailHeaderStyle: CSSProperties = {
  padding: "18px 20px",
  borderBottom: "1px solid var(--color-border)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
  flexShrink: 0,
};

export const adminSplitDetailTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 19,
  fontWeight: 700,
  color: "var(--color-ink)",
};

export const adminSplitDetailMetaStyle: CSSProperties = {
  fontSize: 12.5,
  color: "var(--color-ink-secondary)",
  marginTop: 3,
};
