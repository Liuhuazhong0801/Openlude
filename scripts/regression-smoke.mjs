import { _electron as electron, chromium } from "@playwright/test";
import { build } from "vite";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import assert from "node:assert/strict";

const root = path.resolve(import.meta.dirname, ".."), out = path.join(root, "test-results", `regressions-${Date.now()}`);
await fs.mkdir(out, { recursive: true });
const report = { checks: [], errors: [], out };
const check = message => { report.checks.push(message); console.log("PASS", message); };
let application, browser, server;
try {
  const stateDirectory = path.join(out, "state"); await fs.mkdir(stateDirectory);
  application = await electron.launch({ args: [root, "--background"], cwd: root, env: { ...process.env, OPENLUDE_TEST_DATA: stateDirectory }, timeout: 30000 });
  const page = await application.firstWindow(); await page.waitForSelector("#add-first-app", { state: "attached" });
  assert.equal(await page.locator("canvas").count(), 0);
  assert.equal(await page.locator(".theme-card img[src]").count(), 0);
  check("An empty/background workbench creates no WebGL scene and requests no theme thumbnails");
  const target = process.platform === "darwin" ? "/Applications/ChatGPT.app" : path.join(process.env.SystemRoot, "System32/notepad.exe");
  await application.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, target);
  const block = () => fs.mkdir(path.join(stateDirectory, "settings.json.tmp"));
  const unblock = () => fs.rm(path.join(stateDirectory, "settings.json.tmp"), { recursive: true, force: true });
  await block();
  assert.equal(await page.evaluate(() => window.openlude.add().then(() => false, () => true)), true);
  assert.equal((await page.evaluate(() => window.openlude.state())).targets.length, 0);
  await unblock();
  const added = await page.evaluate(() => window.openlude.add()); assert.equal(added.targets.length, 1);
  const id = added.targets[0].id;
  check("A failed add leaves no phantom target and retrying the same application succeeds");
  await block();
  assert.equal(await page.evaluate(id => window.openlude.remove(id).then(() => false, () => true), id), true);
  assert.equal((await page.evaluate(() => window.openlude.state())).targets.length, 1);
  assert.equal(await page.evaluate(() => window.openlude.preferences({ duration: 2600, reducedMotion: false, showAppIcon: false }).then(() => false, () => true)), true);
  assert.equal((await page.evaluate(() => window.openlude.state())).preferences.duration, 1800);
  await unblock();
  const disk = JSON.parse(await fs.readFile(path.join(stateDirectory, "settings.json"), "utf8"));
  assert.equal(disk.targets.length, 1); assert.equal(disk.preferences.duration, 1800);
  check("Failed remove and preferences writes leave memory and disk at the last committed values");
  await application.close(); application = undefined;

  const built = path.join(out, "fixture");
  await build({ configFile: false, publicDir: false, build: { outDir: built, lib: { entry: path.join(root, "scripts/fixtures/regression-renderer.ts"), name: "RegressionFixture", formats: ["iife"], fileName: "fixture" } } });
  server = http.createServer(async (request, response) => {
    try {
      const name = new URL(request.url, "http://localhost").pathname;
      if (name === "/") { response.setHeader("Content-Type", "text/html"); response.end('<!doctype html><style>body{margin:0}#stage{width:100vw;height:100vh}canvas{display:block;width:100%;height:100%}</style><div id="stage"></div><script src="/fixture.js"></script>'); return; }
      const file = name === "/fixture.js" ? path.join(built, "fixture.iife.js") : path.resolve(root, "public", "." + name);
      if (name !== "/fixture.js" && !file.startsWith(path.join(root, "public/assets/"))) { response.writeHead(404).end(); return; }
      response.setHeader("Content-Type", name.endsWith(".js") ? "application/javascript" : name.endsWith(".mp4") ? "video/mp4" : "image/png");
      response.end(await fs.readFile(file));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch({ channel: process.env.PREVIEW_BROWSER_CHANNEL || "chrome", headless: true, args: ["--mute-audio"] });
  const context = await browser.newContext({ viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 2 });
  const view = await context.newPage(), requested = [];
  view.on("pageerror", error => report.errors.push(error.message));
  view.on("request", request => requested.push(request.url()));
  await view.goto(`http://127.0.0.1:${server.address().port}`); await view.waitForFunction(() => window.fixtureReady);
  await view.evaluate(() => window.create("ink"));
  assert.equal(requested.some(url => url.endsWith("night-train.png")), false);
  const dimensions = await view.locator("canvas").evaluate(canvas => ({ width: canvas.width, height: canvas.height }));
  assert.ok(dimensions.width * dimensions.height <= 2560 * 1440); report.buffer = dimensions;
  check("A Retina/5K viewport respects the QHD pixel budget and ink does not load the train artwork");
  await view.evaluate(() => window.select("portal")); const trainLoads = requested.filter(url => url.endsWith("night-train.png")).length;
  await view.evaluate(() => window.select("portal")); assert.equal(requested.filter(url => url.endsWith("night-train.png")).length, trainLoads);
  check("Reselecting the current theme reuses its resources");
  const trainEarly = await view.evaluate(() => window.sampleTrain(.12));
  const trainLater = await view.evaluate(() => window.sampleTrain(.92));
  assert.ok(trainEarly.every(pixel => pixel[0] + pixel[1] + pixel[2] > 15), "The full train window must draw without black/NaN regions");
  assert.deepEqual(trainEarly[0], trainLater[0], "The carriage stays still while the view moves");
  assert.notDeepEqual(trainEarly.slice(1), trainLater.slice(1), "The view through the glass must move");
  report.trainPixels = { early: trainEarly, later: trainLater };
  check("The train draws the full window; the carriage remains fixed while the skyline and water move");
  for (const theme of ["frog", "feidudu"]) {
    await view.evaluate(theme => window.select(theme), theme);
    await view.waitForTimeout(200);
    const video = await view.locator("video").evaluate(video => ({ paused: video.paused, muted: video.muted, time: video.currentTime, readyState: video.readyState }));
    assert.equal(video.paused, true); assert.equal(video.muted, true); assert.equal(video.time, 0);
    const box = await view.locator("#stage").boundingBox();
    // Capture what is displayed; rendering explicitly here would hide a missing repaint.
    const image = await view.screenshot({ scale: "css", clip: { x: box.x + box.width * .42, y: box.y + box.height * .35, width: box.width * .16, height: box.height * .3 } });
    await fs.writeFile(path.join(out, `${theme}-idle.png`), image);
    const pixels = await view.evaluate(async encoded => {
      const image = new Image(); image.src = "data:image/png;base64," + encoded; await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext("2d"); context.drawImage(image, 0, 0);
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let visible = 0, colored = 0;
      for (let index = 0; index < data.length; index += 4) {
        const [r, g, b] = data.subarray(index, index + 3);
        if (r + g + b > 45) visible++;
        if (Math.max(r, g, b) - Math.min(r, g, b) > 45) colored++;
      }
      const total = data.length / 4;
      return { visible: visible / total, colored: colored / total };
    }, image.toString("base64"));
    (report.idleVideoPreviews ??= {})[theme] = { video, pixels };
    assert.ok(pixels.visible > .5 && pixels.colored > .03, `${theme}: the paused preview must show the original character instead of a black texture`);
    check(`${theme}: first decoded frame is visible before playback, without autoplay or sound`);
  }
  await view.evaluate(() => window.select("frog")); const stopped = await view.evaluate(() => window.stopRace());
  assert.equal(stopped.paused, true); assert.equal(stopped.muted, true); assert.ok(stopped.currentTime < .1); report.stoppedVideo = stopped;
  check("Stopping a pending video play does not restart playback from an AbortError handler");
  await view.route("**/originals/frog.mp4", async route => { await new Promise(resolve => setTimeout(resolve, 700)); await route.abort().catch(() => {}); });
  const disposed = await view.evaluate(() => window.disposePending()); assert.deepEqual(disposed, { settled: true, videos: 0 });
  check("Disposing a loading video settles readiness and removes the media element");
  assert.deepEqual(report.errors, []);
} catch (error) { report.failure = String(error.stack || error); console.error(report.failure); process.exitCode = 1; }
finally {
  await application?.close().catch(() => {}); await browser?.close(); server?.close();
  await fs.writeFile(path.join(out, "report.json"), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(root, "test-results/latest-regressions.txt"), out);
}
