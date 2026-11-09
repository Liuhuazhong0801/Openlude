import { _electron as electron } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
const exec = promisify(execFile), root = path.resolve(import.meta.dirname, "..");
const externalTheme = process.env.OPENLUDE_EXTERNAL_THEME || "portal";
if (process.platform !== "darwin") { console.log("Native system-launch test requires macOS; Windows needs its own desktop run."); process.exit(0); }
const run = path.join(root, "test-results", `external-${Date.now()}`);
const bundle = path.join(run, "系统 启动验证.app"), contents = path.join(bundle, "Contents"), binary = path.join(contents, "MacOS/fixture");
const report = { packaged: !!process.env.OPENLUDE_PACKAGED_APP, platform: process.platform, checks: [], errors: [], run };
const check = name => { report.checks.push(name); console.log("PASS", name); };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(test, timeout = 10000) { const start = Date.now(); while (Date.now() - start < timeout) { if (await test()) return; await delay(70); } throw new Error("Condition timed out"); }
await fs.mkdir(path.join(contents, "MacOS"), { recursive: true }); await fs.mkdir(path.join(contents, "Resources"), { recursive: true });
await fs.copyFile(path.join(root, "public/assets/apps/deepseek.png"), path.join(contents, "Resources/icon.png"));
await fs.writeFile(path.join(contents, "Info.plist"), `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>studio.openlude.externalfixture</string><key>CFBundleExecutable</key><string>fixture</string><key>CFBundleIconFile</key><string>icon.png</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`);
const swift = `import Cocoa
class Delegate: NSObject, NSApplicationDelegate {
 var window: NSWindow!
 let directory = URL(fileURLWithPath: CommandLine.arguments[0]).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
 func write(_ name: String, _ value: String) { try? value.write(to: directory.appendingPathComponent(name), atomically: true, encoding: .utf8) }
 func append(_ name: String) { let url=directory.appendingPathComponent(name);let old=(try? String(contentsOf:url,encoding:.utf8)) ?? "";try? (old+"1\\n").write(to:url,atomically:true,encoding:.utf8) }
 func applicationDidFinishLaunching(_ notification: Notification) {
  append("launches");write("fixture-pid",String(ProcessInfo.processInfo.processIdentifier))
  window=NSWindow(contentRect:NSRect(x:200,y:200,width:540,height:340),styleMask:[.titled,.closable],backing:.buffered,defer:false)
  window.title="系统入口启动验证";window.center();window.makeKeyAndOrderFront(nil)
 }
 func applicationDidBecomeActive(_ notification: Notification) { write("active",String(ProcessInfo.processInfo.processIdentifier)) }
 func applicationShouldHandleReopen(_ sender: NSApplication,hasVisibleWindows:Bool)->Bool { append("reopens");return true }
}
if CommandLine.arguments.contains("--frontmost") { print(NSWorkspace.shared.frontmostApplication?.processIdentifier ?? -1) }
else { let delegate=Delegate();NSApplication.shared.delegate=delegate;NSApplication.shared.setActivationPolicy(.regular);NSApplication.shared.run() }
`;
await fs.writeFile(path.join(run, "fixture.swift"), swift);
await exec("xcrun", ["swiftc", path.join(run, "fixture.swift"), "-o", binary], { timeout: 60000 });
const stateDir = path.join(run, "state"); await fs.mkdir(stateDir);
await fs.writeFile(path.join(stateDir, "settings.json"), JSON.stringify({ version: 2,
  targets: [{ id: "external", name: "系统启动验证", path: bundle, theme: externalTheme, preferences: { duration: 1800, reducedMotion: false, showAppIcon: true } }],
  preferences: { duration: 1800, reducedMotion: false, showAppIcon: true },
  settings: { appearance: "system", autoStart: false, startInBackground: true, closeBehavior: "background", autoCheckUpdates: false, animateExternalLaunches: true } }));
