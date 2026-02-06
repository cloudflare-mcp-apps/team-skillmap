/**
 * Vite Configuration for Team Skill Map Widget
 *
 * Builds Vanilla TS widget into single-file HTML for Cloudflare Assets.
 * No React plugin - this is a Vanilla TS force-graph widget.
 */

import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "path";

const INPUT = process.env.INPUT;
if (!INPUT) {
  throw new Error("INPUT environment variable is not set. Use: INPUT=widgets/widget.html npm run build");
}

const isDevelopment = process.env.NODE_ENV === "development";

export default defineConfig({
  root: "web/",
  plugins: [viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./web"),
    },
  },
  build: {
    sourcemap: isDevelopment ? "inline" : undefined,
    cssMinify: !isDevelopment,
    minify: !isDevelopment,
    reportCompressedSize: !isDevelopment,
    rollupOptions: {
      input: path.resolve(__dirname, "web", INPUT),
    },
    outDir: "dist",
    emptyOutDir: false,
  },
});
