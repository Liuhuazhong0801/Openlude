import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "test-results", "preview");
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.PREVIEW_BROWSER_CHANNEL || "chrome",
  headless: true,
  args: ["--mute-audio"],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 1020 },
  recordVideo: {
    dir: path.join(out, "video"),
    size: { width: 1280, height: 1020 },
  },
});
const page = await context.newPage();
const errors = [];
const report = {
  scope: "Browser renderer only; no native launch assertions",
  checks: [],
  errors,
};
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
try {
  await page.goto(
    pathToFileURL(path.join(root, "dist-preview", "Openlude-preview.html"))
      .href,
  );
  await page.waitForSelector("canvas.motion-canvas", { timeout: 10000 });
  await page.locator("#demo-loop").uncheck();
  const sources = new Set();
  for (const [id, name] of [
    ["codex", "Codex"],
    ["workbuddy", "WorkBuddy"],
    ["deepseek", "DeepSeek"],
    ["doubao", "豆包"],
  ]) {
    await page.locator("#demo-app").selectOption(id);
    await page.waitForSelector("#demo-app-icon:not([hidden])");
    assert.equal(await page.locator("#demo-app-icon").getAttribute("alt"), `${name} 图标`);
    assert.equal(await page.locator("#demo-app-name").count(), 0);
    const source = await page.locator("#demo-app-icon").getAttribute("src");
    assert.ok(source.startsWith("data:image/"));
    sources.add(source);
  }
  assert.equal(sources.size, 4);
  assert.equal(
    (await page.locator("#demo-stage").innerText()).includes("Openlude"),
    false,
  );
  report.checks.push(
    "Four demo icons switch correctly; no app name or launcher identity in the scene",
  );
  await page.locator("#demo-app").selectOption("codex");
  const box = await page.locator("#demo-stage").boundingBox();
  const clip = {
    x: box.x + 20,
    y: box.y + 60,
    width: box.width * 0.3,
    height: box.height - 120,
  };
  for (const theme of ["comic", "anime", "portal", "paper", "pixel", "ink", "frog", "feidudu"]) {
    await page.locator(`#theme-picker [data-theme="${theme}"]`).click();
    await page.waitForTimeout(1150);
    const sceneClip = ["frog", "feidudu"].includes(theme) ? {x:box.x+box.width*.4,y:box.y+60,width:box.width*.2,height:box.height-120} : clip;
    const early = await page.screenshot({ clip:sceneClip });
    await page.waitForTimeout(650);
    const later = await page.screenshot({ clip:sceneClip });
    assert.equal(
      early.equals(later),
      false,
      `${theme} is static outside the target icon`,
    );
    await page
      .locator("#demo-stage")
      .screenshot({ path: path.join(out, `${theme}.png`) });
    report.checks.push(`${theme}: scene pixels change outside the target icon`);
    console.log("PASS", theme);
    await page.waitForTimeout(1500);
  }
  await page.locator('#theme-picker [data-theme="frog"]').click();
  assert.equal(await page.locator("#demo-sound").isChecked(), false);
  await page.waitForFunction(() => {const v=document.querySelector("video");return v && v.currentTime>.2&&!v.paused;});
  assert.equal(await page.locator("video").evaluate(v => v.muted),true);
  await page.locator("#demo-sound").check();
  await page.waitForFunction(() => {const v=document.querySelector("video");return v && v.currentTime>.2&&!v.paused&&!v.muted;});
  await page.locator('#theme-picker [data-theme="feidudu"]').click();
  assert.equal(await page.locator("#demo-sound").isVisible(),true);
  assert.equal(await page.locator("video").count(),1);
  report.checks.push("Original footage decodes offline; original audio defaults off and enables explicitly; changing theme removes old media");
  await page.locator('#theme-picker [data-theme="portal"]').click();
  await page.locator("#demo-icon").uncheck();
  assert.equal(await page.locator(".app-emblem").isHidden(), true);
  await page.waitForTimeout(250);
  assert.equal(await page.locator("canvas").evaluate((el) => getComputedStyle(el).opacity), "1");
  report.checks.push("Icon disabled: motion starts directly without an identity stage");
  await page.locator("#demo-icon").check();
  const fadeIn = await page.evaluate(async () => {
    const icon = document.querySelector(".app-emblem");
    const start = performance.now(); const samples = [];
    while (performance.now() - start < 450) {
      samples.push(Number(getComputedStyle(icon).opacity));
      await new Promise(requestAnimationFrame);
    }
    return samples;
  });
  assert.ok(fadeIn.some(value => value > 0.02 && value < 0.95));
  assert.ok(fadeIn.some((value, i) => i && value > fadeIn[i - 1]));
  assert.equal(Math.max(...fadeIn), 1);
  assert.equal(await page.locator("canvas").evaluate((el) => getComputedStyle(el).opacity), "0");
  assert.equal(await page.locator("#demo-stage").evaluate((el) => getComputedStyle(el).backgroundColor), "rgba(0, 0, 0, 0)");
  assert.equal((await page.locator(".app-emblem").textContent()).trim(), "");
  await page.waitForTimeout(700);
  assert.equal(await page.locator(".app-emblem").evaluate((el) => getComputedStyle(el).opacity), "0");
  assert.equal(await page.locator("canvas").evaluate((el) => getComputedStyle(el).opacity), "1");
  report.checks.push("Icon enabled: measurable fade-in, icon alone on transparency, fade-out, then scene appears");
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(out, "preview-workspace.png") });
  await context.close();
  report.video = await page.video().path();
} catch (error) {
  report.failure = String(error.stack || error);
  process.exitCode = 1;
  console.error(report.failure);
} finally {
  await browser.close();
  await fs.writeFile(
    path.join(out, "report.json"),
    JSON.stringify(report, null, 2),
  );
}
