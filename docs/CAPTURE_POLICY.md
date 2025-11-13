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
CAPTURE_DENY_URLS=mail.google.com,drive.google.com,bankofamerica.com
```

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

**Apps:**
- `outlook`, `gmail`, `mail`, `messages`
- `1password`, `lastpass`, `bitwarden`, `okta`
- `bank`, `financial`, `payroll`, `paystub`, `tax`
- `epic`, `cerner`, `ehr`, `hipaa`, `mychart`
- `slack`

**URLs:**
- `mail.google.com`, `drive.google.com`
- `bankofamerica`, `chase`, `wellsfargo`, `intuit`, `plaid`
- `mychart`, `ehr`, `hipaa`, `medical`, `health`

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
CAPTURE_DENY_APPS=vscode,chrome
```
- VSCode and Chrome should be blocked
- All other apps allowed

---

## Configuration Examples

### **Strict (Block Most Apps):**
```bash
CAPTURE_DENY_APPS=*mail*,*password*,*bank*,slack,teams,zoom,chrome,firefox
```

### **Minimal (Allow Almost Everything):**
```bash
CAPTURE_DENY_APPS=1password
CAPTURE_DENY_URLS=
```

### **Finance-Heavy Company:**
```bash
CAPTURE_DENY_APPS=outlook,quickbooks,sage,xero,stripe,paypal
CAPTURE_DENY_URLS=quickbooks.com,xero.com,stripe.com,paypal.com
```

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

- URL blocking requires browser tab info (future enhancement)
- Window title changes (e.g., "Gmail - Inbox" → "Gmail - Drafts") are handled via partial matching
- No allow-list mode yet (only deny-list)

---

## Future Enhancements

1. **Browser Extension** - Pass current tab URL for precise URL blocking
2. **Allow-List Mode** - Only allow specific apps (stricter)
3. **Per-User Policies** - Different policies per employee role
4. **Audit Logging** - Record all blocked capture attempts

---

**Privacy Guarantee:** With this system, Mitable **never captures pixels** from denied applications. The policy check happens before any screen data is accessed.
