import esbuild from "esbuild";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(dir);
const prod = process.argv[2] === "production";

await esbuild.build({
  entryPoints: [
    path.join(dir, "viewer.ts"),
    path.join(dir, "popup.ts"),
  ],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  outdir: path.join(dir, "dist"),
  alias: { obsidian: path.join(dir, "obsidian.shim.ts") },
  minify: prod,
  sourcemap: prod ? false : "inline",
  logLevel: "info",
});

// Copy styles.css into the extension directory so the extension is self-contained.
fs.copyFileSync(path.join(root, "styles.css"), path.join(dir, "styles.css"));
