# macOS Code Signing & Notarization Guide

This document explains how to build signed and notarized macOS DMGs for Mitable.

## Prerequisites

1. **Apple Developer Account** - Enrolled in Apple Developer Program ($99/year)
2. **Developer ID Certificate** - "Developer ID Application" certificate installed in Keychain
3. **App-Specific Password** - Generated from appleid.apple.com (NOT your Apple ID password)
4. **Xcode** - Required for notarytool

### Verify Certificate Installation

```bash
security find-identity -v -p codesigning
```

Should show: `"Developer ID Application: Febe Chukwuma (LUV3R68DAA)"`

## Environment Setup

### 1. Create `.env.signing` file

In `apps/electron/`, create `.env.signing`:

```bash
# Apple Developer Signing Credentials
export APPLE_ID=your-apple-id@email.com
export APPLE_ID_PASSWORD=xxxx-xxxx-xxxx-xxxx  # App-specific password
export APPLE_TEAM_ID=XXXXXXXXXX               # 10-character team ID
```

> **Security**: This file is gitignored. Never commit credentials.

### 2. Generate App-Specific Password

1. Go to https://appleid.apple.com
2. Sign in → Security → App-Specific Passwords
3. Generate a new password for "Mitable Build"
4. Use this in `APPLE_ID_PASSWORD` (format: `xxxx-xxxx-xxxx-xxxx`)

## Building Signed DMGs

### Quick Build (Both Architectures)

```bash
cd apps/electron
source .env.signing
export ELECTRON_CACHE=~/.electron-cache
npm run build:mac
```

### Build Specific Architecture

```bash
# Apple Silicon (M1/M2/M3)
npm run build:mac:arm64

# Intel
npm run build:mac:x64
```

### Output Location

DMGs are output to `/tmp/mitable-dist/`:

- `Mitable-{version}-arm64.dmg` - Apple Silicon
- `Mitable-{version}-x64.dmg` - Intel

## Verification

### Verify Code Signature

```bash
codesign --verify --deep --strict --verbose=4 /tmp/mitable-dist/mac/Mitable.app
```

### Verify Notarization

```bash
spctl --assess --type execute --verbose /tmp/mitable-dist/mac/Mitable.app
```

Expected output: `accepted`

### Check Notarization History

```bash
xcrun notarytool history --apple-id "$APPLE_ID" --password "$APPLE_ID_PASSWORD" --team-id "$APPLE_TEAM_ID"
```

## Configuration Reference

### electron-builder.yml (Key Settings)

```yaml
mac:
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  identity: "Febe Chukwuma (LUV3R68DAA)"
  notarize:
    teamId: LUV3R68DAA

directories:
  output: /tmp/mitable-dist # Outside iCloud!

files:
  - "out/**/*"
  - "package.json"
  - "node_modules/get-windows/**/*"
  - "node_modules/active-win/**/*"
  - "node_modules/msgpackr-extract/**/*"
  - "node_modules/electron-store/**/*"
  - "node_modules/electron-log/**/*"
```

### Entitlements (build/entitlements.mac.plist)

Required for Electron apps with hardened runtime:

- `com.apple.security.cs.allow-jit`
- `com.apple.security.cs.allow-unsigned-executable-memory`
- `com.apple.security.cs.disable-library-validation`

## Troubleshooting

### "resource fork, Finder information, or similar detritus not allowed"

**Cause**: Project is in iCloud Drive synced folder (Documents).

**Solution**:

1. Set output directory outside iCloud: `output: /tmp/mitable-dist`
2. Use custom electron cache: `export ELECTRON_CACHE=~/.electron-cache`

### "The teamId property is required"

**Solution**: Add teamId to notarize config:

```yaml
notarize:
  teamId: LUV3R68DAA
```

### App size too large (>2GB)

**Cause**: node_modules being bundled.

**Solution**: Update `files` config to only include necessary files:

```yaml
files:
  - "out/**/*"
  - "package.json"
  - "!node_modules" # Exclude all
  # Then include specific native modules
```

### Notarization timeout

Notarization can take 5-15 minutes. If electron-builder times out:

