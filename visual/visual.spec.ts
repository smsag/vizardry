import { test, expect } from "@playwright/test";
import { pathToFileURL } from "url";
import path from "path";

// Must match the fixture names in harness.ts.
const ALL = [
  "bmc", "swot", "fishbone", "impact", "story", "mindmap", "ost", "venn",
  "sipoc", "wardley", "raci", "roadmap", "pacelayers", "conceptmap", "nodemap",
  "matrix", "scqa", "journey",
];

// On mobile we only snapshot the canvases whose layout is width-sensitive
// (horizontal scrollers / carousels) — where mobile regressions actually bite.
const MOBILE = ["wardley", "matrix", "sipoc", "journey", "roadmap", "bmc"];

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
