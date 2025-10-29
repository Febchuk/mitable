# PII Redaction Test Script

## 📋 What It Does

This script tests the PII redaction feature by:

1. **Capturing** a screenshot of your primary monitor using Electron's `desktopCapturer`
2. **Sending** it to the backend PII redaction API
3. **Saving** both original and redacted images to `./redacted_images/`

## 🚀 How to Run

### Prerequisites:

1. Make sure backend is running with DLP configured:

   ```bash
   npm run dev:backend
   ```

2. Make sure you have content with PII on your screen:
   - Open a text editor or browser
   - Display some text with emails, phone numbers, names, etc.

### Run the Test:

```bash
npm run test:pii
```

## 📊 What to Expect

The script will:

1. Capture your primary monitor
2. Send to `http://localhost:3000/api/pii/redact`
3. Save results to `./scripts/redacted_images/`

**Output:**

```
🚀 PII Redaction Test Starting...

📸 Capturing screenshot of primary monitor...
✅ Captured: Screen 1
📊 Screenshot size: 245.67 KB

🔒 Sending to PII redaction API...

✅ PII Redaction Complete!
⏱️  Detection Time: 1850ms
🔍 PII Regions Found: 3
💾 Cached: No

💾 Saving images...
✅ Original saved: ./scripts/redacted_images/original_1730064243594.png
✅ Redacted saved: ./scripts/redacted_images/redacted_1730064243594.png

🎉 Test Complete! Check ./scripts/redacted_images/ for results.
```

## 📸 Results

Check `./scripts/redacted_images/` for:

- `original_[timestamp].png` - Your captured screenshot
- `redacted_[timestamp].png` - Same screenshot with PII blacked out

## 🎯 What Gets Redacted

The script will detect and redact:

- **Personal Info:** Names, emails, phone numbers, addresses
- **Financial:** Credit card numbers, SSN
- **Secrets:** API keys, tokens, passwords, JWTs, AWS/GCP/Azure credentials

## 🔧 Troubleshooting

### "No screen sources found"

- Make sure Electron has screen capture permissions
- Try running as administrator

### "HTTP 401: Unauthorized"

- Auth is temporarily disabled for testing
- If you re-enabled it, you'll need to pass a token

### "Connection refused"

- Make sure backend is running on port 3000
- Check: `http://localhost:3000/health`

### "Google Cloud DLP error"

- Make sure you enabled the DLP API
- Check your `.env` has correct credentials
- Verify `GOOGLE_CLOUD_PROJECT_ID` and `GOOGLE_CLOUD_KEY_PATH`

## 🧹 Cleanup

Images are saved with timestamps, so they won't overwrite. Delete old test images:

```bash
rm scripts/redacted_images/*.png
```

## 🔐 Security Note

**Remember to re-enable auth after testing!**

In `apps/backend/src/routes/pii.ts`:

```typescript
router.post(
  "/redact",
  requireAuth, // ← Re-enable this!
  async (req: Request, res: Response): Promise<void> => {
```
