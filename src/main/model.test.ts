import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedApplication, decodeState, preferences, themeId } from "./model";
test("platform paths support spaces and Unicode, reject executable substitutions", () => {
  assert.equal(allowedApplication("/Applications/豆包.app", "darwin"), true);
  assert.equal(
    allowedApplication("C:\\Program Files\\WorkBuddy\\WorkBuddy.exe", "win32"),
    true,
  );
  assert.equal(
    allowedApplication("C:\\Users\\用户\\Desktop\\豆包.lnk", "win32"),
    true,
  );
  for (const bad of ["relative.app", "/tmp/run.sh", "/tmp/app.app\0.sh"])
    assert.equal(allowedApplication(bad, "darwin"), false);
  assert.equal(allowedApplication("javascript:alert(1)", "win32"), false);
});
test("settings reject values that could leave an overlay stuck", () => {
  for (const duration of [NaN, Infinity, -1, 0, 3001])
    assert.throws(() => preferences({ duration, reducedMotion: false }));
  assert.deepEqual(preferences({ duration: 1400, reducedMotion: true }), {
    duration: 1400,
    reducedMotion: true,
  });
  assert.throws(() => themeId("unknown"));
});
test("persisted configuration rejects duplicate IDs and unsafe URLs", () => {
  const target = { id: "one", name: "应用", path: null, theme: "portal" };
  const state = {
    version: 1,
    targets: [target],
    preferences: { duration: 1400, reducedMotion: false },
  };
  assert.equal(decodeState(state).targets[0].name, "应用");
  assert.throws(() => decodeState({ ...state, targets: [target, target] }));
  assert.throws(() =>
    decodeState({
      ...state,
      targets: [{ ...target, url: "file:///etc/passwd" }],
    }),
  );
});
