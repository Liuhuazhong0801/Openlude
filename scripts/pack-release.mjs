import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

export function assertMacRelease(environment, identities, configuredIdentity) {
  if (configuredIdentity === "-" || environment.CSC_NAME === "-")
    throw new Error("正式发布不能使用 ad-hoc 签名；本地预览请运行 npm run pack:mac。");
  if (!environment.CSC_LINK && !identities.includes("Developer ID Application:"))
    throw new Error("正式发布需要 Developer ID Application 证书（钥匙串或 CSC_LINK）；本地预览请运行 npm run pack:mac。");
  const notarization = (environment.APPLE_ID && environment.APPLE_APP_SPECIFIC_PASSWORD && environment.APPLE_TEAM_ID) ||
    (environment.APPLE_API_KEY && environment.APPLE_API_KEY_ID && environment.APPLE_API_ISSUER) || environment.APPLE_KEYCHAIN_PROFILE;
  if (!notarization) throw new Error("正式发布需要 Apple 公证凭据：Apple ID、API Key 或钥匙串公证配置。");
}

async function run() {
  if (process.platform !== "darwin") throw new Error("macOS 正式包需要在 macOS 上构建。");
  const root = fileURLToPath(new URL("../", import.meta.url));
  const config = JSON.parse(await fs.readFile(new URL("../package.json", import.meta.url), "utf8"));
  const identities = await promisify(execFile)("security", ["find-identity", "-v", "-p", "codesigning"]);
  assertMacRelease(process.env, identities.stdout, config.build.mac.identity);
  if (process.argv.includes("--check")) { console.log("Release signing and notarization prerequisites are configured."); return; }
  const { build, Platform } = await import("electron-builder");
  await build({ projectDir: root, targets: Platform.MAC.createTarget(["dmg", "zip"]), publish: "never",
    config: { forceCodeSigning: true, mac: { type: "distribution", notarize: true } } });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch(error => { console.error(error.message); process.exitCode = 1; });
}
