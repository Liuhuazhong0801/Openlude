import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { Arch, Platform, build } from "electron-builder";

const root = path.resolve(import.meta.dirname, "..");
const option = process.argv.indexOf("--arch");
const arch = option >= 0 ? process.argv[option + 1] : process.arch;
if (!["darwin", "win32"].includes(process.platform) || !["arm64", "x64"].includes(arch))
  throw new Error("Preview packaging supports macOS arm64/x64 and Windows x64.");
if (process.platform === "win32" && arch !== "x64") throw new Error("The Windows preview supports x64.");
const platform = process.platform === "darwin" ? "macos" : "windows";
const suffix = `${platform}-${arch}`;
const output = path.join(root, "release/preview", suffix);
const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
process.env.CSC_IDENTITY_AUTO_DISCOVERY = "false";
const mac = process.platform === "darwin";
// Preview builds use only the ad-hoc "-" identity, including in PR CI. No signing
// certificate or keychain is provisioned by this workflow.
if (mac) process.env.CSC_FOR_PULL_REQUEST = "true";
// Verify the runtime against the checksums shipped in our lockfile-pinned Electron package.
const electronRequire = createRequire(path.join(root, "node_modules/electron/install.js"));
const { downloadArtifact } = electronRequire("@electron/get");
const checksums = electronRequire("./checksums.json");
const runtimeZip = await downloadArtifact({ version: pkg.devDependencies.electron, artifactName: "electron",
  platform: process.platform, arch, checksums });
const electronDist = path.join(output, "electron-dist");
await fs.rm(electronDist, { recursive: true, force: true });
await electronRequire("@electron-internal/extract-zip").extract(runtimeZip, { dir: electronDist });
await build({
  projectDir: root,
  targets: (mac ? Platform.MAC : Platform.WINDOWS).createTarget(mac ? ["dmg", "zip"] : ["nsis"], Arch[arch]),
  publish: "never",
  config: {
    directories: { output },
    electronDist,
    artifactName: `Openlude-\${version}-${suffix}${mac ? "" : "-setup"}.\${ext}`,
    forceCodeSigning: false,
    ...(mac ? { mac: { identity: "-", notarize: false } } : {}),
  },
});
const files = [];
for (const name of (await fs.readdir(output)).sort()) {
  if (!/\.(dmg|zip|exe)$/.test(name)) continue;
  const file = path.join(output, name);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  files.push({ name, bytes: (await fs.stat(file)).size, sha256: hash.digest("hex") });
}
if (files.length !== (mac ? 2 : 1)) throw new Error("Preview installers are incomplete.");
const downloads = path.join(output, "downloads");
await fs.mkdir(downloads, { recursive: true });
for (const file of files) await fs.copyFile(path.join(output, file.name), path.join(downloads, file.name));
await fs.writeFile(path.join(downloads, `build-info-${suffix}.json`), JSON.stringify({
  version: pkg.version, platform, arch, commit, preview: true,
  signing: mac ? "ad-hoc; not notarized" : "unsigned",
  files,
}, null, 2) + "\n");
await fs.writeFile(path.join(downloads, `SHA256SUMS-${suffix}.txt`), files.map(file => `${file.sha256}  ${file.name}`).join("\n") + "\n");
console.log(`Preview packages: ${downloads}`);
