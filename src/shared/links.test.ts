import { describe, it, expect, vi } from "vitest";

const { mockGetUpvotyService } = vi.hoisted(() => ({ mockGetUpvotyService: vi.fn(() => null as { getKeyPrefix(): string } | null) }));
vi.mock("../upvoty", () => ({ getUpvotyService: mockGetUpvotyService }));

import { extractInlineLinks, createLinkResolver } from "./links";

describe("extractInlineLinks", () => {
  it("strips [[#Heading]] wiki-link annotations and records the mapping", () => {
    const source = "block: Value Propositions [[#VP Research]]";
    const { strippedSource, inlineLinks } = extractInlineLinks(source);
    expect(strippedSource).toBe("block: Value Propositions");
    expect(inlineLinks).toEqual({ "value propositions": "VP Research" });
  });

  it("strips [text](#Anchor) markdown link annotations and URL-decodes the heading", () => {
    const source = "block: Next Experiment [Next Experiment](#Next%20Experiment)";
    const { strippedSource, inlineLinks } = extractInlineLinks(source);
    expect(strippedSource).toBe("block: Next Experiment");
    expect(inlineLinks).toEqual({ "next experiment": "Next Experiment" });
  });

  it("handles markdown links with multi-word URL-encoded anchors", () => {
    const source = "block: Current Condition [link](#Current%20Condition)";
    const { strippedSource, inlineLinks } = extractInlineLinks(source);
    expect(strippedSource).toBe("block: Current Condition");
    expect(inlineLinks).toEqual({ "current condition": "Current Condition" });
  });

  it("leaves source unchanged when no annotation is present", () => {
    const source = "block: Next Experiment\n  Some content";
    const { strippedSource, inlineLinks } = extractInlineLinks(source);
    expect(strippedSource).toBe(source);
    expect(inlineLinks).toEqual({});
  });

  it("does not corrupt a line that is purely a markdown link (no label text before it)", () => {
    const source = "block: Next Experiment\n  [a link](#somewhere)";
    const { strippedSource, inlineLinks } = extractInlineLinks(source);
    // The indented line has no label text before the link annotation, so it is left untouched.
    expect(strippedSource).toBe(source);
    expect(inlineLinks).toEqual({});
  });

  it("strips [text](#Anchor) from a non-keyword line that has label text before it (e.g. OST child node)", () => {
    const source = "outcome: Goal\n  Agents as partners [Agents as partners](#Agents%20as%20partners)";
    const { strippedSource, inlineLinks } = extractInlineLinks(source);
    expect(strippedSource).toBe("outcome: Goal\n  Agents as partners");
    expect(inlineLinks).toEqual({ "agents as partners": "Agents as partners" });
  });

  it("strips [[#Heading]] from a non-keyword line that has label text before it", () => {
    const source = "outcome: Goal\n  Some Node [[#Target Heading]]";
    const { strippedSource, inlineLinks } = extractInlineLinks(source);
    expect(strippedSource).toBe("outcome: Goal\n  Some Node");
    expect(inlineLinks).toEqual({ "some node": "Target Heading" });
  });

  it("strips [[#Heading]] from indented keyword lines (e.g. roadmap items)", () => {
    const source = "now:\n  item: Feature A [[#Feature A Section]]\n  item: Feature B";
    const { strippedSource, inlineLinks } = extractInlineLinks(source);
    expect(strippedSource).toBe("now:\n  item: Feature A\n  item: Feature B");
    expect(inlineLinks).toEqual({ "feature a": "Feature A Section" });
  });

  it("strips [text](#Anchor) from indented keyword lines", () => {
    const source = "next:\n  item: Redesign [Redesign](#Redesign%20Spec)";
    const { strippedSource, inlineLinks } = extractInlineLinks(source);
    expect(strippedSource).toBe("next:\n  item: Redesign");
    expect(inlineLinks).toEqual({ redesign: "Redesign Spec" });
  });

  it("handles multiple annotated blocks in one source", () => {
    const source = [
      "block: Strengths [[#SWOT Strengths]]",
      "  content",
      "block: Weaknesses [Weaknesses](#Weaknesses)",
    ].join("\n");
    const { strippedSource, inlineLinks } = extractInlineLinks(source);
    expect(strippedSource).toBe("block: Strengths\n  content\nblock: Weaknesses");
    expect(inlineLinks).toEqual({
      strengths: "SWOT Strengths",
      weaknesses: "Weaknesses",
    });
  });

  it("strips a Linear-shaped markdown-link target and captures it as a ticket annotation", () => {
    const source = "block: Fix login bug [Fix login bug](CORE-1234)";
    const { strippedSource, inlineLinks, inlineTicketLinks } = extractInlineLinks(source);
    expect(strippedSource).toBe("block: Fix login bug");
    expect(inlineLinks).toEqual({});
    expect(inlineTicketLinks).toEqual({
      "fix login bug": { service: "linear", key: "CORE-1234" },
    });
  });

  it("strips an Upvoty-shaped markdown-link target and captures it as a ticket annotation when a service is configured", () => {
    mockGetUpvotyService.mockReturnValue({ getKeyPrefix: () => "UPV" });
    const source = "block: Add dark mode [Add dark mode](UPV-abcdefghij1234567890)";
    const { strippedSource, inlineLinks, inlineTicketLinks } = extractInlineLinks(source);
    expect(strippedSource).toBe("block: Add dark mode");
    expect(inlineLinks).toEqual({});
    expect(inlineTicketLinks).toEqual({
      "add dark mode": { service: "upvoty", key: "UPV-abcdefghij1234567890" },
    });
  });

  it("leaves an ordinary external link completely untouched (critical regression guard)", () => {
    const source = "block: Docs [Docs](https://example.com)";
    const { strippedSource, inlineLinks, inlineTicketLinks } = extractInlineLinks(source);
    expect(strippedSource).toBe(source);
    expect(inlineLinks).toEqual({});
    expect(inlineTicketLinks).toEqual({});
  });

  it("leaves an Upvoty-shaped-looking target untouched when no Upvoty service is configured", () => {
    mockGetUpvotyService.mockReturnValue(null);
    const source = "block: Add dark mode [Add dark mode](UPV-abcdefghij1234567890)";
    const { strippedSource, inlineLinks, inlineTicketLinks } = extractInlineLinks(source);
    expect(strippedSource).toBe(source);
    expect(inlineLinks).toEqual({});
    expect(inlineTicketLinks).toEqual({});
  });

  it("strips a Linear-shaped target from a non-keyword line (e.g. OST child node)", () => {
    const source = "outcome: Goal\n  Fix login bug [Fix login bug](CORE-1234)";
    const { strippedSource, inlineTicketLinks } = extractInlineLinks(source);
    expect(strippedSource).toBe("outcome: Goal\n  Fix login bug");
    expect(inlineTicketLinks).toEqual({
      "fix login bug": { service: "linear", key: "CORE-1234" },
    });
  });
});

describe("createLinkResolver — resolveTicket", () => {
  it("resolves a ticket annotation case-insensitively", () => {
    const resolver = createLinkResolver({}, [], {
      "fix login bug": { service: "linear", key: "CORE-1234" },
    });
    expect(resolver.resolveTicket?.("Fix Login Bug")).toEqual({ service: "linear", key: "CORE-1234" });
  });

  it("returns undefined when no ticket annotation matches", () => {
    const resolver = createLinkResolver({}, []);
    expect(resolver.resolveTicket?.("Untracked item")).toBeUndefined();
  });
});
