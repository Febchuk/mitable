# Chrome Web Store Publishing

Internal reference for publishing the Mitable Browser Bridge extension to the Chrome Web Store (CWS).

## One-Time Setup

### 1. Chrome Web Store Developer Account

1. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Sign in with the team Google account
3. Pay the one-time **$5 registration fee**
4. Accept the developer agreement

### 2. Google Cloud OAuth Credentials

These credentials allow the CI workflow to upload builds to CWS automatically.

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one), e.g., `mitable-cws-publishing`
3. Enable the **Chrome Web Store API**:
   - Navigate to **APIs & Services > Library**
   - Search for "Chrome Web Store API"
   - Click **Enable**
4. Create OAuth credentials:
   - Go to **APIs & Services > Credentials**
   - Click **Create Credentials > OAuth client ID**
   - Application type: **Desktop app**
   - Name: `Mitable CWS CI`
   - Click **Create**
   - Note the **Client ID** and **Client Secret**

### 3. Generate a Refresh Token

The CI workflow needs a long-lived refresh token to authenticate with the CWS API.

```bash
# Install the Chrome Web Store CLI
npm install -g chrome-webstore-upload-cli

# Generate a refresh token interactively
chrome-webstore-upload generate-token \
  --client-id="YOUR_CLIENT_ID" \
  --client-secret="YOUR_CLIENT_SECRET"
```

This opens a browser window to authorize the app. After granting access, the CLI prints a refresh token. Save it — you'll need it for GitHub secrets.

### 4. Get the Extension ID

After the first manual upload to CWS (required before automation works):

