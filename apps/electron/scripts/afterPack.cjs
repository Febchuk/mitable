const { execSync } = require("child_process");
const path = require("path");

exports.default = async function afterPack(context) {
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);

  console.log(`Cleaning extended attributes from ${appPath}...`);

  try {
    // Remove extended attributes (resource forks, Finder info, etc.)
    execSync(`xattr -cr "${appPath}"`, { stdio: "inherit" });
    console.log("Extended attributes cleaned successfully.");
  } catch (error) {
    console.warn("Warning: Could not clean extended attributes:", error.message);
  }
};
