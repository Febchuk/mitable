export { isBoundsVisible, clampToDisplay } from "./window-geometry";
export { createConsoleWindow } from "./console-window";
export {
  createWatchingPillWindow,
  startClosedWindowCheck,
  stopClosedWindowCheck,
  showPillReliably,
  movePillToDisplay,
  startPillCursorTracking,
  stopPillCursorTracking,
} from "./watching-pill-window";
export { createWatchingPillEyeDropdown, createWatchingPillMenuDropdown } from "./pill-dropdowns";
export {
  createNotificationWindow,
  showNotification,
  showNativeWindowsNotification,
  showCustomNotification,
  escapeXml,
  hideNotification,
  handleNotificationAction,
  setPrepareForQuitAndInstall,
} from "./notification-window";
export type { NotificationConfig } from "./notification-window";
export { isBrowserProcess, createWatchButtonWindow } from "./watch-button-window";
