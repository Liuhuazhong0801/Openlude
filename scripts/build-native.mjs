import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "dist-native");
await fs.mkdir(output, { recursive: true });
if (process.platform === "darwin") {
  const source = path.join(root, "native/launch-observer-macos.swift");
  const sourceTime = (await fs.stat(source)).mtimeMs;
  for (const arch of ["arm64", "x86_64"]) {
    const destination = path.join(output, `launch-observer-darwin-${arch === "x86_64" ? "x64" : arch}`);
    const builtTime = await fs.stat(destination).then(s => s.mtimeMs).catch(() => 0);
    if (builtTime >= sourceTime) continue;
    await exec("xcrun", ["swiftc", "-O", "-swift-version", "5", "-target", `${arch}-apple-macos12.0`, source, "-o", destination], { timeout: 90000 });
    console.log(`Built launch observer (${arch})`);
  }
}
