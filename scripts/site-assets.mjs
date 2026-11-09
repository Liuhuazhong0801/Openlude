import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { chromium } from "@playwright/test";
import { THEMES } from "../src/shared/types.ts";

// An explicit developer asset task; normal website builds use the committed outputs.
const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "site/public/assets");
const inputs = [
  ...THEMES.map(theme => ({ source: `themes/${theme.id}.png`, file: `previews/${theme.id}.webp`, width: 1280, type: "image/webp" })),
  ...["comic", "anime", "night-train", "paper-world"].map(name => ({ source: `themes/${name}.png`, file: `themes/web/${name}.webp`, width: 1920, type: "image/webp" })),
  { source: "branding/app-icon.png", file: "brand/icon.png", width: 192, type: "image/png" },
  { source: "branding/app-icon.png", file: "brand/favicon.png", width: 32, type: "image/png" },
];
const manifest = [];
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  for (const input of inputs) {
    const original = await fs.readFile(path.join(root, "public/assets", input.source));
    const result = await page.evaluate(async ({ source, width, type }) => {
      const image = new Image(); image.src = source; await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = Math.min(width, image.naturalWidth);
      canvas.height = Math.round(canvas.width * image.naturalHeight / image.naturalWidth);
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      return { data: canvas.toDataURL(type, .88).split(",")[1], width: canvas.width, height: canvas.height };
    }, { source: "data:image/png;base64," + original.toString("base64"), width: input.width, type: input.type });
    const bytes = Buffer.from(result.data, "base64");
    await fs.mkdir(path.dirname(path.join(output, input.file)), { recursive: true });
    await fs.writeFile(path.join(output, input.file), bytes);
    const digest = buffer => createHash("sha256").update(buffer).digest("hex");
    manifest.push({ ...input, width: result.width, height: result.height, bytes: bytes.length, sourceSha256: digest(original), sha256: digest(bytes) });
  }
} finally { await browser.close(); }
await fs.writeFile(path.join(output, "media-manifest.json"), JSON.stringify({ generator: "Browser Canvas website media; desktop originals unchanged", assets: manifest }, null, 2) + "\n");
console.log(`Prepared ${manifest.length} website images, ${manifest.reduce((sum, image) => sum + image.bytes, 0)} bytes.`);
