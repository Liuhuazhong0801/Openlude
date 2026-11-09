import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import path from "node:path";

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "..");
const metadata = JSON.parse(readFileSync(path.join(directory, "metadata.json"), "utf8"));
const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");

export default defineConfig({
  root: directory,
  base: "./",
  publicDir: path.join(directory, "public"),
  plugins: [{ name: "openlude-site-metadata", transformIndexHtml: html => html
    .replaceAll("__SITE_DESCRIPTION__", escape(metadata.description))
    .replaceAll("__SITE_URL__", escape(metadata.homepage)) }],
  server: { fs: { allow: [root] } },
  build: { outDir: path.join(root, "dist-site"), emptyOutDir: true },
});
