import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedApplication, decodeState, preferences, themeId } from "./model";
import { animationDuration, animationFrame } from "../shared/transition";
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
    showAppIcon: true,
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
test("per-app settings preserve legacy defaults and reject invalid overrides", () => {
  const state = {
    version: 1,
    targets: [
      { id: "legacy", name: "Legacy", path: null, theme: "portal" },
      {
        id: "custom",
        name: "Custom",
        path: null,
        theme: "paper",
        preferences: { duration: 900, reducedMotion: true },
      },
    ],
    preferences: { duration: 1800, reducedMotion: false },
  };
  const decoded = decodeState(state);
  assert.equal(decoded.targets[0].preferences, undefined);
  assert.deepEqual(decoded.preferences, { ...state.preferences, showAppIcon: true });
  assert.deepEqual(decoded.targets[1].preferences, {
    duration: 900,
    reducedMotion: true,
    showAppIcon: true,
  });
  assert.throws(() =>
    decodeState({
      ...state,
      targets: [
        {
          ...state.targets[1],
          preferences: { duration: 90000, reducedMotion: true },
        },
      ],
    }),
  );
});
test("the app icon is optional, defaults on for old settings and rejects invalid values", () => {
  const settings = { duration: 1800, reducedMotion: false };
  assert.equal(preferences(settings).showAppIcon, true);
  assert.equal(preferences({ ...settings, showAppIcon: false }).showAppIcon, false);
  for (const showAppIcon of [null, "false", 0, []])
    assert.throws(() => preferences({ ...settings, showAppIcon }));
});
test("identity precedes motion and motion continues during the reveal", () => {
  const settings = { duration: 1800, reducedMotion: false, showAppIcon: true };
  const intro = animationFrame(200, settings);
  assert.equal(intro.iconOpacity, 1);
  assert.equal(intro.sceneOpacity, 0);
  const motion = animationFrame(900, settings);
  assert.equal(motion.iconOpacity, 0);
  assert.equal(motion.sceneOpacity, 1);
  const tail = animationFrame(1500, settings);
  assert.ok(tail.coverOpacity > 0 && tail.coverOpacity < 1);
  assert.ok(tail.motionProgress > motion.motionProgress && tail.motionProgress < 1);
  assert.ok(animationFrame(2000, settings).motionProgress > 1);
  const withoutIcon = animationFrame(100, { ...settings, showAppIcon: false });
  assert.equal(withoutIcon.iconOpacity, 0);
  assert.ok(withoutIcon.sceneOpacity > 0);
  assert.equal(animationDuration({ ...settings, reducedMotion: true }), 650);
});
