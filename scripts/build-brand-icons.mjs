// Rebuild platform icons from the user-selected PNG and the monochrome tray SVG.
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
const require = createRequire(import.meta.url);
const { runIconsTool } = require("app-builder-lib/out/toolsets/icons");
const root = path.resolve(import.meta.dirname, "..");
const assets = path.join(root, "public/assets/branding");
for (const format of ["icns", "ico"]) {
  const out = path.join(root, "work/brand-icons", format);
  await fs.mkdir(out, { recursive: true });
  await runIconsTool({ inputFile: path.join(assets, "app-icon.png"), outputFormat: format, outDir: out });
  await fs.copyFile(path.join(out, "icon." + format), path.join(assets, "app-icon." + format));
}
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  const svg = await fs.readFile(path.join(assets, "trayTemplate.svg"), "utf8");
  for (const size of [16, 32]) {
    const base64 = await page.evaluate(async ({ svg, size }) => {
      const image = new Image(); image.src = "data:image/svg+xml;base64," + btoa(svg); await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = size;
      canvas.getContext("2d").drawImage(image, 0, 0, size, size);
      return canvas.toDataURL("image/png").split(",")[1];
    }, { svg, size });
    await fs.writeFile(path.join(assets, size === 16 ? "trayTemplate.png" : "trayTemplate@2x.png"), Buffer.from(base64, "base64"));
  }
} finally { await browser.close(); }
console.log("Rebuilt macOS, Windows and tray icons from public/assets/branding");