```bash
# Check status
xcrun notarytool history --apple-id "$APPLE_ID" --password "$APPLE_ID_PASSWORD" --team-id "$APPLE_TEAM_ID"

# Wait for specific submission
xcrun notarytool wait <submission-id> --apple-id "$APPLE_ID" --password "$APPLE_ID_PASSWORD" --team-id "$APPLE_TEAM_ID"
```

## Creating a Release

```bash
gh release create v{VERSION} \
  /tmp/mitable-dist/Mitable-{VERSION}-arm64.dmg \
  /tmp/mitable-dist/Mitable-{VERSION}-x64.dmg \
  /tmp/mitable-dist/Mitable-{VERSION}-arm64-mac.zip \
  /tmp/mitable-dist/Mitable-{VERSION}-x64-mac.zip \
  /tmp/mitable-dist/latest-mac.yml \
  --title "Mitable v{VERSION}" \
  --notes "Release notes here"
```

> **Important**: Always include all files:
>
> - **DMG files**: For manual download/installation (user-friendly installer)
> - **ZIP files**: Required for auto-updates (`electron-updater` extracts ZIP, not DMG)
> - **latest-mac.yml**: Update manifest with version info and checksums

## Auto-Updates (Private Repo)

Since `Febchuk/mitable` is a private repository, `electron-updater` requires a GitHub Personal Access Token (PAT) to access releases. The token is embedded at **build time**.

### 1. Create GitHub PAT

1. Go to GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens**
2. Create new token:
   - **Name**: `mitable-auto-update`
   - **Repository access**: Select `Febchuk/mitable`
   - **Permissions**: Contents (Read), Metadata (Read)
3. Copy the token (starts with `github_pat_...`)

### 2. Add to `.env.signing`

Update `apps/electron/.env.signing` to include the GitHub token:

```bash
# Apple Developer Signing Credentials
export APPLE_ID=your-apple-id@email.com
export APPLE_ID_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=XXXXXXXXXX

# GitHub Token for Auto-Updates (private repo)
export GH_TOKEN=github_pat_xxxxxxxxx
```

### 3. Build with Token

The token is automatically picked up when building:

```bash
cd apps/electron
source .env.signing
npm run build:mac
```

electron-builder embeds the token into `app-update.yml` inside the built app.

### 4. Verify Token is Embedded

After building, check the token is present:

```bash
cat /tmp/mitable-dist/mac-arm64/Mitable.app/Contents/Resources/app-update.yml
```

Should contain a `token:` field with your PAT.

### Configuration

The `electron-builder.yml` publish config includes `private: true` and `token`:

```yaml
publish:
  provider: github
  owner: Febchuk
  repo: mitable
  releaseType: release
  private: true
  token: ${env.GH_TOKEN} # Reads from environment at build time
```

### How Auto-Updates Work

1. App checks GitHub releases every 4 hours (or manually via Settings → About)
2. `electron-updater` uses the embedded token to authenticate
3. If update found, user sees "Download Update" banner
4. Download happens in-app with progress bar
5. User clicks "Install & Restart" to apply update

### Security Notes

- Token has **read-only** access to releases
- Token is embedded in distributed app binary (acceptable for private distribution)
- **Never commit** `.env.signing` to the repo
- Rotate token periodically if distributing to external users

## CI/CD Considerations

For GitHub Actions, store credentials as secrets:

- `APPLE_ID`
- `APPLE_ID_PASSWORD`
- `APPLE_TEAM_ID`
- `GH_TOKEN` - GitHub PAT for auto-updates (or use `secrets.GITHUB_TOKEN` for same-repo releases)

The signing certificate needs to be exported as .p12 and imported into the CI runner's keychain.

## Quick Reference

| Task                | Command                                                                |
| ------------------- | ---------------------------------------------------------------------- |
| Build both          | `source .env.signing && npm run build:mac`                             |
| Build arm64         | `source .env.signing && npm run build:mac:arm64`                       |
| Build x64           | `source .env.signing && npm run build:mac:x64`                         |
| Verify signature    | `codesign --verify --deep --strict /path/to/Mitable.app`               |
| Verify notarization | `spctl --assess --type execute --verbose /path/to/Mitable.app`         |
| Check history       | `xcrun notarytool history --apple-id ... --password ... --team-id ...` |
