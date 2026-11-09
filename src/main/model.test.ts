import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { copyLegacySettings } from "./migration";
import { allowedApplication, decodeState, initialState, generalSettings, preferences, themeId } from "./model";
import { animationDuration, animationFrame, playbackPreferences } from "../shared/transition";
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
    playThemeSound: false,
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
  assert.deepEqual(decoded.preferences, { ...state.preferences, showAppIcon: true, playThemeSound: false });
  assert.deepEqual(decoded.targets[1].preferences, {
    duration: 900,
    reducedMotion: true,
    showAppIcon: true,
    playThemeSound: false,
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
test("original theme audio defaults to silence and opt-in persists independently per app", () => {
  const defaults = { duration: 1800, reducedMotion: false, showAppIcon: false };
  assert.equal(initialState(false).preferences.playThemeSound, false);
  assert.equal(preferences(defaults).playThemeSound, false);
  for (const playThemeSound of [null, "true", 1, []])
    assert.throws(() => preferences({ ...defaults, playThemeSound }));
  const state = decodeState({ ...initialState(false), targets: [
    { id: "laugh", name: "Laugh", path: null, theme: "frog", preferences: { ...defaults, playThemeSound: true } },
    { id: "silent", name: "Silent", path: null, theme: "feidudu", preferences: defaults },
  ] });
  assert.equal(state.targets[0].preferences?.playThemeSound, true);
  assert.equal(state.targets[1].preferences?.playThemeSound, false);
  assert.equal(playbackPreferences("frog", defaults).duration, 4200);
  assert.equal(playbackPreferences("feidudu", defaults).duration, 4000);
});
test("identity precedes motion and motion continues during the reveal", () => {
  const settings = { duration: 1800, reducedMotion: false, showAppIcon: true };
  const intro = animationFrame(200, settings);
  assert.ok(intro.iconOpacity > 0 && intro.iconOpacity < 1);
  assert.ok(animationFrame(100, settings).iconOpacity < intro.iconOpacity);
  assert.equal(animationFrame(350, settings).iconOpacity, 1);
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
test("fresh installs start with no preselected applications", () => {
  const state = initialState(false);
  assert.equal(state.version, 2);
  assert.deepEqual(state.targets, []);
  assert.equal(state.preferences.showAppIcon, true);
});
test("retired themes migrate without dropping apps, paths or individual preferences", () => {
  const settings = { duration: 2700, showAppIcon: false, reducedMotion: true, playThemeSound: true };
  const targets = [
    { id: "cat", name: "My App", path: "/Applications/My App.app", theme: "maple", preferences: settings },
    { id: "ocean", name: "Other App", path: null, url: "https://example.invalid/", theme: "aurora", preferences: settings },
    { id: "paper", name: "Paper App", path: null, theme: "paper" },
  ];
  for (const version of [1, 2]) {
    const migrated = decodeState({ ...initialState(false), version, targets });
    assert.deepEqual(migrated.targets.map(target => target.theme), ["portal", "portal", "paper"]);
    assert.deepEqual(migrated.targets[0], { ...targets[0], theme: "portal" });
    assert.deepEqual(migrated.targets[1], { ...targets[1], theme: "portal" });
    assert.deepEqual(decodeState(migrated), migrated);
  }
  for (const retired of ["maple", "aurora"]) assert.throws(() => themeId(retired));
  assert.throws(() => decodeState({ ...initialState(false), targets: [{ ...targets[0], theme: "invalid" }] }));
});

test("illustrated themes preserve their sequence timing and reduced-motion preference", () => {
  const settings = { duration: 1800, showAppIcon: true, reducedMotion: false };
  assert.equal(themeId("comic"), "comic");
  assert.equal(themeId("anime"), "anime");
  assert.equal(playbackPreferences("comic", settings).duration, 4100);
  assert.equal(playbackPreferences("anime", settings).duration, 4900);
  assert.equal(playbackPreferences("comic", { ...settings, showAppIcon: false }).duration, 3200);
  for (const theme of ["comic", "anime"] as const)
    assert.equal(animationDuration(playbackPreferences(theme, { ...settings, reducedMotion: true })), 650);
  assert.equal(playbackPreferences("ink", settings).duration, 1800);
});
test("legacy starter entries are retired while local bindings and custom apps survive", () => {
  const local = { id: "codex", name: "Codex", path: "/Applications/Codex.app", theme: "portal", builtin: true,
    preferences: { duration: 3000, reducedMotion: false, showAppIcon: false } };
  const custom = { id: "custom", name: "My App", path: "/Applications/My App.app", theme: "paper" };
  const migrated = decodeState({
    version: 1,
    preferences: { duration: 1800, reducedMotion: false },
    targets: [local, custom,
      { id: "workbuddy", name: "WorkBuddy", path: null, theme: "paper", builtin: true },
      { id: "doubao", name: "豆包", path: null, url: "https://www.doubao.com/chat/", theme: "pixel", builtin: true },
    ],
  });
  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.targets.map(t => t.id), ["codex", "custom"]);
  assert.equal(migrated.targets[0].builtin, undefined);
  assert.deepEqual(migrated.targets[0].preferences, { ...local.preferences, playThemeSound: false });
  assert.deepEqual(decodeState(migrated), migrated);
  assert.throws(() => decodeState({ ...migrated, version: 3 }));
});

test("general settings default to the system theme and validate persisted changes", () => {
  assert.deepEqual(generalSettings(), { appearance: "system", autoStart: false, autoCheckUpdates: true, startInBackground: true, closeBehavior: "background", animateExternalLaunches: true });
  assert.equal(generalSettings({ appearance: "dark", autoStart: true, autoCheckUpdates: false }).appearance, "dark");
  for (const value of [null, { appearance: "auto", autoStart: false, autoCheckUpdates: true }, { appearance: "light", autoStart: "yes", autoCheckUpdates: true }])
    assert.throws(() => generalSettings(value));
  const legacy = { appearance: "light", autoStart: true, autoCheckUpdates: false };
  assert.deepEqual(generalSettings(legacy), { ...legacy, startInBackground: true, closeBehavior: "background", animateExternalLaunches: true });
  assert.equal(generalSettings({ ...legacy, closeBehavior: "quit", startInBackground: false }).closeBehavior, "quit");
  for (const startInBackground of [null, "true", 0])
    assert.throws(() => generalSettings({ ...legacy, startInBackground }));
  assert.equal(generalSettings({ ...legacy, animateExternalLaunches: false }).animateExternalLaunches, false);
  for (const animateExternalLaunches of [null, "true", 0])
    assert.throws(() => generalSettings({ ...legacy, animateExternalLaunches }));
  for (const closeBehavior of [null, true, "hide"])
    assert.throws(() => generalSettings({ ...legacy, closeBehavior }));
});

test("product rename copies valid legacy settings once without overwriting either copy", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "openlude-migration-"));
  try {
    const source = path.join(directory, "legacy.json");
    const destination = path.join(directory, "Openlude", "settings.json");
    assert.equal(await copyLegacySettings(destination, source), false);
    const original = JSON.stringify({ ...initialState(false), targets: [{
      id: "existing", name: "Existing App", path: "/Applications/Existing App.app", theme: "ink",
      preferences: { duration: 2400, reducedMotion: false, showAppIcon: false },
    }] });
    await fs.writeFile(source, original);
    assert.equal(await copyLegacySettings(destination, source), true);
    assert.equal(await fs.readFile(destination, "utf8"), original);
    assert.equal(await fs.readFile(source, "utf8"), original);
    await fs.writeFile(source, "invalid");
    assert.equal(await copyLegacySettings(destination, source), false);
    assert.equal(await fs.readFile(destination, "utf8"), original);
    await fs.rm(destination);
    await assert.rejects(copyLegacySettings(destination, source));
    await assert.rejects(fs.access(destination));
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
