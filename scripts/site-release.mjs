import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

export function requiredReleaseAssets(tag) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error("The website must reference a stable release tag.");
  const version = tag.slice(1);
  return [
    ...["macos-arm64", "macos-x64"].flatMap(platform => ["dmg", "zip"].map(extension => `Openlude-${version}-${platform}.${extension}`)),
    `Openlude-${version}-windows-x64-setup.exe`,
    "SHA256SUMS.txt",
    ...["macos-arm64", "macos-x64", "windows-x64"].map(platform => `build-info-${platform}.json`),
  ];
}

export function releaseDownloadsReady(release, tag) {
  const expected = requiredReleaseAssets(tag);
  return release?.tag_name === tag && release.draft === false && release.prerelease === false &&
    Array.isArray(release.assets) && expected.every(name => release.assets.some(asset => asset?.name === name && asset.size > 0));
}

async function run() {
  const metadata = JSON.parse(await fs.readFile(new URL("../site/metadata.json", import.meta.url), "utf8"));
  const repository = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/?$/.exec(metadata.repository)?.[1];
  if (!repository) throw new Error("Invalid GitHub repository for website downloads.");
  requiredReleaseAssets(metadata.releaseTag);
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const response = await fetch(`https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(metadata.releaseTag)}`, {
    headers: { Accept: "application/vnd.github+json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(15000),
  });
  if (response.status !== 404 && !response.ok) throw new Error(`Cannot verify release downloads (${response.status}).`);
  const ready = response.ok && releaseDownloadsReady(await response.json(), metadata.releaseTag);
  if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, `release_ready=${ready}\n`);
  console.log(ready ? `${metadata.releaseTag}: all release downloads are published.` : `${metadata.releaseTag}: downloads are not published yet; keeping the current website online.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch(error => { console.error(error.message); process.exitCode = 1; });
}
