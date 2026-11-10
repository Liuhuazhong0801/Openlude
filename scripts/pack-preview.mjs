import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { Arch, Platform, build } from "electron-builder";
import { installerTarget } from "./installer-target.mjs";

const root = path.resolve(import.meta.dirname, "..");
const { arch, platform, suffix, mac } = installerTarget(process.argv.slice(2));
const preview = !process.argv.includes("--release");
const output = path.join(root, preview ? "release/preview" : "release/installers", suffix);
const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const uncommittedChanges = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim().length > 0;
process.env.CSC_IDENTITY_AUTO_DISCOVERY = "false";
// Ordinary installers use ad-hoc Mac signing and require no developer account.
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
if (files.length !== (mac ? 2 : 1)) throw new Error("Installers are incomplete.");
const downloads = path.join(output, "downloads");
await fs.mkdir(downloads, { recursive: true });
for (const file of files) await fs.copyFile(path.join(output, file.name), path.join(downloads, file.name));
await fs.writeFile(path.join(downloads, `build-info-${suffix}.json`), JSON.stringify({
  version: pkg.version, platform, arch, commit, uncommittedChanges, preview,
  signing: mac ? "ad-hoc; not notarized" : "unsigned",
  files,
}, null, 2) + "\n");
await fs.writeFile(path.join(downloads, `SHA256SUMS-${suffix}.txt`), files.map(file => `${file.sha256}  ${file.name}`).join("\n") + "\n");
console.log(`${preview ? "Preview packages" : "Installers"}: ${downloads}`);
