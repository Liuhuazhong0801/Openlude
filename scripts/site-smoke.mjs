import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { preview } from "vite";
import { THEMES } from "../src/shared/types.ts";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "test-results/site");
await fs.mkdir(output, { recursive: true });
const url = process.env.SITE_PREVIEW_URL || "http://127.0.0.1:4174/";
let ownedServer;
try {
  const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
  assert(response.ok && (await response.text()).includes("Openlude —"), "An unrelated server occupies the preview URL");
} catch (error) {
  if (error instanceof assert.AssertionError) throw error;
  if (process.env.SITE_PREVIEW_URL) throw error;
  ownedServer = await preview({ configFile: path.join(root, "site/vite.config.mts"), preview: { host: "127.0.0.1", port: 4174, strictPort: true } });
}
let browser;
const errors = [], checks = [];
const report = { scope: "Public website only; no installed-app launch assertions", checks, errors };
const inspect = page => {
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
};
const check = name => { checks.push(name); console.log("PASS", name); };
try {
  browser = await chromium.launch({
    channel: process.env.PREVIEW_BROWSER_CHANNEL || (process.env.CI ? undefined : "chrome"),
    headless: true, args: ["--mute-audio", "--enable-unsafe-swiftshader", ...(process.env.SITE_SOFTWARE_GL === "1" ? ["--use-angle=swiftshader"] : [])],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  inspect(page);
  await page.clock.install({ time: new Date("2026-11-09T00:00:00Z") });
  await page.goto(url);
  await page.waitForSelector(".canvas-host.ready", { timeout: 20000 });
  // Freeze at explicit animation phases so slow software-GPU screenshots cannot
  // accidentally sample the same completed frame twice.
  await page.clock.pauseAt(new Date("2026-11-09T01:00:00Z"));
  assert.equal(await page.locator(".theme-option").count(), 8);
  assert.equal(await page.locator('canvas.motion-canvas').count(), 1);
  const panelWidth = (await page.locator(".preview-shell").boundingBox()).width;
  const sceneWidth = (await page.locator("#demo-stage").boundingBox()).width;
  assert(Math.abs(panelWidth - sceneWidth) < 1, "Preview must fill its panel without a blank column");
  await page.screenshot({ path: path.join(output, "desktop.png"), fullPage: true });
  await page.screenshot({ path: path.join(output, "desktop-first-screen.png") });
  check("Desktop page renders all eight themes with one shared canvas");
  for (const { id } of THEMES) {
    await page.locator(`.theme-option[data-theme="${id}"]`).click();
    await page.waitForSelector(`.demo-stage[data-theme="${id}"] .canvas-host.ready`);
    assert.equal(await page.locator(`.theme-option[data-theme="${id}"]`).getAttribute("aria-pressed"), "true");
    await page.clock.runFor(500);
    assert(Number(await page.locator("#demo-progress").getAttribute("aria-valuenow")) < 100);
    const early = await page.locator("canvas.motion-canvas").screenshot();
    await page.clock.runFor(900);
    assert(Number(await page.locator("#demo-progress").getAttribute("aria-valuenow")) < 100);
    const later = await page.locator("canvas.motion-canvas").screenshot();
    assert(!early.equals(later), `${id} canvas must contain changing scene pixels`);
    if (id === "frog" || id === "feidudu") {
      assert.equal(await page.locator("video").evaluate(video => video.muted), true);
    }
    await page.locator("#demo-stage").screenshot({ path: path.join(output, `theme-${id}.png`) });
    check(`${id}: actual animation changes and selection stays synchronized`);
  }
  await page.clock.resume();
  await page.locator('.theme-option[data-theme="frog"]').click();
  await page.waitForSelector(".canvas-host.ready");
  await page.locator("#sound-control").click();
  assert.equal(await page.locator("video").evaluate(video => video.muted), false);
  await page.locator("#sound-control").click();
  assert.equal(await page.locator("video").evaluate(video => video.muted), true);
  await page.locator("#play-control").click();
  assert.equal(await page.locator("video").evaluate(video => video.paused), true);
  check("Original footage starts muted; sound and stop controls work");
  for (const id of ["comic", "feidudu", "paper", "frog", "portal"]) await page.locator(`.theme-option[data-theme="${id}"]`).click();
  await page.waitForSelector('.demo-stage[data-theme="portal"] .canvas-host.ready');
  assert.equal(await page.locator("canvas").count(), 1);
  assert.equal(await page.locator("video").count(), 0);
  await page.locator('.theme-option[data-theme="portal"]').focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.locator('.theme-option[data-theme="paper"]').getAttribute("aria-pressed"), "true");
  await page.keyboard.press("ArrowDown");
  assert.equal(await page.locator('.theme-option[data-theme="pixel"]').getAttribute("aria-pressed"), "true");
  await page.keyboard.press("Home");
  assert.equal(await page.locator('.theme-option[data-theme="comic"]').getAttribute("aria-pressed"), "true");
  check("Rapid switching releases old videos; keyboard selection works");
  await page.locator('.theme-option[data-theme="frog"]').click();
  await page.waitForSelector(".canvas-host.ready");
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.locator(".site-footer").scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  assert.equal(await page.locator("video").evaluate(video => video.paused), true);
  check("Off-screen previews stop playback");
  const metadata = JSON.parse(await fs.readFile(path.join(root, "site/metadata.json"), "utf8"));
  const downloadLinks = await page.locator("[data-download]").evaluateAll(links => links.map(link => link.href));
  assert.equal(downloadLinks.length, 3);
  assert(downloadLinks.every(link => link.startsWith(`${metadata.repository}/releases/download/${metadata.releaseTag}/`)));
  await page.locator("summary").first().click();
  assert.equal(await page.locator("details").first().getAttribute("open"), "");
  check("Downloads target the published release and FAQ expands");
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  inspect(mobile);
  await mobile.goto(url);
  await mobile.locator("#themes").scrollIntoViewIfNeeded();
  await mobile.waitForSelector(".canvas-host.ready");
  await mobile.screenshot({ path: path.join(output, "mobile.png"), fullPage: true });
  for (const width of [320, 390, 768]) {
    await mobile.setViewportSize({ width, height: 844 });
    assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Horizontal overflow at ${width}px`);
  }
  await mobile.locator('.theme-option[data-theme="anime"]').click();
  await mobile.waitForSelector('.demo-stage[data-theme="anime"] .canvas-host.ready');
  check("320px, 390px and tablet layouts fit; mobile theme controls work");
  const reduced = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  inspect(reduced);
  await reduced.goto(url);
  await reduced.waitForSelector(".canvas-host.ready");
  await reduced.waitForTimeout(300);
  assert.equal(await reduced.locator("#demo-progress").getAttribute("aria-valuenow"), "0");
  await reduced.locator("#play-control").click();
  await reduced.waitForFunction(() => Number(document.querySelector("#demo-progress").getAttribute("aria-valuenow")) > 0);
  check("Reduced-motion preference prevents autoplay and permits explicit playback");
  assert.deepEqual(errors, []);
  check("No browser errors or missing HTTP assets");
} finally {
  await browser?.close();
  if (ownedServer) await new Promise((resolve, reject) => ownedServer.httpServer.close(error => error ? reject(error) : resolve()));
  await fs.writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
}
