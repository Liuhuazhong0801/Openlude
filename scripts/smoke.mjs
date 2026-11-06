import { _electron as electron } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = path.join(root, "test-results");
const run = path.join(results, `run-${Date.now()}`);
await fs.mkdir(run, { recursive: true });
const errors = [];
let desktop;
let fixturePid;
const report = {
  platform: process.platform,
  run,
  checks: [],
  pending: [],
  errors,
};
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, detail) => {
  report.checks.push({ name, detail });
  console.log(`PASS ${name}${detail ? ": " + detail : ""}`);
};
async function until(fn, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await fn()) return;
    await delay(80);
  }
  throw new Error("Timed out waiting for test condition");
}
async function boot() {
  await fs.mkdir(path.join(run, "state"), { recursive: true });
  const application = await electron.launch({
    args: [root],
    cwd: root,
    env: { ...process.env, TIMEGATE_TEST_DATA: path.join(run, "state") },
    timeout: 30000,
    recordVideo: {
      dir: path.join(run, "video"),
      size: { width: 1320, height: 850 },
    },
  });
  desktop = application;
  application.on("window", (page) => {
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
  });
  const page = await application.firstWindow();
  try {
    await page.waitForSelector("#add-app", { timeout: 12000 });
  } catch (error) {
    await page
      .screenshot({ path: path.join(run, "boot-failure.png"), timeout: 3000 })
      .catch(() => {});
    console.log("BOOT URL", page.url());
    throw error;
  }
  await page.waitForSelector("canvas.motion-canvas", { state: "attached" });
  return { application, page };
}
async function fixture() {
  const bundle = path.join(run, "TimeGate Launch Fixture.app");
  const contents = path.join(bundle, "Contents");
  await fs.mkdir(path.join(contents, "MacOS"), { recursive: true });
  await fs.mkdir(path.join(contents, "Resources"), { recursive: true });
  // A distinct real icon makes a regression to the launcher's icon detectable.
  await fs.copyFile(
    path.join(root, "public/assets/apps/deepseek.png"),
    path.join(contents, "Resources/fixture.png"),
  );
  await fs.writeFile(
    path.join(contents, "Info.plist"),
    `<?xml version="1.0"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>studio.timegate.fixture</string><key>CFBundleExecutable</key><string>fixture</string><key>CFBundleIconFile</key><string>fixture.png</string><key>CFBundleName</key><string>TimeGate Launch Fixture</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`,
  );
  const swift = `import Cocoa
class Delegate: NSObject, NSApplicationDelegate {
 var window: NSWindow!
 let dir = URL(fileURLWithPath: CommandLine.arguments[0]).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
 func write(_ name: String, _ value: String) { try? value.write(to: dir.appendingPathComponent(name), atomically: true, encoding: .utf8) }
 func applicationDidFinishLaunching(_ notification: Notification) {
  write("fixture-started", String(ProcessInfo.processInfo.processIdentifier))
  window = NSWindow(contentRect: NSRect(x: 200, y: 200, width: 500, height: 300), styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
  window.title = "TimeGate 启动验证"
  let label = NSTextField(labelWithString: "目标应用已打开")
  label.font = NSFont.systemFont(ofSize: 26)
  label.frame = NSRect(x: 120, y: 130, width: 300, height: 50)
  window.contentView?.addSubview(label)
  window.center(); window.makeKeyAndOrderFront(nil)
 }
 func applicationDidBecomeActive(_ notification: Notification) { write("fixture-active", String(Date().timeIntervalSince1970)) }
 func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { return true }
}
if CommandLine.arguments.contains("--probe-frontmost") {
 print(NSWorkspace.shared.frontmostApplication?.processIdentifier ?? -1)
} else {
 let delegate = Delegate()
 NSApplication.shared.delegate = delegate
 NSApplication.shared.setActivationPolicy(.regular)
 NSApplication.shared.run()
}
`;
  const source = path.join(run, "fixture.swift");
  await fs.writeFile(source, swift);
  await exec(
    "xcrun",
    ["swiftc", source, "-o", path.join(contents, "MacOS/fixture")],
    { timeout: 120000 },
  );
  return bundle;
}
async function traceReveals() {
  await desktop.evaluate(({ BrowserWindow }) => {
    globalThis.revealSamples = [];
    globalThis.revealContent = {};
    globalThis.revealFrames = {};
    const setOpacity = BrowserWindow.prototype.setOpacity;
    BrowserWindow.prototype.setOpacity = function (value) {
      setOpacity.call(this, value);
      if (!this.webContents.getURL().endsWith("/overlay.html")) return;
      globalThis.revealSamples.push({
        id: this.id,
        at: Date.now(),
        opacity: this.getOpacity(),
      });
      const frames = globalThis.revealFrames[this.id] ??= {};
      const frameKey = value < 0.25 ? "late" : value < 0.7 ? "early" : null;
      if (frameKey && value > 0 && !frames[frameKey]) {
        frames[frameKey] = "pending";
        void this.webContents.capturePage().then((image) => {
          frames[frameKey] = image.resize({ width: 640 }).toPNG().toString("base64");
        }).catch(() => {});
      }
      if (value < 0.7 && value > 0.3 && !globalThis.revealContent[this.id]) {
        globalThis.revealContent[this.id] = "pending";
        void this.webContents
          .executeJavaScript(`({
          canvas: document.querySelectorAll('canvas.motion-canvas').length,
          emblem: Number(getComputedStyle(document.querySelector('.app-emblem')).opacity)
        })`)
          .then((content) => {
            globalThis.revealContent[this.id] = content;
          })
          .catch(() => {});
      }
    };
  });
}
async function revealTrace(id) {
  return desktop.evaluate(
    (_electron, windowId) => ({
      samples: globalThis.revealSamples.filter((sample) => sample.id === windowId),
      content: globalThis.revealContent[windowId],
      frames: globalThis.revealFrames[windowId],
    }),
    id,
  );
}
function assertReveal(trace, duration) {
  assert.ok(trace.samples.filter((s) => s.opacity > 0 && s.opacity < 1).length > 4);
  assert.equal(trace.samples.at(-1).opacity, 0);
  assert.ok(trace.samples.at(-1).at - trace.samples[0].at >= duration * 0.8);
  for (let i = 1; i < trace.samples.length; i++)
    assert.ok(trace.samples[i].opacity <= trace.samples[i - 1].opacity + 0.001);
  assert.equal(
    trace.content.canvas, 1, "WebGL must survive until the window is transparent",
  );
  assert.equal(trace.content.emblem, 0, "The identity intro must end before the reveal");
}
try {
  const first = await boot();
  desktop = first.application;
  await traceReveals();
  let page = first.page;
  assert.deepEqual((await page.evaluate(() => window.timegate.state())).targets, []);
  assert.equal(await page.locator(".app-card").count(), 0);
  assert.equal(await page.locator("#empty-workspace").isVisible(), true);
  for (const selector of ["#target-header", "#theme-section", "#preview-section", "#settings"])
    assert.equal(await page.locator(selector).isHidden(), true);
  await page.screenshot({ path: path.join(run, "empty-workspace.png") });
  check("Fresh installation starts empty and guides the user to add an app");
  const bundle = process.platform === "darwin" ? await fixture()
    : path.join(process.env.SystemRoot, "System32/notepad.exe");
  let otherBundle;
  if (process.platform === "darwin") {
    otherBundle = path.join(run, "Other Fixture.app");
    await fs.cp(bundle, otherBundle, { recursive: true });
    const plist = path.join(otherBundle, "Contents/Info.plist");
    await fs.writeFile(plist, (await fs.readFile(plist, "utf8")).replace("studio.timegate.fixture", "studio.timegate.other"));
    await fs.copyFile(path.join(root, "public/assets/apps/codex.png"), path.join(otherBundle, "Contents/Resources/fixture.png"));
  } else otherBundle = path.join(process.env.SystemRoot, "System32/cmd.exe");
  for (const [index, file] of [bundle, otherBundle].entries()) {
    await desktop.evaluate(({ dialog }, target) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] });
    }, file);
    await page.locator(index === 0 ? "#add-first-app" : "#add-app").click();
    await until(async () => (await page.locator(".app-card").count()) === index + 1);
  }
  const initial = await page.evaluate(() => window.timegate.state());
  const primary = initial.targets[0];
  const secondary = initial.targets[1];
  await page.locator(`[data-id="${primary.id}"] [data-action="select"]`).click();
  assert.equal(await page.locator(".theme-card").count(), 5);
  assert.equal(await page.locator(".fallback-stage").count(), 0);
  assert.equal(await page.locator("#empty-workspace").isHidden(), true);
  assert.equal(await page.locator("#locate-target, .launch-button, [data-action=launch], #launch-target svg").count(), 0);
  assert.equal(await page.locator(".app-card .app-icon").count(), 2);
  assert.ok(initial.targets.every(target => target.icon?.startsWith("data:image/")));
  await page.waitForSelector("#preview-icon:not([hidden])");
  assert.equal(await page.locator("#preview-icon").getAttribute("src"), primary.icon);
  assert.equal((await page.locator("#preview-stage").innerText()).trim(), "");
  check("Adding local apps enables the workspace, keeps app identity icons and removes location/launch arrows");
  await desktop.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1120, 760),
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  for (const selector of ["#play", "#fullscreen", "#apply", "#add-app"]) {
    const bounds = await page.locator(selector).boundingBox();
    const height = await page.evaluate(() => innerHeight);
    assert.ok(
      bounds && bounds.y + bounds.height <= height,
      `${selector} clipped at minimum window size`,
    );
  }
  await page.screenshot({ path: path.join(run, "workspace-minimum.png") });
  await desktop.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1320, 850),
  );
  await page.screenshot({ path: path.join(run, "workspace.png") });
  check("Minimum window size keeps playback and save controls visible");
  await page.locator("#duration").fill("2600");
  await page.locator("#duration").dispatchEvent("input");
  await page.locator("#duration").dispatchEvent("change");
  await page.locator("#reduced-motion").uncheck();
  await page.locator("#reduced-motion").dispatchEvent("change");
  await page.locator(`[data-id="${secondary.id}"] [data-action="select"]`).click();
  await page.waitForSelector("#preview-icon:not([hidden])");
  assert.equal(
    await page.locator("#preview-icon").getAttribute("src"),
    secondary.icon,
  );
  assert.equal(await page.locator("#preview-name").count(), 0);
  assert.equal(
    await page.locator("#duration").inputValue(),
    String(initial.preferences.duration),
  );
  await page.locator(`[data-id="${primary.id}"] [data-action="select"]`).click();
  assert.equal(await page.locator("#duration").inputValue(), "2600");
  assert.equal(
    (await page.evaluate(() => window.timegate.state())).targets[0].preferences,
    undefined,
  );
  check(
    "Switching apps updates identity and preserves unsaved drafts without persisting",
  );
  await page.locator("#show-app-icon").uncheck();
  assert.equal(await page.locator("#preview-stage .app-emblem").isHidden(), true);
  await page.locator(`[data-id="${secondary.id}"] [data-action="select"]`).click();
  assert.equal(await page.locator("#show-app-icon").isChecked(), true);
  await page.locator(`[data-id="${primary.id}"] [data-action="select"]`).click();
  assert.equal(await page.locator("#show-app-icon").isChecked(), false);
  assert.equal((await page.evaluate(() => window.timegate.state())).targets[0].preferences, undefined);
  await page.locator("#show-app-icon").check();
  check("App icon visibility is an independent per-app draft until saved");
  for (const theme of ["portal", "aurora", "paper", "pixel", "ink"]) {
    await page.locator(`.theme-card[data-theme="${theme}"]`).click();
    await page.locator("#play").click();
    await delay(900);
    const box = await page.locator("#preview-stage").boundingBox();
    const clip = {
      x: box.x + box.width * 0.2,
      y: box.y + 40,
      width: box.width * 0.15,
      height: box.height - 80,
    };
    const early = await page.screenshot({ clip });
    await delay(750);
    const late = await page.screenshot({ clip });
    assert.equal(early.equals(late), false, `${theme} geometry did not move`);
    await page
      .locator("#preview-stage")
      .screenshot({ path: path.join(run, `${theme}.png`) });
    await page.waitForFunction(() => !document.querySelector("#play").disabled);
    check(`Procedural motion changes pixels outside the logo: ${theme}`);
  }
  await page.locator('.theme-card[data-theme="portal"]').click();
  const previewWindow = desktop.waitForEvent("window");
  await page.locator("#fullscreen").click();
  const overlay = await previewWindow;
  await overlay.waitForSelector("#skip", { state: "attached" });
  await overlay.waitForSelector("#launch-icon:not([hidden])");
  assert.equal(
    await overlay.locator("#launch-icon").getAttribute("src"),
    initial.targets[0].icon,
  );
  assert.equal(
    await overlay.locator("#launch-name").count(),
    0,
  );
  assert.equal(await overlay.locator("#launch-label").count(), 0);
  const previewPayload = await overlay.evaluate(() =>
    window.timegate.overlayPayload(),
  );
  assert.equal(previewPayload.duration, 2600);
  assert.equal(previewPayload.preview, true);
  await overlay.waitForFunction(() => Number(getComputedStyle(document.querySelector(".app-emblem")).opacity) >= 0.99);
  const transparency = await desktop.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith("/overlay.html"));
    const image = await win.webContents.capturePage();
    const { width, height } = image.getSize();
    const bitmap = image.toBitmap();
    let opaquePixels = 0;
    for (let i = 3; i < bitmap.length; i += 4) if (bitmap[i] > 0) opaquePixels++;
    return {
      background: win.getBackgroundColor(), width, height, opaquePixels,
      cornerAlpha: bitmap[3], png: image.toPNG().toString("base64"),
    };
  });
  // Electron's getter returns only RGB; captured pixel alpha verifies transparency.
  assert.equal(transparency.background, "#000000");
  assert.equal(transparency.cornerAlpha, 0);
  assert.ok(transparency.opaquePixels > 100);
  assert.ok(transparency.opaquePixels / (transparency.width * transparency.height) < 0.02,
    "Only the icon should occupy the native intro; the screen must remain transparent");
  const backgrounds = await overlay.evaluate(() => [document.documentElement, document.body, document.querySelector("#overlay-stage")].map(el => getComputedStyle(el).backgroundColor));
  assert.deepEqual(backgrounds, Array(3).fill("rgba(0, 0, 0, 0)"));
  await fs.writeFile(path.join(run, "transparent-intro.png"), Buffer.from(transparency.png, "base64"));
  await fs.writeFile(path.join(run, "transparency.json"), JSON.stringify({ ...transparency, png: undefined, backgrounds }, null, 2));
  check("Native intro has a transparent window/root/stage and only target-icon pixels, with no name or backdrop");
  await overlay.waitForFunction(() => getComputedStyle(document.querySelector("canvas")).opacity === "1");
  assert.equal(await overlay.locator(".app-emblem").evaluate(el => getComputedStyle(el).opacity), "0");
  await overlay.screenshot({ path: path.join(run, "fullscreen-target.png") });
  check("The icon disappears before the full-screen scene fades in using unsaved settings");
  assert.equal(overlay.isClosed(), false);
  const closed = overlay.waitForEvent("close");
  const escapeStart = Date.now();
  // Closing on keydown may invalidate Playwright's following keyup command.
  await overlay.keyboard.press("Escape").catch((error) => {
    if (!String(error).includes("has been closed")) throw error;
  });
  await closed;
  assert.ok(
    Date.now() - escapeStart < 1000,
    "Escape must close before normal completion",
  );
  await until(async () => (await desktop.windows()).length === 1);
  check("Escape removes the full-screen overlay");
  await until(() => page.locator("#fullscreen").isEnabled());
  await page.locator("#show-app-icon").uncheck();
  const hiddenIconWindow = desktop.waitForEvent("window");
  await page.locator("#fullscreen").click();
  const hiddenIconOverlay = await hiddenIconWindow;
  await hiddenIconOverlay.waitForSelector("#skip");
  assert.equal(await hiddenIconOverlay.locator(".app-emblem").isHidden(), true);
  const hiddenIconPayload = await hiddenIconOverlay.evaluate(() => window.timegate.overlayPayload());
  assert.equal(hiddenIconPayload.showAppIcon, false);
  await hiddenIconOverlay.waitForEvent("close");
  await until(() => page.locator("#fullscreen").isEnabled());
  check("Disabling app icons skips the identity stage in the actual native overlay");
  await page.locator("#apply").click();
  await until(() => page.locator("#apply").isDisabled());

  if (process.platform === "darwin") {
    const target = primary;
    await page.locator("#show-app-icon").check();
    const expectedFixtureIcon = await desktop.evaluate(
      ({ nativeImage }, file) =>
        nativeImage
          .createFromPath(file)
          .resize({ width: 256, height: 256, quality: "best" })
          .toDataURL(),
      path.join(bundle, "Contents/Resources/fixture.png"),
    );
    assert.equal(target.icon, expectedFixtureIcon);
    assert.notEqual(target.icon, secondary.icon);
    await page.locator("#duration").fill("2600");
    await page.locator("#duration").dispatchEvent("input");
    await page.locator("#reduced-motion").uncheck();
    await page.locator('.theme-card[data-theme="portal"]').click();
    await page.locator("#apply").click();
    await until(
      async () =>
        (await page.evaluate(() => window.timegate.state())).targets.find(
          (t) => t.id === target.id,
        ).theme === "portal",
    );
    check("Native file selection and theme binding persist");
    const start = Date.now();
    const launchWindow = desktop.waitForEvent("window");
    await page.locator("#launch-target").click();
    const launchOverlay = await launchWindow;
    const launchOverlayId = await desktop.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().endsWith("/overlay.html")).id,
    );
    const endOverlay = launchOverlay.waitForEvent("close");
    await launchOverlay.waitForSelector("#launch-icon:not([hidden])");
    assert.equal(
      await launchOverlay.locator("#launch-icon").getAttribute("src"),
      expectedFixtureIcon,
    );
    assert.equal(
      await launchOverlay.locator("#launch-name").count(),
      0,
    );
    check("Actual launch uses only the custom app's bundle icon");
    await until(async () =>
      fs.access(path.join(run, "fixture-started")).then(
        () => true,
        () => false,
      ),
    );
    fixturePid = Number(
      await fs.readFile(path.join(run, "fixture-started"), "utf8"),
    );
    const duplicate = await page.evaluate(
      (id) => window.timegate.launch(id),
      target.id,
    );
    assert.equal(duplicate.ok, false);
    assert.match(duplicate.error, /进行/);
    await endOverlay;
    const launchTrace = await revealTrace(launchOverlayId);
    assertReveal(launchTrace, 650);
    assert.ok(launchTrace.frames.early && launchTrace.frames.early !== "pending");
    assert.ok(launchTrace.frames.late && launchTrace.frames.late !== "pending");
    assert.notEqual(launchTrace.frames.early, launchTrace.frames.late,
      "The portal must keep moving while the native overlay becomes transparent");
    for (const [name, png] of Object.entries(launchTrace.frames))
      await fs.writeFile(path.join(run, `reveal-${name}.png`), Buffer.from(png, "base64"));
    await fs.writeFile(
      path.join(run, "launch-reveal.json"), JSON.stringify({
        ...launchTrace, frames: undefined, motionContinuesDuringReveal: true,
      }, null, 2),
    );
    check("The portal keeps moving during the native fade, after the icon intro ends");
    await until(
      () =>
        page.locator("#launch-target").isEnabled(),
      12000,
    );
    check(
      "Real macOS app starts; duplicate launch is rejected; overlay is removed",
      `${Date.now() - start}ms`,
    );
    if (process.env.TIMEGATE_SKIP_FOCUS_ASSERT === "1") {
      report.pending.push(
        "Foreground focus was not asserted; requires an unlocked interactive desktop",
      );
      console.log("PENDING foreground focus verification");
    } else {
      await until(async () =>
        fs.access(path.join(run, "fixture-active")).then(
          () => true,
          () => false,
        ),
      );
      const activatedAt = Number(
        await fs.readFile(path.join(run, "fixture-active"), "utf8"),
      ) * 1000;
      assert.ok(
        activatedAt <= launchTrace.samples[0].at,
        "Activate the target before revealing it",
      );
      let foregroundPid;
      await until(async () => {
        const foreground = await exec(
          path.join(bundle, "Contents/MacOS/fixture"),
          ["--probe-frontmost"],
          { timeout: 2000 },
        );
        foregroundPid = Number(foreground.stdout.trim());
        return foregroundPid === fixturePid;
      });
      check(
        "Foreground focus reaches the real target application",
        `target PID ${fixturePid}; foreground PID ${foregroundPid}`,
      );
      check("The target is already active behind the overlay when the fade begins");
    }
    await fs.rename(bundle, bundle + ".moved");
    const missing = await page.evaluate(
      (id) => window.timegate.launch(id),
      target.id,
    );
    assert.equal(missing.ok, false);
    assert.match(missing.error, /失效/);
    assert.equal((await desktop.windows()).length, 1);
    check("Missing application path fails without leaving an overlay");
    await page.reload();
    await page.waitForSelector(".app-card");
    await page
      .locator(`[data-id="${target.id}"] [data-action="select"]`)
      .click();
    assert.equal(await page.locator("#preview-icon").isHidden(), true);
    assert.equal(await page.locator("#preview-icon").getAttribute("src"), null);
    assert.equal(await page.locator("#preview-name").count(), 0);
    const noIconWindow = desktop.waitForEvent("window");
    await page.locator("#fullscreen").click();
    const noIconOverlay = await noIconWindow;
    await noIconOverlay.waitForSelector("#skip");
    assert.equal(await noIconOverlay.locator("#launch-icon").isHidden(), true);
    assert.equal(
      await noIconOverlay.locator("#launch-name").count(),
      0,
    );
    assert.equal(await noIconOverlay.locator(".app-emblem").isHidden(), true);
    await noIconOverlay.waitForEvent("close");
    check("Unavailable icons skip the identity stage without adding text or a substitute logo");
    await fs.rename(bundle + ".moved", bundle);
  }

  // Reopen a legacy configuration to exercise the real migration and backup.
  await desktop.close();
  desktop = null;
  const settingsFile = path.join(run, "state/settings.json");
  const legacy = JSON.parse(await fs.readFile(settingsFile, "utf8"));
  legacy.version = 1;
  legacy.targets[0].builtin = true;
  legacy.targets.push(
    { id: "unused", name: "Unused preset", path: null, theme: "paper", builtin: true },
    { id: "unused-web", name: "Unused web preset", path: null, url: "https://example.invalid/", theme: "ink", builtin: true },
    { id: "legacy-slow", name: "Custom legacy web app", path: null, url: "https://example.invalid/", theme: "portal" },
  );
  await fs.writeFile(settingsFile, JSON.stringify(legacy));
  const migratedBoot = await boot();
  desktop = migratedBoot.application;
  page = migratedBoot.page;
  await traceReveals();
  const migrated = JSON.parse(await fs.readFile(settingsFile, "utf8"));
  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.targets.map(t => t.id), [primary.id, secondary.id, "legacy-slow"]);
  assert.equal(migrated.targets[0].builtin, undefined);
  assert.deepEqual(migrated.targets[0].preferences, legacy.targets[0].preferences);
  const backups = (await fs.readdir(path.dirname(settingsFile))).filter(f => f.startsWith("settings.json.v1-backup-"));
  assert.equal(backups.length, 1);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(path.dirname(settingsFile), backups[0]), "utf8")), legacy);
  check("Upgrade backs up v1, removes unbound presets and preserves local bindings/custom apps");
  // Stub only the OS URL opener for a preserved custom legacy target; no network opens.
  await page.evaluate(() => window.timegate.bind("legacy-slow", "portal", {
    duration: 600, reducedMotion: false, showAppIcon: false,
  }));
  await desktop.evaluate(({ shell }) => {
    globalThis.originalOpenExternal = shell.openExternal;
    shell.openExternal = () => new Promise((resolve) => {
      globalThis.completeTestLaunch = resolve;
    });
  });
  for (const skip of [true, false]) {
    const pendingWindow = desktop.waitForEvent("window");
    const pendingLaunch = page.evaluate(() => window.timegate.launch("legacy-slow"));
    const waitingOverlay = await pendingWindow;
    await waitingOverlay.waitForSelector("#skip");
    const waitingClose = waitingOverlay.waitForEvent("close");
    const waitingStart = Date.now();
    if (skip) await waitingOverlay.locator("#skip").click();
    await waitingClose;
    const elapsed = Date.now() - waitingStart;
    assert.ok(elapsed < (skip ? 1000 : 3500), `Overlay blocked for ${elapsed}ms`);
    await desktop.evaluate(() => globalThis.completeTestLaunch());
    assert.equal((await pendingLaunch).ok, true);
    check(
      skip
        ? "Skip releases the screen while the OS launch is still pending"
        : "A stalled launch cannot hold the animation overlay indefinitely",
      `${elapsed}ms`,
    );
  }
  await desktop.evaluate(({ shell }) => {
    shell.openExternal = globalThis.originalOpenExternal;
  });

  const reducedWindow = desktop.waitForEvent("window");
  const reducedRun = page.evaluate((id) =>
    window.timegate.preview("portal", id, {
      duration: 1800, reducedMotion: true, showAppIcon: true,
    }), primary.id,
  );
  const reducedOverlay = await reducedWindow;
  await reducedOverlay.waitForSelector("#skip");
  const reducedId = await desktop.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().endsWith("/overlay.html")).id,
  );
  await reducedOverlay.waitForEvent("close");
  assert.equal((await reducedRun).ok, true);
  const reducedTrace = await revealTrace(reducedId);
  assertReveal(reducedTrace, 160);
  assert.ok(reducedTrace.samples.at(-1).at - reducedTrace.samples[0].at < 400);
  check("Reduced motion uses a short reveal after the icon intro");
  await desktop.close();
  desktop = null;
  const second = await boot();
  desktop = second.application;
  const restored = await second.page.evaluate(() => window.timegate.state());
  assert.equal(
    restored.targets.find((t) => t.id === primary.id).preferences.duration,
    2600,
  );
  assert.equal(restored.preferences.duration, initial.preferences.duration);
  assert.equal(restored.targets.find((t) => t.id === primary.id).preferences.showAppIcon, process.platform === "darwin");
  if (process.platform === "darwin")
    assert.equal(
      restored.targets.find((t) => t.name === "TimeGate Launch Fixture").theme,
      "portal",
    );
  check("Preferences and theme bindings survive restart");
  while (await second.page.locator(".app-card").count()) {
    const count = await second.page.locator(".app-card").count();
    await second.page.locator("#remove-target").click();
    await until(async () => (await second.page.locator(".app-card").count()) === count - 1);
  }
  assert.equal(await second.page.locator("#empty-workspace").isVisible(), true);
  await desktop.close();
  desktop = null;
  const emptyRestart = await boot();
  desktop = emptyRestart.application;
  assert.deepEqual((await emptyRestart.page.evaluate(() => window.timegate.state())).targets, []);
  assert.equal(await emptyRestart.page.locator("#empty-workspace").isVisible(), true);
  check("Removing all apps restores the welcome screen; restart never repopulates presets");
  assert.deepEqual(errors, []);
  check("No renderer errors");
} catch (error) {
  report.failure = String(error?.stack || error);
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  if (desktop) await desktop.close().catch(() => {});
  if (fixturePid) {
    try {
      process.kill(fixturePid, "SIGTERM");
    } catch {}
  }
  await fs.writeFile(
    path.join(run, "report.json"),
    JSON.stringify(report, null, 2),
  );
  await fs.writeFile(path.join(results, "latest-run.txt"), run);
  console.log(`REPORT ${path.join(run, "report.json")}`);
}
