import test from "node:test";
import assert from "node:assert/strict";
import { parseStableRelease, hasNativeUpdateMetadata, PROJECT_URL } from "./release-info";

const release = (assets: string[] = []) => ({ tag_name: "v1.0.0", draft: false, prerelease: false, assets: assets.map(name => ({ name })) });

test("ordinary installer releases work without updater metadata or external download URLs", () => {
  const info = parseStableRelease({ ...release(["Openlude-1.0.0-macos-arm64.dmg"]), html_url: "https://untrusted.example/download" });
  assert.equal(info.version, "1.0.0");
  assert.equal(info.downloadPage, `${PROJECT_URL}/releases/tag/v1.0.0`);
  assert.equal(hasNativeUpdateMetadata(info, "darwin"), false);
  assert.equal(hasNativeUpdateMetadata(info, "win32"), false);
});

test("native update support depends on the current platform's release metadata", () => {
  const mac = parseStableRelease(release(["latest-mac.yml"]));
  const windows = parseStableRelease(release(["latest.yml"]));
  assert.equal(hasNativeUpdateMetadata(mac, "darwin"), true);
  assert.equal(hasNativeUpdateMetadata(mac, "win32"), false);
  assert.equal(hasNativeUpdateMetadata(windows, "darwin"), false);
  assert.equal(hasNativeUpdateMetadata(windows, "win32"), true);
  assert.equal(hasNativeUpdateMetadata(windows, "linux"), false);
});

test("drafts, prereleases and malformed release responses cannot become install prompts", () => {
  for (const invalid of [null, {}, { ...release(), draft: true }, { ...release(), prerelease: true },
    { ...release(), tag_name: "v1.0.0-rc.1" }, { ...release(), tag_name: "../../other-repo" },
    { ...release(), assets: [null] }, { ...release(), assets: null }])
    assert.throws(() => parseStableRelease(invalid));
});
