import { app, nativeImage } from "electron";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

const exec = promisify(execFile);
const cache = new Map<string, Promise<string | undefined>>();
const iconSize = 256;
async function pngIcon(file: string): Promise<string | undefined> {
  try {
    const image = nativeImage.createFromPath(file);
    if (image.isEmpty()) return undefined;
    return image
      .resize({ width: iconSize, height: iconSize, quality: "best" })
      .toDataURL();
  } catch {
    return undefined;
  }
}

async function macBundleIcon(bundle: string): Promise<string | undefined> {
  const resources = path.join(bundle, "Contents/Resources");
  const info = await exec(
    "/usr/bin/plutil",
    ["-convert", "json", "-o", "-", path.join(bundle, "Contents/Info.plist")],
    { timeout: 2500 },
  );
  const plist = JSON.parse(info.stdout) as Record<string, unknown>;

  // Codex can share an Electron bundle name and generic ChatGPT icon.
  // Use the actual Codex resource only when its bundle identity matches.
  if (plist.CFBundleIdentifier === "com.openai.codex") {
    for (const name of ["icon-codex-light.png", "icon-codex-dark-color.png"]) {
      const icon = await pngIcon(path.join(resources, name));
      if (icon) return icon;
    }
  }

  const declared = plist.CFBundleIconFile;
  if (typeof declared !== "string" || !declared) return undefined;
  const candidates = path.extname(declared)
    ? [declared]
    : [`${declared}.icns`, `${declared}.png`];
  for (const candidate of candidates) {
    const source = path.resolve(resources, candidate);
    if (!source.startsWith(resources + path.sep)) continue;
    const stat = await fs.stat(source).catch(() => null);
    if (!stat?.isFile() || stat.size > 20 * 1024 * 1024) continue;
    if (path.extname(source).toLowerCase() !== ".icns") {
      const icon = await pngIcon(source);
      if (icon) return icon;
      continue;
    }
    const temporary = await fs.mkdtemp(
      path.join(app.getPath("temp"), "timegate-icon-"),
    );
    try {
      const output = path.join(temporary, "icon.png");
      await exec(
        "/usr/bin/sips",
        ["-s", "format", "png", source, "--out", output],
        { timeout: 3000 },
      );
      const icon = await pngIcon(output);
      if (icon) return icon;
    } finally {
      await fs.rm(temporary, { recursive: true, force: true });
    }
  }
  return undefined;
}

export async function applicationIcon(
  file: string,
): Promise<string | undefined> {
  const stat = await fs.stat(file).catch(() => null);
  if (!stat) return undefined;
  const key = `${file}:${stat.mtimeMs}`;
  let cached = cache.get(key);
  if (!cached) {
    cached = (async () => {
      if (process.platform === "darwin") {
        const icon = await macBundleIcon(file).catch(() => undefined);
        if (icon) return icon;
      }
      const icon = await app
        .getFileIcon(file, {
          size: process.platform === "darwin" ? "normal" : "large",
        })
        .catch(() => undefined);
      return icon && !icon.isEmpty() ? icon.toDataURL() : undefined;
    })();
    cache.set(key, cached);
    // Keep a bounded in-memory cache when app versions or paths change.
    if (cache.size > 200) cache.delete(cache.keys().next().value!);
  }
  return cached;
}
