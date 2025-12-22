const { notarize } = require("@electron/notarize");

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  // Only notarize on macOS
  if (electronPlatformName !== "darwin") {
    console.log("Skipping notarization - not macOS");
    return;
  }

  // Skip notarization if credentials are not set
  if (!process.env.APPLE_ID || !process.env.APPLE_ID_PASSWORD || !process.env.APPLE_TEAM_ID) {
    console.log("Skipping notarization - credentials not set");
    console.log("Set APPLE_ID, APPLE_ID_PASSWORD, and APPLE_TEAM_ID to enable notarization");
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log(`Notarizing ${appPath}...`);
  console.log("This may take several minutes...");

  try {
    await notarize({
      appBundleId: "com.mitable.app",
      appPath: appPath,
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_ID_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    });

    console.log("Notarization complete!");
  } catch (error) {
    console.error("Notarization failed:", error);
    throw error;
  }
};
