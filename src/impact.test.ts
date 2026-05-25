import { describe, it, expect } from "vitest";
import { parseImpactMap } from "./impact";

const MINIMAL = `
goal: Double revenue

actor: Sales team
  impact: Close more deals
    deliverable: CRM integration
`.trim();

describe("parseImpactMap", () => {
  it("parses a minimal valid map", () => {
    const result = parseImpactMap(MINIMAL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.goal).toBe("Double revenue");
    expect(result.data.actors).toHaveLength(1);
    expect(result.data.actors[0].name).toBe("Sales team");
    expect(result.data.actors[0].impacts[0].name).toBe("Close more deals");
    expect(result.data.actors[0].impacts[0].deliverables).toEqual(["CRM integration"]);
  });

  it("parses multiple actors, impacts, and deliverables", () => {
    const src = `
goal: Grow product

actor: Marketing
  impact: Awareness
    deliverable: Blog posts
    deliverable: Ads

actor: Engineering
  impact: Reliability
    deliverable: 99.9% uptime
`.trim();
    const result = parseImpactMap(src);
    expect(result.ok && result.data.actors).toHaveLength(2);
    expect(result.ok && result.data.actors[0].impacts[0].deliverables).toEqual(["Blog posts", "Ads"]);
  });

  it("ignores comment lines", () => {
    const src = "# preamble\ngoal: G\n# between\nactor: A\n  impact: I\n    deliverable: D";
    const result = parseImpactMap(src);
    expect(result.ok).toBe(true);
  });

  it("returns error when goal is missing", () => {
    const result = parseImpactMap("actor: A\n  impact: I\n    deliverable: D");
    expect(result).toEqual({ ok: false, error: expect.stringContaining('"goal:"') });
  });

  it("returns error when impact has no parent actor", () => {
    const result = parseImpactMap("goal: G\n  impact: I");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("no parent actor") });
  });

  it("returns error when deliverable has no parent impact", () => {
    const result = parseImpactMap("goal: G\nactor: A\n  deliverable: D");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("no parent impact") });
  });

  it("returns error for goal at non-root indent", () => {
    const result = parseImpactMap("actor: A\n  goal: G");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("root level") });
  });

  it("returns error for unexpected content", () => {
    const result = parseImpactMap("goal: G\nunknown: X");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("unexpected content") });
  });
});
