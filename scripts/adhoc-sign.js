// electron-builder afterPack hook.
//
// Without a Developer ID certificate, electron-builder leaves Cue.app with only
// the linker's partial signature, which macOS reports as "damaged" once the app
// is downloaded, with no way to open it except a Terminal command. A complete
// ad-hoc signature makes macOS offer "Open Anyway" in Privacy & Security
// instead. When a real certificate is configured (CSC_LINK / CSC_NAME),
// electron-builder signs over this as usual.
const { execFileSync } = require("child_process");
const path = require("path");

exports.default = async function adhocSign({ electronPlatformName, appOutDir, packager }) {
  if (electronPlatformName !== "darwin" || process.env.CSC_LINK || process.env.CSC_NAME) return;
  const app = path.join(appOutDir, `${packager.appInfo.productFilename}.app`);
  const entitlements = path.join(__dirname, "..", "build", "entitlements.mac.plist");
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", "--options", "runtime", "--entitlements", entitlements, app], { stdio: "inherit" });
};
