export const PROJECT_URL = "https://github.com/Liuhuazhong0801/Openlude";

export interface StableRelease {
  version: string;
  downloadPage: string;
  assets: string[];
}

/** Only accept stable release tags and build download links on our own repository. */
export function parseStableRelease(value: unknown): StableRelease {
  if (!value || typeof value !== "object") throw new Error("Invalid release data");
  const data = value as Record<string, unknown>;
  const version = typeof data.tag_name === "string" && /^v?(\d+\.\d+\.\d+(?:\+[0-9A-Za-z.-]+)?)$/.exec(data.tag_name)?.[1];
  if (!version || data.draft !== false || data.prerelease !== false || !Array.isArray(data.assets))
    throw new Error("Invalid stable release");
  const assets = data.assets.map((asset: unknown) => {
    if (!asset || typeof asset !== "object" || typeof (asset as { name?: unknown }).name !== "string")
      throw new Error("Invalid release asset");
    return (asset as { name: string }).name;
  });
  return { version, assets, downloadPage: `${PROJECT_URL}/releases/tag/${encodeURIComponent(data.tag_name as string)}` };
}

export function hasNativeUpdateMetadata(release: StableRelease, platform: string): boolean {
  const metadata = platform === "darwin" ? "latest-mac.yml" : platform === "win32" ? "latest.yml" : undefined;
  return metadata !== undefined && release.assets.includes(metadata);
}
