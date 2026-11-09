import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { chromium } from "@playwright/test";
import { THEMES } from "../src/shared/types.ts";

// Developer asset task only: regular builds consume these pre-generated files.
const root = path.resolve(import.meta.dirname, "..");
const directory = path.join(root, "public/assets/themes");
const output = path.join(directory, "thumbnails");
await fs.mkdir(output, { recursive: true });
const assets = [];
const browser = await chromium.launch({ channel: process.env.PREVIEW_BROWSER_CHANNEL || "chrome", headless: true });
try {
  const page = await browser.newPage();
  for (const { id } of THEMES) {
    const original = await fs.readFile(path.join(directory, `${id}.png`));
    const base64 = await page.evaluate(async source => {
      const image = new Image(); image.src = source; await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 144;
      const scale = Math.max(256 / image.naturalWidth, 144 / image.naturalHeight);
      const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
      canvas.getContext("2d").drawImage(image, (256 - width) / 2, (144 - height) / 2, width, height);
      const result = canvas.toDataURL("image/webp", .82);
      if (!result.startsWith("data:image/webp;")) throw new Error("This browser cannot encode WebP thumbnails");
      return result.split(",")[1];
    }, "data:image/png;base64," + original.toString("base64"));
    const thumbnail = Buffer.from(base64, "base64");
    await fs.writeFile(path.join(output, `${id}.webp`), thumbnail);
    const digest = bytes => createHash("sha256").update(bytes).digest("hex");
    assets.push({ id, source: `${id}.png`, file: `${id}.webp`, width: 256, height: 144,
      sourceSha256: digest(original), sha256: digest(thumbnail), bytes: thumbnail.length });
  }
} finally { await browser.close(); }
await fs.writeFile(path.join(output, "manifest.json"), JSON.stringify({ generator: "Browser Canvas WebP thumbnails; source artwork unchanged", assets }, null, 2) + "\n");
console.log(`Generated ${assets.length} thumbnails (${assets.reduce((sum, asset) => sum + asset.bytes, 0)} bytes)`);
