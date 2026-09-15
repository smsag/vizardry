import { describe, it, expect } from "vitest";
import { buildSecretPickerModel } from "./secret-picker-model";

const KEYCHAIN = ["tavily", "anthropic", "openai", "github", "upvoty"];

describe("buildSecretPickerModel", () => {
  it("lists the keychain when nothing is typed", () => {
    const m = buildSecretPickerModel(KEYCHAIN, "upvoty", "upvoty", "");
    expect(m.rows.map(r => r.name)).toEqual(KEYCHAIN);
    expect(m.rows.every(r => r.kind === "secret")).toBe(true);
    expect(m.offer).toBeNull();
    expect(m.empty).toBe(false);
  });

  it("filters case-insensitively", () => {
    const m = buildSecretPickerModel(KEYCHAIN, "upvoty", "upvoty", "OPEN");
    expect(m.rows.map(r => r.name)).toEqual(["openai"]);
  });

  describe("a link whose secret is gone", () => {
    it("shows the linked name as dangling rather than omitting it", () => {
      // The reported case: the plugin pointed at a name the keychain no longer
      // held, and the picker showed no selected row — indistinguishable from
      // never having linked anything.
      const m = buildSecretPickerModel(KEYCHAIN, "linear", "linear", "");
      expect(m.rows[0]).toEqual({ kind: "dangling", name: "linear" });
      expect(m.rows.slice(1).map(r => r.name)).toEqual(KEYCHAIN);
    });

    it("keeps the dangling row while it still matches the filter", () => {
      const m = buildSecretPickerModel(KEYCHAIN, "linear", "linear", "lin");
      expect(m.rows).toEqual([{ kind: "dangling", name: "linear" }]);
    });

    it("drops it once the filter excludes it", () => {
      const m = buildSecretPickerModel(KEYCHAIN, "linear", "linear", "git");
      expect(m.rows).toEqual([{ kind: "secret", name: "github" }]);
    });

    it("does not mark a linked name the keychain does hold", () => {
      const m = buildSecretPickerModel(KEYCHAIN, "upvoty", "upvoty", "");
      expect(m.rows.some(r => r.kind === "dangling")).toBe(false);
    });

    it("has nothing to dangle when no name is linked yet", () => {
      const m = buildSecretPickerModel(KEYCHAIN, "", "", "");
      expect(m.rows.every(r => r.kind === "secret")).toBe(true);
    });
  });

  describe("naming a secret the listing does not hold", () => {
    it("offers a valid unknown name", () => {
      // Without this the picker can only ever offer what listSecrets returned,
      // so a secret it misses cannot be linked from the plugin at all.
      const m = buildSecretPickerModel(KEYCHAIN, "upvoty", "upvoty", "linear");
      expect(m.offer).toBe("linear");
      expect(m.invalidHint).toBe(false);
    });

    it("offers a name even when the keychain is empty", () => {
      const m = buildSecretPickerModel([], "", "", "linear");
      expect(m.offer).toBe("linear");
      expect(m.empty).toBe(false);
    });

    it("explains an id Obsidian would reject instead of offering it", () => {
      const m = buildSecretPickerModel(KEYCHAIN, "upvoty", "upvoty", "Linear Key");
      expect(m.offer).toBeNull();
      expect(m.invalidHint).toBe(true);
    });

    it("does not offer a name that is already in the keychain", () => {
      const m = buildSecretPickerModel(KEYCHAIN, "upvoty", "upvoty", "github");
      expect(m.offer).toBeNull();
      expect(m.invalidHint).toBe(false);
    });

    it("does not offer the name already linked", () => {
      const m = buildSecretPickerModel(KEYCHAIN, "linear", "linear", "linear");
      expect(m.offer).toBeNull();
      expect(m.rows).toEqual([{ kind: "dangling", name: "linear" }]);
    });

    it("ignores surrounding whitespace", () => {
      expect(buildSecretPickerModel(KEYCHAIN, "", "", "  linear  ").offer).toBe("linear");
      expect(buildSecretPickerModel(KEYCHAIN, "upvoty", "upvoty", "   ").rows.map(r => r.name)).toEqual(KEYCHAIN);
    });
  });

  describe("a name picked off the offer", () => {
    it("becomes a row of its own so the choice is visible", () => {
      // Clicking "use this name" used to leave nothing marked: the offer row
      // re-rendered identically and the selection had no anchor on screen.
      const m = buildSecretPickerModel(KEYCHAIN, "upvoty", "linear", "linear");
      expect(m.rows[0]).toEqual({ kind: "pending", name: "linear" });
      expect(m.offer).toBeNull();
    });

    it("survives clearing the search box", () => {
      const m = buildSecretPickerModel(KEYCHAIN, "upvoty", "linear", "");
      expect(m.rows[0]).toEqual({ kind: "pending", name: "linear" });
      expect(m.rows.slice(1).map(r => r.name)).toEqual(KEYCHAIN);
    });

    it("survives a filter that excludes it", () => {
      const m = buildSecretPickerModel(KEYCHAIN, "upvoty", "linear", "git");
      expect(m.rows).toEqual([
        { kind: "pending", name: "linear" },
        { kind: "secret", name: "github" },
      ]);
    });

    it("is not doubled up with the dangling row when they are the same name", () => {
      const m = buildSecretPickerModel(KEYCHAIN, "linear", "linear", "");
      expect(m.rows.filter(r => r.name === "linear")).toEqual([{ kind: "dangling", name: "linear" }]);
    });

    it("is not drawn for a selection the keychain already holds", () => {
      const m = buildSecretPickerModel(KEYCHAIN, "upvoty", "github", "");
      expect(m.rows.some(r => r.kind === "pending")).toBe(false);
    });
  });

  it("reports empty only when there is nothing at all to show", () => {
    expect(buildSecretPickerModel([], "", "", "").empty).toBe(true);
    // An offer is something to show, so the "no secrets stored yet" line would
    // contradict the row sitting right above it.
    expect(buildSecretPickerModel([], "", "", "linear").empty).toBe(false);
    expect(buildSecretPickerModel([], "linear", "linear", "").empty).toBe(false);
    expect(buildSecretPickerModel(KEYCHAIN, "", "", "zzz").empty).toBe(false);
  });
});
