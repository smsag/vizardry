import { test, expect } from "@playwright/test";
import { pathToFileURL } from "url";
import path from "path";

// Must match the fixture names in harness.ts.
const ALL = [
  "bmc", "swot", "fishbone", "impact", "story", "mindmap", "ost", "venn",
  "sipoc", "sipocflow", "wardley", "raci", "roadmap", "pacelayers", "conceptmap", "nodemap",
  "matrix", "scqa", "journey", "wheeloflife", "odyssey",
  "circleofinfluence", "wholeperson", "futureself", "radar", "problem",
  "multicanvas",
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
