import test from "node:test";
import assert from "node:assert/strict";
import { assertMacRelease } from "./pack-release.mjs";
import { installerTarget } from "./installer-target.mjs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("ordinary installers support both Mac architectures and Windows x64 without a developer account", () => {
  assert.equal(installerTarget(["--arch", "x64"], "darwin", "arm64").suffix, "macos-x64");
  assert.equal(installerTarget([], "darwin", "arm64").suffix, "macos-arm64");
  assert.equal(installerTarget([], "win32", "x64").suffix, "windows-x64");
  assert.throws(() => installerTarget(["--arch"], "darwin", "arm64"), /supports/);
  assert.throws(() => installerTarget(["--arch", "arm64"], "win32", "x64"), /Windows/);
  assert.throws(() => installerTarget([], "linux", "x64"), /supports/);
});
test("ordinary release preflight does not require developer credentials", { skip: !["darwin", "win32"].includes(process.platform) }, () => {
  const output = execFileSync(process.execPath, [fileURLToPath(new URL("./pack-release.mjs", import.meta.url)), "--check"], {
    encoding: "utf8", env: { ...process.env, CSC_LINK: "", CSC_NAME: "", APPLE_KEYCHAIN_PROFILE: "" },
  });
  assert.match(output, /developer signing and notarization are optional/);
});

test("optional signed Mac packaging refuses missing or ad-hoc identities even when notarization is configured", () => {
  const environment = { APPLE_KEYCHAIN_PROFILE: "test-profile" };
  assert.throws(() => assertMacRelease(environment, "0 valid identities found"), /Developer ID/);
  assert.throws(() => assertMacRelease({ ...environment, CSC_LINK: "certificate.p12" }, "", "-"), /ad-hoc/);
  assert.throws(() => assertMacRelease({ ...environment, CSC_LINK: "certificate.p12", CSC_NAME: "-" }, ""), /ad-hoc/);
});
test("optional signed Mac packaging requires notarization and accepts supported credential sources", () => {
  const identities = '1) ABC "Developer ID Application: Example (TEAM)"';
  assert.throws(() => assertMacRelease({}, identities), /公证/);
  assert.doesNotThrow(() => assertMacRelease({ APPLE_KEYCHAIN_PROFILE: "test-profile" }, identities));
  assert.doesNotThrow(() => assertMacRelease({ CSC_LINK: "certificate.p12", APPLE_API_KEY: "key.p8", APPLE_API_KEY_ID: "ID", APPLE_API_ISSUER: "ISSUER" }, ""));
});
