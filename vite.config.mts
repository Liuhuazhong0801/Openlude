import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({
  root: "src/renderer",
  base: "./",
  publicDir: "../../public",
  build: {
    outDir: "../../dist-renderer",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve("src/renderer/index.html"),
        overlay: resolve("src/renderer/overlay.html"),
        preview: resolve("src/renderer/preview.html"),
      },
    },
  },
});
