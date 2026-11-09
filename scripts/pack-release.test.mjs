import test from "node:test";
import assert from "node:assert/strict";
import { assertMacRelease } from "./pack-release.mjs";

test("release preflight refuses missing or ad-hoc identities even when notarization is configured", () => {
  const environment = { APPLE_KEYCHAIN_PROFILE: "test-profile" };
  assert.throws(() => assertMacRelease(environment, "0 valid identities found"), /Developer ID/);
  assert.throws(() => assertMacRelease({ ...environment, CSC_LINK: "certificate.p12" }, "", "-"), /ad-hoc/);
  assert.throws(() => assertMacRelease({ ...environment, CSC_LINK: "certificate.p12", CSC_NAME: "-" }, ""), /ad-hoc/);
});
test("release preflight requires notarization and accepts supported credential sources", () => {
  const identities = '1) ABC "Developer ID Application: Example (TEAM)"';
  assert.throws(() => assertMacRelease({}, identities), /公证/);
  assert.doesNotThrow(() => assertMacRelease({ APPLE_KEYCHAIN_PROFILE: "test-profile" }, identities));
  assert.doesNotThrow(() => assertMacRelease({ CSC_LINK: "certificate.p12", APPLE_API_KEY: "key.p8", APPLE_API_KEY_ID: "ID", APPLE_API_ISSUER: "ISSUER" }, ""));
});
