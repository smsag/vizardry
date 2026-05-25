import { describe, it, expect } from "vitest";
import { parseStoryMap } from "./story";

const MINIMAL = `
activity: Define
  step: Backlog
    task: Create ticket
`.trim();

describe("parseStoryMap", () => {
  it("parses a minimal valid map", () => {
    const result = parseStoryMap(MINIMAL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.activities[0].name).toBe("Define");
    expect(result.data.activities[0].steps[0].name).toBe("Backlog");
    expect(result.data.activities[0].steps[0].tasks[0].name).toBe("Create ticket");
  });

  it("parses user and goal metadata", () => {
    const src = `user: Alice\ngoal: Ship faster\n${MINIMAL}`;
    const result = parseStoryMap(src);
    expect(result.ok && result.data.user).toBe("Alice");
    expect(result.ok && result.data.goal).toBe("Ship faster");
  });

  it("parses task subtitle separated by |", () => {
    const src = "activity: A\n  step: S\n    task: My task | A subtitle";
    const result = parseStoryMap(src);
    expect(result.ok && result.data.activities[0].steps[0].tasks[0]).toEqual({
      name: "My task",
      subtitle: "A subtitle",
    });
  });

  it("parses slice assignments", () => {
    const src = `
activity: A
  step: Discovery
    task: Research

slice: MVP
  step: Discovery | Research
`.trim();
    const result = parseStoryMap(src);
    expect(result.ok && result.data.slices[0].name).toBe("MVP");
    expect(result.ok && result.data.slices[0].cells["discovery"]).toEqual(["research"]);
  });

  it("silently drops slice references to non-existent steps", () => {
    const src = `
activity: A
  step: Real step
    task: Task

slice: S1
  step: Missing step | Task
`.trim();
    const result = parseStoryMap(src);
    expect(result.ok && Object.keys(result.data.slices[0].cells)).toHaveLength(0);
  });

  it("silently drops slice references to non-existent tasks", () => {
    const src = `
activity: A
  step: S
    task: Real task

slice: S1
  step: S | Phantom task
`.trim();
    const result = parseStoryMap(src);
    expect(result.ok && result.data.slices[0].cells["s"]).toEqual([]);
  });

  it("ignores blank lines and comments", () => {
    const src = "# top\nactivity: A\n  # mid\n  step: S\n    # inner\n    task: T";
    const result = parseStoryMap(src);
    expect(result.ok).toBe(true);
  });

  it("returns error for activity with no name", () => {
    const result = parseStoryMap("activity:\n  step: S\n    task: T");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("name") });
  });

  it("returns error for duplicate step names", () => {
    const src = "activity: A\n  step: Dup\n    task: T\n  step: Dup\n    task: T2";
    const result = parseStoryMap(src);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("more than once") });
  });

  it("returns error for activity with no steps", () => {
    const result = parseStoryMap("activity: Empty");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("no steps") });
  });

  it("returns error when no activities are defined", () => {
    const result = parseStoryMap("user: Alice");
    expect(result).toEqual({ ok: false, error: expect.stringContaining('"activity:"') });
  });

  it("returns error for unexpected syntax at root level", () => {
    const result = parseStoryMap("activity: A\n  step: S\n    task: T\nbadkey: X");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("unexpected syntax") });
  });
});