1. Go to the [Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Click **New Item**
3. Upload a zip of the `apps/chrome-extension/` directory
4. Fill in the required listing details (see [Store Listing Requirements](#store-listing-requirements) below)
5. Save as draft — do not publish yet
6. Copy the **Extension ID** from the dashboard URL

## GitHub Secrets

Configure these four secrets in the repository settings (**Settings > Secrets and variables > Actions**):

| Secret              | Description                         |
| ------------------- | ----------------------------------- |
| `CWS_CLIENT_ID`     | Google Cloud OAuth client ID        |
| `CWS_CLIENT_SECRET` | Google Cloud OAuth client secret    |
| `CWS_REFRESH_TOKEN` | Refresh token from step 3 above     |
| `CWS_EXTENSION_ID`  | Extension ID from the CWS dashboard |

## CI Workflow

Create `.github/workflows/release-chrome-extension.yml`:

```yaml
name: Release Chrome Extension

on:
  push:
    tags:
      - "chrome-v*"

permissions:
  contents: write

jobs:
  publish:
    name: Build & Publish to Chrome Web Store
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install dependencies
        working-directory: apps/chrome-extension
        run: npm install

      - name: Sync version from tag
        working-directory: apps/chrome-extension
        run: |
          VERSION=${GITHUB_REF_NAME#chrome-v}
          echo "VERSION=$VERSION" >> $GITHUB_ENV
          # Update manifest.json version
          jq --arg v "$VERSION" '.version = $v' manifest.json > tmp.json && mv tmp.json manifest.json
          echo "Set version to $VERSION"
          cat manifest.json | grep '"version"'

      - name: Build extension
        working-directory: apps/chrome-extension
        run: npm run build

      - name: Package extension
        working-directory: apps/chrome-extension
        run: |
          mkdir -p ../chrome-extension-release
          zip -r ../chrome-extension-release/chrome-extension-${{ env.VERSION }}.zip \
            manifest.json \
            dist/ \
            popup/ \
            icons/ \
            -x "*.ts" "*.map" "node_modules/*" "tsconfig.json" "build.mjs" "package.json" "package-lock.json"

      - name: Upload to Chrome Web Store
        uses: mnao305/chrome-extension-upload@v5.0.0
        with:
          file-path: apps/chrome-extension-release/chrome-extension-${{ env.VERSION }}.zip
          extension-id: ${{ secrets.CWS_EXTENSION_ID }}
          client-id: ${{ secrets.CWS_CLIENT_ID }}
          client-secret: ${{ secrets.CWS_CLIENT_SECRET }}
          refresh-token: ${{ secrets.CWS_REFRESH_TOKEN }}
          publish: true

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: apps/chrome-extension-release/chrome-extension-${{ env.VERSION }}.zip
          draft: false
          prerelease: false
          generate_release_notes: true
```

## Manual R2 Upload (Interim)

While Chrome Web Store review is pending, distribute the extension as a zip download from the Cloudflare R2 CDN. This uses the same R2 bucket and credentials already configured for Electron releases.

### Build and upload

```bash
# 1. Package the extension (from repo root)
cd apps/chrome-extension
zip -r mitable-browser-bridge.zip \
  manifest.json \
  dist/ \
  popup/ \
  icons/ \
  -x "*.ts" "*.map" "node_modules/*" "tsconfig.json" "build.mjs" "package.json" "package-lock.json"

# 2. Upload to R2 (uses S3-compatible API)
#    Credentials: R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY from GitHub secrets
#    Endpoint: Cloudflare R2 (set in AWS CLI profile or inline)
aws s3 cp mitable-browser-bridge.zip \
  s3://pub-56941275957b42049f3bad9b4bf1daa9/mitable-browser-bridge.zip \
  --endpoint-url https://<ACCOUNT_ID>.r2.cloudflarestorage.com

# 3. Verify the public URL
curl -I https://pub-56941275957b42049f3bad9b4bf1daa9.r2.dev/mitable-browser-bridge.zip
```

The download URL referenced in the [install guide](./chrome-extension-install.md) is:
`https://pub-56941275957b42049f3bad9b4bf1daa9.r2.dev/mitable-browser-bridge.zip`

Once the extension is approved on the Chrome Web Store, this interim step is no longer needed.

## Release Process

Once setup is complete, releasing is a two-step process:

```bash
# 1. Update version in manifest.json
# Edit apps/chrome-extension/manifest.json → set "version": "1.1.0"

# 2. Commit, tag, and push
git add apps/chrome-extension/manifest.json
git commit -m "chore: bump chrome extension to 1.1.0"
git tag chrome-v1.1.0
git push origin main --tags
```

The workflow automatically builds, packages, uploads to CWS, and creates a GitHub Release.

## Permission Review Expectations

The extension uses `<all_urls>` for both `host_permissions` and `content_scripts`. This triggers additional review from the Chrome Web Store team.

**Expect:**

- Review may take **several business days** (vs. hours for simpler extensions)
- CWS may request a justification for broad host access
- Prepare a clear explanation: "The extension enables AI-powered browser automation on any page the user is viewing. It requires access to all URLs because the user can trigger automation on any website."

**Mitigations that may speed up review:**

- Include a clear privacy policy (see below)
- The extension only activates when the user has the Mitable desktop app running
- No data is sent to external servers — all communication is local (localhost WebSocket)

## Store Listing Requirements

Prepare these assets before the first submission:

| Requirement            | Details                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Name**               | Mitable Browser Bridge                                                                                                    |
| **Summary**            | Connects Chrome to the Mitable desktop app for AI-powered browser automation                                              |
| **Description**        | Detailed description of what the extension does, who it's for, and how it works. Mention the local-only connection model. |
| **Category**           | Productivity                                                                                                              |
| **Icon**               | 128x128 PNG (already at `icons/icon-128.png`)                                                                             |
| **Screenshots**        | At least 1 screenshot (1280x800 or 640x400). Show the popup connected state.                                              |
| **Privacy policy URL** | Required. Must describe what data the extension accesses and how it's used. Host on the Mitable website.                  |
| **Single purpose**     | CWS requires extensions to have a single, clear purpose. Ours: "Bridge between Chrome and the Mitable desktop app."       |
