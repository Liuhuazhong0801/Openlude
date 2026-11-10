import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { installerTarget } from "./installer-target.mjs";

export function assertMacRelease(environment, identities, configuredIdentity) {
  if (configuredIdentity === "-" || environment.CSC_NAME === "-")
    throw new Error("已签名 Mac 包不能使用 ad-hoc 签名；普通安装包请运行 npm run pack:release。");
  if (!environment.CSC_LINK && !identities.includes("Developer ID Application:"))
    throw new Error("已签名 Mac 包需要 Developer ID Application 证书（钥匙串或 CSC_LINK）；普通安装包请运行 npm run pack:release。");
  const notarization = (environment.APPLE_ID && environment.APPLE_APP_SPECIFIC_PASSWORD && environment.APPLE_TEAM_ID) ||
    (environment.APPLE_API_KEY && environment.APPLE_API_KEY_ID && environment.APPLE_API_ISSUER) || environment.APPLE_KEYCHAIN_PROFILE;
  if (!notarization) throw new Error("已签名 Mac 包需要 Apple 公证凭据：Apple ID、API Key 或钥匙串公证配置。");
}

async function run() {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const { arch } = installerTarget(process.argv.slice(2));
  if (!process.argv.includes("--signed")) {
    if (process.argv.includes("--check")) {
      console.log("Installer packaging supports this target; developer signing and notarization are optional.");
      return;
    }
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("./pack-preview.mjs", import.meta.url)), "--release", ...process.argv.slice(2)], { cwd: root, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Installer packaging failed (${result.status ?? result.signal}).`);
    return;
  }
  if (process.platform !== "darwin") throw new Error("已签名 Mac 包需要在 macOS 上构建。");
  const config = JSON.parse(await fs.readFile(new URL("../package.json", import.meta.url), "utf8"));
  const identities = await promisify(execFile)("security", ["find-identity", "-v", "-p", "codesigning"]);
  assertMacRelease(process.env, identities.stdout, config.build.mac.identity);
  if (process.argv.includes("--check")) { console.log("Release signing and notarization prerequisites are configured."); return; }
  const { build, Platform, Arch } = await import("electron-builder");
  await build({ projectDir: root, targets: Platform.MAC.createTarget(["dmg", "zip"], Arch[arch]), publish: "never",
    config: { forceCodeSigning: true, mac: { type: "distribution", notarize: true } } });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch(error => { console.error(error.message); process.exitCode = 1; });
}
