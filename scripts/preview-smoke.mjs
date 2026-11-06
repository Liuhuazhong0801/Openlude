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
    pathToFileURL(path.join(root, "dist-preview", "TimeGate-preview.html"))
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
    assert.equal(await page.locator("#demo-app-name").innerText(), name);
    const source = await page.locator("#demo-app-icon").getAttribute("src");
    assert.ok(source.startsWith("data:image/"));
    sources.add(source);
  }
  assert.equal(sources.size, 4);
  assert.equal(
    (await page.locator("#demo-stage").innerText()).includes("TimeGate"),
    false,
  );
  report.checks.push(
    "Four target icons and names are embedded and switch correctly; no launcher identity in the scene",
  );
  await page.locator("#demo-app").selectOption("codex");
  const box = await page.locator("#demo-stage").boundingBox();
  const clip = {
    x: box.x + 20,
    y: box.y + 60,
    width: box.width * 0.3,
    height: box.height - 120,
  };
  for (const theme of ["portal", "aurora", "paper", "pixel", "ink"]) {
    await page.locator(`#theme-picker [data-theme="${theme}"]`).click();
    await page.waitForTimeout(550);
    const early = await page.screenshot({ clip });
    await page.waitForTimeout(650);
    const later = await page.screenshot({ clip });
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
