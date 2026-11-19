import { describe, it, expect, vi } from "vitest";

vi.mock("obsidian", () => ({
  MarkdownView: class MockMarkdownView {},
}));

import { rewriteScribbleBody, writeScribbleToFile } from "./scribble-edit";
import { encodeStrokeLine } from "./ink-codec";

const stroke = encodeStrokeLine({ kind: "pen", color: "ink", size: 4, points: [[0, 0, 0.5], [10, 10, 0.5]] } as any);
const update = { id: "a1b2", height: 480, background: null, strokeLines: [stroke] };

describe("scribble saves", () => {
  it("keeps stroke lines the parser skipped", () => {
    const body = ["type: scribble", "id: a1b2", "stroke: neon 4 CCC", "stroke: ink 99 CCC", "stroke: old"];
    // "stroke: old" is unreadable too; only readable strokes are replaced by the update.
    expect(rewriteScribbleBody(body, update)).toEqual([
      "type: scribble", "id: a1b2", "height: 480", "stroke: neon 4 CCC", "stroke: ink 99 CCC", "stroke: old", stroke,
    ]);
  });

  it("writes into a CRLF file, keeping its line endings", async () => {
    let content = "# Note\r\n```vizardry\r\ntype: scribble\r\nid: a1b2\r\n```\r\n";
    const app = {
      vault: {
        getFileByPath: (p: string) => (p === "n.md" ? { path: p } : null),
        process: async (_f: unknown, fn: (c: string) => string) => { content = fn(content); return content; },
      },
    } as any;
    const written = await writeScribbleToFile(app, { sourcePath: "n.md" } as any, "type: scribble\nid: a1b2", update);
    expect(written).toBe(`type: scribble\nid: a1b2\nheight: 480\n${stroke}`);
    expect(content).toBe(`# Note\r\n\`\`\`vizardry\r\ntype: scribble\r\nid: a1b2\r\nheight: 480\r\n${stroke}\r\n\`\`\`\r\n`);
  });
});
