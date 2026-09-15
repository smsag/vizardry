// css-check.mjs — Fail CI when styles.css carries a `.vzd-*` class no source
// file references any more.
//
// styles.css is the single stylesheet for the plugin, the browser extension
// and the visual harness, and it is easy to delete a renderer and leave its
// rules behind (the SIPOC flow SVG lived on for fourteen releases after the
// renderer went). A class counts as referenced when it appears literally in
// a source file, or when a template literal in a source file builds it from
// a prefix (`vzd-mx-cell--${cell.heat}` covers `vzd-mx-cell--high`).
//
// Run: node scripts/css-check.mjs        (exit 1 on findings)
import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

const ROOT = new URL("..", import.meta.url).pathname;
const SOURCE_DIRS = ["src", "extension", "visual"];
const SOURCE_EXT = new Set([".ts", ".html"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.endsWith("-snapshots")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (SOURCE_EXT.has(extname(name)) && !name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

const sources = SOURCE_DIRS.flatMap((d) => walk(join(ROOT, d))).map((p) => readFileSync(p, "utf8"));
const corpus = sources.join("\n");

// Every `prefix${` inside a template literal: the text between the previous
// backtick, quote, whitespace or `}` and the `${`.
const dynamicPrefixes = new Set();
for (const src of sources) {
  for (const m of src.matchAll(/([A-Za-z0-9_-]+)\$\{/g)) {
    if (m[1].startsWith("vzd-") || m[1].startsWith("vizardry-")) dynamicPrefixes.add(m[1]);
  }
}

const css = readFileSync(join(ROOT, "styles.css"), "utf8");
const classes = new Set();
for (const m of css.matchAll(/\.((?:vzd|vizardry)-[A-Za-z0-9_-]+)/g)) classes.add(m[1]);

const unreferenced = [];
for (const cls of [...classes].sort()) {
  if (corpus.includes(cls)) continue;
  let dynamic = false;
  for (const p of dynamicPrefixes) {
    if (cls.startsWith(p)) { dynamic = true; break; }
  }
  if (!dynamic) unreferenced.push(cls);
}

if (unreferenced.length === 0) {
  console.log(`✅  styles.css: all ${classes.size} vzd-/vizardry- classes are referenced from source`);
  process.exit(0);
}
console.log(`❌  styles.css has ${unreferenced.length} class(es) no source file references:`);
for (const c of unreferenced) console.log(`    .${c}`);
console.log("    Delete the rules, or reference the class from the renderer that needs it.");
process.exit(1);
