# Build Resources

This directory contains resources needed for packaging the Electron application across different platforms.

## Required Icons

For complete build support across all platforms, you'll need to add the following icon files:

### Windows
- **icon.ico** (256x256 or multi-size .ico file)
  - Used for: Application icon, installer, shortcuts
  - Generate from: PNG using tools like ImageMagick or online converters

### macOS
- **icon.icns** (1024x1024 base size with multiple resolutions)
  - Used for: Application icon, DMG installer
  - Generate from: PNG using `iconutil` or tools like Image2Icon
  
- **entitlements.mac.plist** (macOS code signing entitlements)
  - Required for: Mac App Store builds and notarization
  - Can be created when needed for production builds

### Linux
- **icon.png** (512x512 or 1024x1024 PNG)
  - Used for: Application icon in AppImage and .deb packages

## Current Status

⚠️ **Icons not yet added** - Development mode works without icons. Icons are only required when building distributable packages using:
- `npm run build:win`
- `npm run build:mac`
- `npm run build:linux`

## How to Add Icons

1. Create a base icon (1024x1024 PNG recommended)
2. Use icon generation tools to create platform-specific formats:
   - Windows: Use ImageMagick or icon converters
   - macOS: Use `iconutil` command-line tool
   - Linux: Use the PNG directly

3. Place the generated files in this directory

## References

- [electron-builder Icon Documentation](https://www.electron.build/icons)
- [Electron Icon Requirements](https://www.electronjs.org/docs/latest/tutorial/application-distribution#icons)
