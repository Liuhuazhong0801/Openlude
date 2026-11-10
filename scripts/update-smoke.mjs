import { _electron as electron } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const root = path.resolve(import.meta.dirname, "..");
await fs.mkdir(path.join(root, "test-results"), { recursive: true });
const out = await fs.mkdtemp(path.join(root, "test-results", "updates-"));
const report = { checks: [], errors: [] };
const check = message => { report.checks.push(message); console.log("PASS", message); };
let application;
try {
  const executablePath = process.env.OPENLUDE_TEST_APP;
  application = await electron.launch({ executablePath, args: executablePath ? ["--background"] : [root, "--background"], cwd: root, env: { ...process.env, OPENLUDE_TEST_DATA: path.join(out, "state") }, timeout: 30000 });
  const page = await application.firstWindow();
  page.on("pageerror", error => report.errors.push(error.message));
  await page.waitForSelector("#add-first-app", { state: "attached" });
  await application.evaluate(({ app, net, shell }) => {
    if (!app.isPackaged) Object.defineProperty(app, "isPackaged", { configurable: true, value: true });
    globalThis.releaseFixture = { tag_name: "v999.0.0", draft: false, prerelease: false, assets: [] };
    globalThis.openedDownloadPages = [];
    globalThis.nativeUpdates = { checks: 0, downloads: 0, installs: 0 };
    net.fetch = async () => ({ status: 200, ok: true, json: async () => globalThis.releaseFixture });
    shell.openExternal = async url => { globalThis.openedDownloadPages.push(url); };
    const require = process.getBuiltinModule("node:module").createRequire(app.getAppPath() + "/package.json");
    const updater = require("electron-updater").autoUpdater;
    updater.checkForUpdates = async () => { globalThis.nativeUpdates.checks++; updater.emit("update-available", { version: "999.0.0" }); return null; };
    updater.downloadUpdate = async () => { globalThis.nativeUpdates.downloads++; updater.emit("update-downloaded", { version: "999.0.0" }); return []; };
    updater.quitAndInstall = () => { globalThis.nativeUpdates.installs++; };
  });
  await page.evaluate(() => { document.querySelector("#nav-settings").click(); document.querySelector("#settings-tab-updates").click(); });
  const manual = await page.evaluate(() => window.openlude.checkUpdates());
  assert.equal(manual.state, "available"); assert.equal(manual.manual, true); assert.equal(manual.version, "999.0.0");
  await page.waitForFunction(() => document.querySelector("#download-update").textContent === "下载安装包" && !document.querySelector("#download-update").hidden);
  assert.equal(await page.locator("#install-update").isHidden(), true);
  await page.evaluate(() => document.querySelector("#download-update").click());
  await page.waitForFunction(async () => (await window.openlude.updateStatus()).state === "available");
  await application.evaluate(async () => { for (let i = 0; i < 100 && !globalThis.openedDownloadPages.length; i++) await new Promise(resolve => setTimeout(resolve, 10)); });
  assert.deepEqual(await application.evaluate(() => globalThis.openedDownloadPages), ["https://github.com/Liuhuazhong0801/Openlude/releases/tag/v999.0.0"]);
  assert.equal(await application.evaluate(() => globalThis.nativeUpdates.checks), 0);
  assert.equal(await page.evaluate(() => window.openlude.installUpdate().then(() => false, () => true)), true);
  check("Ordinary releases show the installer button, open the trusted release page and never invoke native installation");

  await application.evaluate(({ app }) => { globalThis.releaseFixture.tag_name = "v" + app.getVersion(); });
  assert.equal((await page.evaluate(() => window.openlude.checkUpdates())).state, "current");
  await page.waitForFunction(() => document.querySelector("#download-update").hidden);
  check("The installed version is reported as current without requesting missing update metadata");

  await application.evaluate(({ net }) => { net.fetch = async () => ({ status: 200, ok: true, json: async () => ({ tag_name: "invalid" }) }); });
  assert.equal((await page.evaluate(() => window.openlude.checkUpdates())).state, "error");
  await page.waitForFunction(() => document.querySelector("#download-update").hidden);
  check("Malformed release responses remove the previous download action");

  await application.evaluate(({ net }) => { net.fetch = async () => ({ status: 404, ok: false }); });
  assert.equal((await page.evaluate(() => window.openlude.checkUpdates())).state, "empty");
  await application.evaluate(({ net }) => { net.fetch = async () => { throw new Error("Offline fixture"); }; });
  assert.equal((await page.evaluate(() => window.openlude.checkUpdates())).state, "error");
  check("A missing stable release and offline errors retain their existing states");

  await application.evaluate(({ net }) => {
    globalThis.releaseFixture = { tag_name: "v999.0.0", draft: false, prerelease: false, assets: [{ name: process.platform === "darwin" ? "latest-mac.yml" : "latest.yml" }] };
    net.fetch = async () => ({ status: 200, ok: true, json: async () => globalThis.releaseFixture });
  });
  const native = await page.evaluate(() => window.openlude.checkUpdates());
  assert.equal(native.state, "available"); assert.equal(native.manual, undefined);
  await page.waitForFunction(() => document.querySelector("#download-update").textContent === "下载更新");
  await page.evaluate(() => window.openlude.downloadUpdate());
  await page.waitForFunction(() => !document.querySelector("#install-update").hidden);
  await page.evaluate(() => window.openlude.installUpdate());
  assert.deepEqual(await application.evaluate(() => globalThis.nativeUpdates), { checks: 1, downloads: 1, installs: 1 });
  check("Releases with native update metadata retain the existing download and restart-install path");
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.failure = String(error.stack || error); console.error(report.failure); process.exitCode = 1;
} finally {
  await application?.close().catch(() => {});
  await fs.writeFile(path.join(out, "report.json"), JSON.stringify(report, null, 2));
  console.log(`Update checks: ${out}`);
}
