# Release Process

## Quick Release

To create a new release, simply bump the version and push a tag:

```bash
# 1. Bump version in apps/electron/package.json
npm version patch --workspace=apps/electron   # 0.1.12 → 0.1.13
# or: npm version minor --workspace=apps/electron   # 0.1.12 → 0.2.0
# or: npm version major --workspace=apps/electron   # 0.1.12 → 1.0.0

# 2. Commit the version bump
git add apps/electron/package.json
git commit -m "chore: bump version to $(node -p "require('./apps/electron/package.json').version")"

# 3. Create and push tag
git tag v$(node -p "require('./apps/electron/package.json').version")
git push origin main --tags
```

That's it! The GitHub Action automatically:

- Builds macOS (arm64 + x64) with code signing and notarization
- Builds Windows (x64)
- Uploads artifacts to Cloudflare R2 (fast CDN with Lagos edge node)
- Creates GitHub Release with all artifacts

## What Gets Built

| Platform | Artifacts                                                                   |
| -------- | --------------------------------------------------------------------------- |
| macOS    | `Mitable-{version}-arm64.dmg`, `Mitable-{version}-x64.dmg`, `.zip` variants |
| Windows  | `Mitable-{version}-x64.exe`                                                 |

## Auto-Update Files

The workflow also uploads `latest-mac.yml` and `latest.yml` to R2, which `electron-updater` uses to check for updates.

## Build Time

- **Windows**: ~8 minutes
- **macOS**: ~20-25 minutes (includes Apple notarization)

## Monitoring

Watch build progress:

```bash
gh run list --workflow=release.yml --limit=3
gh run view <run-id>
```

## Troubleshooting

### Build failed?

Check logs: `gh run view <run-id> --log-failed`

### Need to re-release same version?

```bash
# Delete and recreate tag
git tag -d v0.1.12
git push origin :refs/tags/v0.1.12
git tag v0.1.12
git push origin v0.1.12
```

## Infrastructure

- **Primary CDN**: Cloudflare R2 (`mitable-releases` bucket)
- **Fallback**: GitHub Releases
- **Code Signing**: Apple Developer certificate (macOS only)
- **Notarization**: Apple notary service (macOS only)
