import fs from "node:fs/promises";
import path from "node:path";
import { build } from "vite";
import { THEMES } from "../src/shared/types.ts";

const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "dist-site");
const metadata = JSON.parse(await fs.readFile(path.join(root, "site/metadata.json"), "utf8"));
await build({ configFile: path.join(root, "site/vite.config.mts") });
const copies = [
  ...THEMES.map(theme => `assets/themes/thumbnails/${theme.id}.webp`),
  "assets/themes/originals/frog.mp4", "assets/themes/originals/feidudu.mp4",
];
for (const file of copies) {
  await fs.mkdir(path.dirname(path.join(output, file)), { recursive: true });
  await fs.copyFile(path.join(root, "public", file), path.join(output, file));
}
await fs.writeFile(path.join(output, ".nojekyll"), "");
await fs.writeFile(path.join(output, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${metadata.homepage}sitemap.xml\n`);
await fs.writeFile(path.join(output, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${metadata.homepage}</loc></url></urlset>\n`);
console.log(`GitHub Pages website: ${output}`);
