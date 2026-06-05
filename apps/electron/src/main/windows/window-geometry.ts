import { screen } from "electron";

export function isBoundsVisible(bounds: Electron.Rectangle): boolean {
  const displays = screen.getAllDisplays();
  return displays.some((display) => {
    const area = display.workArea;
    const withinX = bounds.x + bounds.width > area.x && bounds.x < area.x + area.width;
    const withinY = bounds.y + bounds.height > area.y && bounds.y < area.y + area.height;
    return withinX && withinY;
  });
}

export function clampToDisplay(bounds: Electron.Rectangle): Electron.Rectangle {
  const targetDisplay = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
  const { x, y, width, height } = targetDisplay.workArea;

  const clampedWidth = Math.min(bounds.width, width);
  const clampedHeight = Math.min(bounds.height, height);

  const clampedX = Math.min(Math.max(bounds.x, x), x + width - clampedWidth);
  const clampedY = Math.min(Math.max(bounds.y, y), y + height - clampedHeight);

  return {
    x: clampedX,
    y: clampedY,
    width: clampedWidth,
    height: clampedHeight,
  };
}
