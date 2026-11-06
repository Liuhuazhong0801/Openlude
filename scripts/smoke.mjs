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
    await page.waitForSelector(".app-card", { timeout: 12000 });
  } catch (error) {
    await page
      .screenshot({ path: path.join(run, "boot-failure.png"), timeout: 3000 })
      .catch(() => {});
    console.log("BOOT URL", page.url());
    throw error;
  }
  await page.waitForSelector("canvas.motion-canvas");
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
try {
  const first = await boot();
  desktop = first.application;
  const page = first.page;
  assert.equal(await page.locator(".theme-card").count(), 5);
  assert.equal(await page.locator(".app-card").count(), 4);
  assert.equal(await page.locator(".fallback-stage").count(), 0);
  check("Desktop boots with five themes and four presets");
  const initial = await page.evaluate(() => window.timegate.state());
  assert.ok(
    initial.targets.every((target) => target.icon?.startsWith("data:image/")),
  );
  await page.waitForSelector("#preview-icon:not([hidden])");
  assert.equal(
    await page.locator("#preview-icon").getAttribute("src"),
    initial.targets[0].icon,
  );
  assert.equal(
    (await page.locator("#preview-stage").innerText()).trim(),
    initial.targets[0].name,
  );
  if (process.platform === "darwin" && initial.targets[0].path) {
    const source = path.join(
      initial.targets[0].path,
      "Contents/Resources/icon-codex-light.png",
    );
    if (
      await fs.access(source).then(
        () => true,
        () => false,
      )
    ) {
      const expected = await desktop.evaluate(
        ({ nativeImage }, file) =>
          nativeImage
            .createFromPath(file)
            .resize({ width: 256, height: 256, quality: "best" })
            .toDataURL(),
        source,
      );
      assert.equal(initial.targets[0].icon, expected);
    }
  }
  check(
    "All presets have app icons; default scene uses the actual target identity only",
  );
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
  await page.locator('[data-id="deepseek"] [data-action="select"]').click();
  await page.waitForSelector("#preview-icon:not([hidden])");
  assert.equal(
    await page.locator("#preview-icon").getAttribute("src"),
    initial.targets.find((target) => target.id === "deepseek").icon,
  );
  assert.equal(await page.locator("#preview-name").innerText(), "DeepSeek");
  assert.equal(
    await page.locator("#duration").inputValue(),
    String(initial.preferences.duration),
  );
  await page.locator('[data-id="codex"] [data-action="select"]').click();
  assert.equal(await page.locator("#duration").inputValue(), "2600");
  assert.equal(
    (await page.evaluate(() => window.timegate.state())).targets[0].preferences,
    undefined,
  );
  check(
    "Switching apps updates identity and preserves unsaved drafts without persisting",
  );
  for (const theme of ["portal", "aurora", "paper", "pixel", "ink"]) {
    await page.locator(`.theme-card[data-theme="${theme}"]`).click();
    await page.locator("#play").click();
    await delay(450);
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
  await overlay.waitForSelector("#skip");
  await overlay.waitForSelector("#launch-icon:not([hidden])");
  assert.equal(
    await overlay.locator("#launch-icon").getAttribute("src"),
    initial.targets[0].icon,
  );
  assert.equal(
    await overlay.locator("#launch-name").innerText(),
    initial.targets[0].name,
  );
  assert.equal(await overlay.locator("#launch-label").count(), 0);
  const previewPayload = await overlay.evaluate(() =>
    window.timegate.overlayPayload(),
  );
  assert.equal(previewPayload.duration, 2600);
  assert.equal(previewPayload.preview, true);
  await delay(450);
  await overlay.screenshot({ path: path.join(run, "fullscreen-target.png") });
  check(
    "Full-screen preview uses the target icon and unsaved duration, with no launcher tagline",
  );
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
  await page.locator("#apply").click();
  await until(() => page.locator("#apply").isDisabled());

  if (process.platform === "darwin") {
    const bundle = await fixture();
    await desktop.evaluate(({ dialog }, target) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [target],
      });
    }, bundle);
    await page.locator("#add-app").click();
    await until(async () => (await page.locator(".app-card").count()) === 5);
    const state = await page.evaluate(() => window.timegate.state());
    const target = state.targets.find((t) => t.path === bundle);
    assert.ok(target);
    await page
      .locator(`[data-id="${target.id}"] [data-action="select"]`)
      .click();
    const expectedFixtureIcon = await desktop.evaluate(
      ({ nativeImage }, file) =>
        nativeImage
          .createFromPath(file)
          .resize({ width: 256, height: 256, quality: "best" })
          .toDataURL(),
      path.join(bundle, "Contents/Resources/fixture.png"),
    );
    assert.equal(target.icon, expectedFixtureIcon);
    assert.notEqual(target.icon, initial.targets[0].icon);
    await page.locator("#duration").fill("2600");
    await page.locator("#duration").dispatchEvent("input");
    await page.locator("#reduced-motion").uncheck();
    await page.locator('.theme-card[data-theme="paper"]').click();
    await page.locator("#apply").click();
    await until(
      async () =>
        (await page.evaluate(() => window.timegate.state())).targets.find(
          (t) => t.id === target.id,
        ).theme === "paper",
    );
    check("Native file selection and theme binding persist");
    const start = Date.now();
    const launchWindow = desktop.waitForEvent("window");
    await page
      .locator(`[data-id="${target.id}"] [data-action="launch"]`)
      .click();
    const launchOverlay = await launchWindow;
    const endOverlay = launchOverlay.waitForEvent("close");
    await launchOverlay.waitForSelector("#launch-icon:not([hidden])");
    assert.equal(
      await launchOverlay.locator("#launch-icon").getAttribute("src"),
      expectedFixtureIcon,
    );
    assert.equal(
      await launchOverlay.locator("#launch-name").innerText(),
      target.name,
    );
    check("Actual launch uses the custom app's bundle icon and name");
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
    await until(
      () =>
        page
          .locator(`[data-id="${target.id}"] [data-action="launch"]`)
          .isEnabled(),
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
    assert.equal(await page.locator("#preview-name").innerText(), target.name);
    const noIconWindow = desktop.waitForEvent("window");
    await page.locator("#fullscreen").click();
    const noIconOverlay = await noIconWindow;
    await noIconOverlay.waitForSelector("#skip");
    assert.equal(await noIconOverlay.locator("#launch-icon").isHidden(), true);
    assert.equal(
      await noIconOverlay.locator("#launch-name").innerText(),
      target.name,
    );
    await noIconOverlay.waitForEvent("close");
    check(
      "Unavailable icon falls back to the target name, never the launcher logo",
    );
    await fs.rename(bundle + ".moved", bundle);
  }
  await desktop.close();
  desktop = null;
  const second = await boot();
  desktop = second.application;
  const restored = await second.page.evaluate(() => window.timegate.state());
  assert.equal(
    restored.targets.find((t) => t.id === "codex").preferences.duration,
    2600,
  );
  assert.equal(restored.preferences.duration, initial.preferences.duration);
  if (process.platform === "darwin")
    assert.equal(
      restored.targets.find((t) => t.name === "TimeGate Launch Fixture").theme,
      "paper",
    );
  check("Preferences and theme bindings survive restart");
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