let application, fixturePid, page; let overlays = 0;
async function count(name) { return (await fs.readFile(path.join(run, name), "utf8").catch(() => "")).trim().split("\n").filter(Boolean).length; }
async function stopFixture() {
  if (!fixturePid) return;
  try { process.kill(fixturePid, "SIGTERM"); } catch {}
  await until(() => { try { process.kill(fixturePid, 0); return false; } catch { return true; } });
  fixturePid = undefined; await delay(350);
}
async function systemOpen() {
  const before = await count("launches"); await exec("/usr/bin/open", [bundle]);
  await until(async () => (await count("launches")) > before); fixturePid = Number(await fs.readFile(path.join(run, "fixture-pid"), "utf8"));
}
async function settings(enabled) { return page.evaluate(async enabled => { const state = await window.openlude.state(); return window.openlude.settings({ ...state.settings, animateExternalLaunches: enabled }); }, enabled); }
async function observerReady() { await until(async () => (await page.evaluate(() => window.openlude.externalLaunchStatus())).state === "ready"); }
try {
  application = await electron.launch({ ...(process.env.OPENLUDE_PACKAGED_APP ? { executablePath: path.join(process.env.OPENLUDE_PACKAGED_APP, "Contents/MacOS/Openlude"), args: [] } : { args: [root] }), cwd: root, env: { ...process.env, OPENLUDE_TEST_DATA: stateDir }, timeout: 30000 });
  application.on("window", window => { if (window !== page) overlays++; window.on("pageerror", error => report.errors.push(error.message)); });
  page = await application.firstWindow(); await page.emulateMedia({ colorScheme: null }); await page.waitForSelector("#nav-settings"); await observerReady();
  overlays = 0;
  await page.evaluate(() => { window.testObserverStates = []; window.openlude.onExternalLaunchStatus(value => window.testObserverStates.push(value.state)); });
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false);
  const created = application.waitForEvent("window"); const startedAt = Date.now(); await systemOpen(); const overlay = await created;
  const closed = overlay.waitForEvent("close"); await overlay.waitForSelector("#skip");
  const payload = await overlay.evaluate(() => window.openlude.overlayPayload());
  assert.equal(payload.preview, false); assert.equal(payload.theme, externalTheme); assert.equal(payload.name, "系统启动验证");
  report.detectionToReadyMs = Date.now() - startedAt;
  if (externalTheme === "frog" || externalTheme === "feidudu") {
    assert.equal(payload.playThemeSound, false);
    await overlay.waitForFunction(() => {const video=document.querySelector("video");return video && !video.paused && video.currentTime>.2;});
    assert.equal(await overlay.locator("video").evaluate(video => video.muted), true);
    check("A packaged original-video theme decodes on an external launch and stays silent by default");
  }
  await overlay.screenshot({ path: path.join(run, "system-launch-overlay.png") }); await closed;
  assert.equal(await count("launches"), 1); assert.equal(overlays, 1);
  assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false);
  assert.equal(Number((await exec(binary, ["--frontmost"])).stdout.trim()), fixturePid);
  check("Opening the app through the OS while Openlude is hidden automatically plays the saved animation and returns focus");
  const beforeReopen = await count("reopens"); await exec("/usr/bin/open", [bundle]); await until(async () => (await count("reopens")) > beforeReopen); await delay(500);
  assert.equal(overlays, 1); assert.equal(await count("launches"), 1);
  check("Reopening an already running app does not replay or relaunch it");
  await settings(false); assert.equal((await page.evaluate(() => window.openlude.externalLaunchStatus())).state, "off");
  await stopFixture(); await systemOpen(); await delay(600); assert.equal(overlays, 1);
  check("Disabling external launch animations takes effect without restarting Openlude");
  await settings(true); await observerReady(); await delay(500); assert.equal(overlays, 1);
  check("Enabling detection does not animate applications that were already running");
  const processId = application.process().pid;
  const children = (await exec("/bin/ps", ["-axo", "pid=,ppid=,comm="])).stdout.split("\n");
  const helper = children.map(line => line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/)).find(item => item && Number(item[2]) === processId && item[3].includes("launch-observer-darwin"));
  assert.ok(helper); process.kill(Number(helper[1]), "SIGKILL");
  await until(async () => (await page.evaluate(() => window.testObserverStates)).includes("error")); await observerReady();
  assert.equal(overlays, 1); check("An interrupted native observer reconnects without animating the existing app");
  await stopFixture();
  const countBeforeInternal = overlays; const internalWindow = application.waitForEvent("window"); const internal = page.evaluate(() => window.openlude.launch("external"));
  const internalOverlay = await internalWindow; await internalOverlay.waitForSelector("#skip"); await internalOverlay.waitForEvent("close"); assert.equal((await internal).ok, true);
  fixturePid = Number(await fs.readFile(path.join(run, "fixture-pid"), "utf8")); await delay(600); assert.equal(overlays, countBeforeInternal + 1);
  check("An Openlude launch is suppressed by the observer and produces exactly one animation");
  await stopFixture(); const again = application.waitForEvent("window"); await systemOpen(); const againOverlay = await again; await againOverlay.waitForSelector("#skip"); await againOverlay.waitForEvent("close");
  assert.equal(overlays, countBeforeInternal + 2); check("A later cold start can play again after the app exits");
  await page.evaluate(() => window.openlude.remove("external")); await stopFixture(); const countBeforeRemoval = overlays; await systemOpen(); await delay(500); assert.equal(overlays, countBeforeRemoval);
  check("Removing the app stops observing its launches");
  assert.deepEqual(report.errors, []); check("No renderer errors during system-launch integration");
} catch (error) { report.failure = String(error.stack || error); console.error(report.failure); process.exitCode = 1; }
finally {
  await stopFixture().catch(() => {}); if (application) await application.close().catch(() => {});
  await fs.writeFile(path.join(run, "report.json"), JSON.stringify(report, null, 2)); await fs.writeFile(path.join(root, "test-results/latest-external.txt"), run);
  console.log("REPORT", path.join(run, "report.json"));
}
