import { describe, it, expect } from "vitest";
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEYS,
  normalizeSettings,
  serializeSettings,
} from "./settings-schema";

describe("normalizeSettings", () => {
  it("returns the defaults for an empty or non-object blob", () => {
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings("nonsense")).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps the cache blobs out of the settings object", () => {
    // The whole point: data.json holds linearCache/upvotyCache alongside the
    // settings, and spreading the raw blob used to pull them in — after which
    // saveSettings wrote that stale snapshot back over the live caches.
    const settings = normalizeSettings({
      sketchMode: true,
      linearCache: { "ENG-1": { summary: "x", summarizedAt: 1 } },
      upvotyCache: { "post-1": { summary: "y", summarizedAt: 2 } },
    });
    expect(settings.sketchMode).toBe(true);
    expect(Object.keys(settings)).toEqual(SETTINGS_KEYS);
    expect(serializeSettings(settings)).not.toHaveProperty("linearCache");
    expect(serializeSettings(settings)).not.toHaveProperty("upvotyCache");
  });

  it("drops settings removed in an earlier release instead of carrying them forever", () => {
    const settings = normalizeSettings({ printMarginMm: 12, legacyFlag: true });
    expect(settings).not.toHaveProperty("printMarginMm");
    expect(settings).not.toHaveProperty("legacyFlag");
  });

  it("clamps numeric values to the slider range", () => {
    expect(normalizeSettings({ summaryTtlHours: 9999 }).summaryTtlHours).toBe(168);
    expect(normalizeSettings({ summaryTtlHours: 0 }).summaryTtlHours).toBe(1);
    expect(normalizeSettings({ statusTtlMinutes: -4 }).statusTtlMinutes).toBe(1);
    expect(normalizeSettings({ upvotyStatusTtlMinutes: 120 }).upvotyStatusTtlMinutes).toBe(60);
  });

  it("falls back to the default for a non-numeric TTL", () => {
    // A NaN TTL makes every `age < ttl` comparison false, so every cache entry
    // reads as expired and every hover re-fetches — silently, forever.
    for (const bad of ["abc", NaN, Infinity, null, {}, true]) {
      expect(normalizeSettings({ summaryTtlHours: bad }).summaryTtlHours).toBe(24);
    }
  });

  it("accepts a numeric string and rounds a fractional value", () => {
    expect(normalizeSettings({ summaryTtlHours: "48" }).summaryTtlHours).toBe(48);
    expect(normalizeSettings({ statusTtlMinutes: 7.6 }).statusTtlMinutes).toBe(8);
  });

  it("rejects an llmProvider outside the union", () => {
    // Reaching callLlm with this would index ADAPTERS to undefined.
    expect(normalizeSettings({ llmProvider: "gemini" }).llmProvider).toBe("anthropic");
    expect(normalizeSettings({ llmProvider: "openai" }).llmProvider).toBe("openai");
  });

  it("coerces non-boolean toggles", () => {
    expect(normalizeSettings({ linearEnabled: "true" }).linearEnabled).toBe(false);
    expect(normalizeSettings({ linearEnabled: 1 }).linearEnabled).toBe(false);
    expect(normalizeSettings({ linearEnabled: true }).linearEnabled).toBe(true);
  });

  it("trims strings and restores the default for a blank required one", () => {
    expect(normalizeSettings({ upvotyKeyPrefix: "  FEAT " }).upvotyKeyPrefix).toBe("FEAT");
    expect(normalizeSettings({ upvotyKeyPrefix: "   " }).upvotyKeyPrefix).toBe("UPV");
    expect(normalizeSettings({ linearBaseUrl: "" }).linearBaseUrl).toBe(DEFAULT_SETTINGS.linearBaseUrl);
  });

  it("keeps a blank sketchFont, which means 'use the bundled font'", () => {
    expect(normalizeSettings({ sketchFont: "" }).sketchFont).toBe("");
    expect(normalizeSettings({ sketchFont: "  Caveat " }).sketchFont).toBe("Caveat");
  });
});

describe("DEFAULT_SETTINGS", () => {
  it("is frozen, so a plugin instance can never mutate the shared defaults", () => {
    expect(Object.isFrozen(DEFAULT_SETTINGS)).toBe(true);
  });

  it("round-trips through normalize unchanged", () => {
    expect(normalizeSettings(serializeSettings(DEFAULT_SETTINGS))).toEqual(DEFAULT_SETTINGS);
  });
});

describe("serializeSettings", () => {
  it("emits exactly the schema keys", () => {
    const withExtra = { ...DEFAULT_SETTINGS, linearCache: {} } as never;
    expect(Object.keys(serializeSettings(withExtra))).toEqual(SETTINGS_KEYS);
  });
});
