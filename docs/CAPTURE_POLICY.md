# Capture Policy - App-Specific Screenshot Control

**Status:** ✅ Implemented (Nov 12, 2025)  
**Branch:** `features/PII_on_device`

---

## Overview

Mitable now enforces a **deny-first capture policy** to prevent screenshots of sensitive applications. This ensures client data privacy by blocking capture of PII-heavy apps (email clients, password managers, banking apps, etc.) **before any pixels are accessed**.

---

## Key Features

### 1. **Deny-First Policy** 🚫

- Checks window/app against deny-list **before** capture
- No pixels are ever accessed for denied apps
- Configurable via environment variables

### 2. **App-Specific Captures Only** 📱

- ❌ Full-screen capture **disabled**
- ✅ Only captures specific application windows
- Uses `active-win` to detect focused window

### 3. **ENV-Based Configuration** ⚙️

Simple CSV format in `.env`:

```bash
CAPTURE_DENY_APPS=outlook,gmail,1password,slack
```

**Note:** Each pattern is checked against BOTH window titles AND app names for maximum coverage with minimal configuration.

### 4. **Cross-Platform Support** 🌐

App name matching is **OS-agnostic** - automatically strips file extensions:

- **Windows:** `Slack.exe` → matches `"slack"`
- **macOS:** `Slack.app` → matches `"slack"`
- **Linux:** `slack` or `slack.AppImage` → matches `"slack"`

---

## Architecture

```
Screenshot Request
    ↓
┌─────────────────────────────────────┐
│  1. Detect Active Window             │
│     - Use active-win package         │
│     - Get window title + app name    │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  2. Check Capture Policy             │
│     - Load deny-list from ENV        │
│     - Match window/app/URL           │
│     - BLOCK if denied                │
└─────────────────────────────────────┘
    ↓
  DENIED? → Return null (no capture)
    ↓
  ALLOWED?
    ↓
┌─────────────────────────────────────┐
│  3. Capture Window Only              │
│     - desktopCapturer (window mode)  │
│     - NOT full screen                │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  4. PII Redaction (if enabled)       │
│     - Redact any PII in window       │
└─────────────────────────────────────┘
```

---

## Files Created/Modified

### **New Files:**

- `apps/electron/src/services/capturePolicy.ts` - Policy logic
- `apps/electron/src/main/activeWindowBridge.ts` - IPC handler
- `.env.example` - Configuration template
- `docs/CAPTURE_POLICY.md` - This file

### **Modified Files:**

- `apps/electron/src/services/captureService.ts` - Integrated policy check
- `apps/electron/src/preload/conversation.ts` - Added getActiveWindow IPC
- `apps/electron/src/main.ts` - Initialize bridge on startup
- `apps/electron/package.json` - Added `active-win` dependency

---

## Default Deny List

If `CAPTURE_DENY_APPS` is not set in ENV, these patterns are blocked by default:

**Patterns (checked against both window titles AND app names):**

- `outlook`, `gmail`, `mail`, `messages` - Email clients
- `1password`, `lastpass`, `bitwarden`, `okta` - Password managers
- `bank`, `financial`, `payroll`, `paystub`, `tax` - Financial apps
- `epic`, `cerner`, `ehr`, `hipaa`, `mychart` - Healthcare apps
- `slack` - Communication apps

**Why single list works:** A pattern like `/gmail/i` blocks:

- Desktop app: "Gmail.app" (app name match)
- Browser app: "Gmail - Inbox (23)" (window title match)
- Any browser: Works in Chrome, Firefox, Safari, Edge (title match)

---

## Testing

### **Test Steps:**

1. **Start the dev server:**

   ```bash
   npm run dev
   ```

2. **Test with Slack (Blocked App):**
   - Open Slack (desktop or web)
   - Ask AI for help with Slack
   - **Expected:** AI responds with graceful denial message:
     ```
     I'm not allowed to view Slack due to your organization's capture policy.
     I can still help you with text-based instructions instead.
     ```

3. **Test with allowed app:**
   - Open VSCode, Notion, or any non-Slack app
   - Try to capture screenshot
   - **Expected:** ✅ Screenshot captured successfully

4. **Check console logs:**
   Look for these messages in the Electron console:
   ```
   [CaptureService] Active window detected: { title: "Slack", app: "Slack.exe" }
   [CaptureService] ❌ Capture BLOCKED by policy
   [CaptureService] Capture blocked: I'm not allowed to view Slack...
   ```

### **4. Test Custom ENV Config**

Create `.env` file:

```bash
CAPTURE_DENY_APPS=vscode,notion
```

- VSCode and Notion should be blocked (both app name and window title)
- All other apps allowed

---

## Configuration Examples

### **Strict (Block Most Apps):**

```bash
CAPTURE_DENY_APPS=mail,password,bank,slack,teams,zoom,payroll,hr
```

### **Minimal (Allow Almost Everything):**

```bash
CAPTURE_DENY_APPS=1password
```

### **Finance-Heavy Company:**

```bash
CAPTURE_DENY_APPS=outlook,quickbooks,sage,xero,stripe,paypal,bank,intuit
```

**Note:** Patterns like "bank" match both:

- Desktop apps: "QuickBooks Bank" (app name)
- Browser tabs: "Bank of America - Login" (window title)

---

## Benefits

✅ **Privacy:** Never see screenshots of sensitive apps  
✅ **Compliance:** Configurable per-client requirements  
✅ **Performance:** Policy check happens before capture (~1ms)  
✅ **Transparency:** Clear logs showing allowed/denied decisions  
✅ **Flexible:** Regex patterns support complex matching  
✅ **Cross-Platform:** Works on Windows, macOS, and Linux with same config

---

## Limitations

- Window title changes (e.g., "Gmail - Inbox" → "Gmail - Drafts") are handled via partial matching
- No allow-list mode yet (only deny-list)
- Patterns must match either window title OR app name (no AND logic)

---

## Future Enhancements

1. **Allow-List Mode** - Only allow specific apps (stricter than deny-list)
2. **Per-User Policies** - Different policies per employee role
3. **Audit Logging** - Record all blocked capture attempts with timestamps
4. **Pattern Categories** - Organize patterns by sensitivity level (high/medium/low)

---

**Privacy Guarantee:** With this system, Mitable **never captures pixels** from denied applications. The policy check happens before any screen data is accessed.
