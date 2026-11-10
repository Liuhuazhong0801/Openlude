import test from "node:test";
import assert from "node:assert/strict";
import { requiredReleaseAssets, releaseDownloadsReady } from "./site-release.mjs";

const tag = "v1.0.0";
const release = () => ({ tag_name: tag, draft: false, prerelease: false, assets: requiredReleaseAssets(tag).map(name => ({ name, size: 100 })) });

test("website publication requires all five installers, checksums and three build manifests", () => {
  assert.equal(requiredReleaseAssets(tag).length, 9);
  assert.equal(releaseDownloadsReady(release(), tag), true);
  for (let index = 0; index < 9; index++) {
    const incomplete = release(); incomplete.assets.splice(index, 1);
    assert.equal(releaseDownloadsReady(incomplete, tag), false);
  }
});
test("drafts, previews and other release tags do not activate the new download page", () => {
  assert.equal(releaseDownloadsReady(undefined, tag), false);
  assert.equal(releaseDownloadsReady({ ...release(), draft: true }, tag), false);
  assert.equal(releaseDownloadsReady({ ...release(), prerelease: true }, tag), false);
  assert.equal(releaseDownloadsReady({ ...release(), tag_name: "v0.6.2" }, tag), false);
});
test("empty or malformed assets keep the current website online", () => {
  const empty = release(); empty.assets[0].size = 0;
  assert.equal(releaseDownloadsReady(empty, tag), false);
  assert.equal(releaseDownloadsReady({ ...release(), assets: null }, tag), false);
});
test("the website download tag must identify a stable semantic version", () => {
  for (const invalid of ["main", "v1.0.0-rc.1", "../other", "1.0.0"])
    assert.throws(() => requiredReleaseAssets(invalid));
});
