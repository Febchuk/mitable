# Chrome Extension Install Guide

The Mitable Browser Bridge extension connects Chrome to your Mitable desktop app, enabling AI-powered browser automation and context capture.

> **Note:** This is a temporary install method using Developer Mode while Chrome Web Store review is pending. Once approved, you'll be able to install the extension directly from the Chrome Web Store with automatic updates.

## Prerequisites

- **Google Chrome** (version 120 or later)
- **Mitable desktop app** installed and running

## Download the Extension

### Option 1: Direct Download (Recommended)

1. Download the extension: [mitable-browser-bridge.zip](https://pub-56941275957b42049f3bad9b4bf1daa9.r2.dev/mitable-browser-bridge.zip)
2. Unzip the file to a permanent location (e.g., `~/mitable-browser-bridge`)
   - **Do not delete this folder** — Chrome references it as long as the extension is loaded

### Option 2: From a GitHub Release

1. Go to the [Mitable releases page](https://github.com/mitable/mitable/releases)
2. Download the `chrome-extension.zip` file from the latest release
3. Unzip the file to a permanent location

## Install in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** using the toggle in the top-right corner
3. Click **Load unpacked**
4. Select the unzipped folder (the one containing `manifest.json`)
5. The Mitable Browser Bridge extension should now appear in your extensions list

## Verify the Connection

1. Make sure the Mitable desktop app is running
2. Click the Mitable extension icon in Chrome's toolbar (you may need to pin it first via the puzzle piece icon)
3. The popup should show **"Connected to Mitable"** with a green status dot

If it shows "Disconnected", click the **Reconnect** button in the popup.

## Troubleshooting

### Extension shows "Disconnected"

The extension connects to the Mitable desktop app via a local WebSocket on ports 19876-19880. If it can't connect:

1. **Is Mitable running?** The desktop app must be open for the extension to connect
2. **Restart the desktop app**, then click Reconnect in the extension popup
3. **Check for port conflicts**: Another application may be using ports 19876-19880. Close conflicting apps and restart Mitable

### Extension not appearing after install

- Verify you selected the correct folder — it must contain `manifest.json` at the root level
- Check for errors on `chrome://extensions` — a red error badge means the extension failed to load. Click "Errors" for details

### Extension was working but stopped

- Chrome may have suspended the service worker. Click the extension icon or navigate to any page to wake it up
- If the Mitable desktop app was restarted, the extension will automatically reconnect within a few seconds

### Content script errors on specific pages

Some pages with strict Content Security Policy (CSP) headers may block the content script. The extension will still work on other tabs.

## Updating the Extension

When a new version is available:

1. Re-download [mitable-browser-bridge.zip](https://pub-56941275957b42049f3bad9b4bf1daa9.r2.dev/mitable-browser-bridge.zip) (or grab it from the latest GitHub Release)
2. Unzip and replace the existing folder contents
3. Go to `chrome://extensions`
4. Click the **reload icon** (circular arrow) on the Mitable Browser Bridge card
5. Verify the connection in the popup

> **Dev users:** If you have the repo cloned, you can also build from source with `npm run build` in `apps/chrome-extension/` and reload.

## Permissions

The extension requests the following permissions:

| Permission   | Why                                                            |
| ------------ | -------------------------------------------------------------- |
| `activeTab`  | Interact with the currently active tab when you invoke Mitable |
| `tabs`       | Read tab URLs and titles for context capture                   |
| `scripting`  | Inject content scripts for browser automation                  |
| `storage`    | Store connection state locally                                 |
| `<all_urls>` | Enable browser automation on any website you visit             |
