import { test, expect } from "@playwright/test";
import { pathToFileURL } from "url";
import path from "path";

// Must match the fixture names in harness.ts.
const ALL = [
  "bmc", "swot", "impact", "story", "mindmap", "ost", "venn",
  "sipoc", "sipocflow", "wardley", "raci", "roadmap", "pacelayers", "conceptmap", "nodemap",
  "matrix", "scqa", "journey", "wheeloflife", "odyssey",
  "circleofinfluence", "wholeperson", "futureself", "radar", "problem",
  "multicanvas", "testcard", "canvaslink",
  // NOTE: `fishbone` is intentionally not snapshotted — the herringbone renderer
  // lays out native-SVG text whose metrics differ enough between this repo's
  // Playwright container and other environments to trip a hard dimension
  // mismatch. Its structure is covered by src/renderer/fishbone.render.test.ts
  // and its geometry by src/renderer/fishbone-geometry.test.ts; the harness
  // fixture is kept (and still guarded by the page-error check) for manual viewing.
  // NOTE: `compass` is intentionally not snapshotted — its text-heavy brief sits
  // on a line-wrap boundary that renders 10px taller under CI's Playwright
  // chromium than the local browser (a hard dimension mismatch Playwright can't
  // tolerate). The render is covered by src/renderer/compass.render.test.ts; the
  // harness fixture is kept for manual viewing.
];

// On mobile we only snapshot the canvases whose layout is width-sensitive
// (horizontal scrollers / carousels) — where mobile regressions actually bite.
const MOBILE = ["wardley", "matrix", "sipoc", "journey", "roadmap", "bmc", "odyssey", "wholeperson"];

test("canvases render as expected", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === "mobile";
  const url = pathToFileURL(path.resolve(__dirname, "index.html")).href + (mobile ? "?mobile" : "");

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(url);
  await page.waitForSelector("body[data-ready]");
  expect(errors, `page errors:\n${errors.join("\n")}`).toEqual([]);

  for (const name of mobile ? MOBILE : ALL) {
    const el = page.locator(`[data-fixture="${name}"]`);
    await expect(el).toHaveScreenshot(`${name}.png`);
  }
});

// Representative canvases in sketch (hand-drawn) mode: handwriting font,
// monochrome ink, and the SVG line wobble. Desktop only.
const SKETCH = ["matrix", "radar", "wheeloflife", "circleofinfluence"];

test("canvases render in sketch mode", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "sketch snapshots are desktop-only");
  const url = pathToFileURL(path.resolve(__dirname, "index.html")).href + "?sketch";

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(url);
  await page.waitForSelector("body[data-ready]");
  expect(errors, `page errors:\n${errors.join("\n")}`).toEqual([]);

  for (const name of SKETCH) {
    const el = page.locator(`[data-fixture="${name}"]`);
    await expect(el).toHaveScreenshot(`${name}-sketch.png`);
  }
});
