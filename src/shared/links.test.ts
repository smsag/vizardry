import { describe, it, expect } from "vitest";
import { extractInlineLinks } from "./links";

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

  it("does not corrupt block content that contains markdown links without a keyword prefix", () => {
    const source = "block: Next Experiment\n  [a link](#somewhere)";
    const { strippedSource, inlineLinks } = extractInlineLinks(source);
    // The indented line has no keyword: prefix, so it is left untouched.
    expect(strippedSource).toBe(source);
    expect(inlineLinks).toEqual({});
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
});
