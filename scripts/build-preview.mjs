import { build } from "vite";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const out = path.join(root, "dist-preview");
await build({
  configFile: false,
  publicDir: false,
  build: {
    lib: {
      entry: "src/renderer/preview.ts",
      name: "TimeGatePreview",
      formats: ["iife"],
      fileName: "preview",
    },
    outDir: out,
    cssCodeSplit: false,
    emptyOutDir: true,
  },
});
const [template, css, js, icon] = await Promise.all([
  fs.readFile("src/renderer/preview.html", "utf8"),
  fs.readFile(path.join(out, "preview.css"), "utf8"),
  fs.readFile(path.join(out, "preview.iife.js"), "utf8"),
  fs.readFile("public/assets/branding/app-icon.png"),
]);
const html = template
  .replace(
    '<script type="module" src="./preview.ts"></script>',
    `<style>${css}</style>`,
  )
  .replace(
    "./assets/branding/app-icon.png",
    `data:image/png;base64,${icon.toString("base64")}`,
  )
  .replace(
    "</body>",
    () => `<script>${js.replace(/<\/script/gi, "<\\/script")}</script></body>`,
  );
await fs.writeFile(path.join(out, "TimeGate-preview.html"), html);
console.log("Standalone preview: " + path.join(out, "TimeGate-preview.html"));
