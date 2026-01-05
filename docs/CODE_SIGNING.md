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
  output: /tmp/mitable-dist  # Outside iCloud!

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
  - "!node_modules"  # Exclude all
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
gh release create v0.1.7 \
  /tmp/mitable-dist/Mitable-0.1.7-arm64.dmg \
  /tmp/mitable-dist/Mitable-0.1.7-x64.dmg \
  --title "Mitable v0.1.7" \
  --notes "Release notes here"
```

## CI/CD Considerations

For GitHub Actions, store credentials as secrets:
- `APPLE_ID`
- `APPLE_ID_PASSWORD`
- `APPLE_TEAM_ID`

The signing certificate needs to be exported as .p12 and imported into the CI runner's keychain.

## Quick Reference

| Task | Command |
|------|---------|
| Build both | `source .env.signing && npm run build:mac` |
| Build arm64 | `source .env.signing && npm run build:mac:arm64` |
| Build x64 | `source .env.signing && npm run build:mac:x64` |
| Verify signature | `codesign --verify --deep --strict /path/to/Mitable.app` |
| Verify notarization | `spctl --assess --type execute --verbose /path/to/Mitable.app` |
| Check history | `xcrun notarytool history --apple-id ... --password ... --team-id ...` |
