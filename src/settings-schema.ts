/**
 * The persisted-settings schema — the single source of truth for what lives
 * in data.json under a settings key, what type it has, and what range it may
 * take.
 *
 * Why a schema rather than a plain interface + object spread:
 *
 *   1. **data.json holds more than settings.** The Linear and Upvoty summary
 *      caches are persisted alongside the settings under their own top-level
 *      keys. `{ ...DEFAULT_SETTINGS, ...rawData }` pulls those cache blobs
 *      into the live settings object, and the next `saveSettings()` writes
 *      that stale snapshot straight back over whatever the caches have
 *      persisted since — silently discarding every summary written in the
 *      meantime. Reading through `normalizeSettings` and writing through
 *      `serializeSettings` keeps settings and caches in disjoint key sets, so
 *      neither can clobber the other.
 *
 *   2. **data.json is user-editable and survives downgrades.** A hand-edited
 *      or older file can carry a string where a number belongs, a TTL of 0 or
 *      1e9, or an `llmProvider` outside the union. Untyped, those flow
 *      straight into arithmetic (`(now - t) / 60_000 < ttl` with `ttl` NaN is
 *      always false — every cache entry reads as expired, so every hover
 *      re-fetches) and into `ADAPTERS[provider]` (undefined → TypeError).
 *      Coercing and clamping at the boundary means the rest of the plugin can
 *      treat `PluginSettings` as genuinely well-typed.
 *
 * Numeric bounds mirror the slider limits in the settings tab, so a value
 * typed into data.json by hand behaves exactly like one dragged in the UI.
 */

export interface PluginSettings {
  // Appearance
  /** Render canvases with a handwriting font + monochrome ink (whiteboard look). */
  sketchMode: boolean;
  /** Optional font-family override for sketch mode; blank = the bundled font. */
  sketchFont: string;

  // Linear
  linearEnabled: boolean;
  linearBaseUrl: string;
  /** Logical name under which the Linear API key is stored in app.secretStorage. */
  linearSecretName: string;

  // LLM
  llmProvider: "anthropic" | "openai";
  llmModel: string;
  /** Logical name under which the LLM API key is stored in app.secretStorage. */
  llmSecretName: string;

  // Cache TTLs
  summaryTtlHours: number;
  statusTtlMinutes: number;

  // Upvoty
  upvotyEnabled: boolean;
  upvotyBaseUrl: string;
  /** Public dashboard URL used to build "Open in Upvoty" links — distinct from
   *  upvotyBaseUrl (the REST API endpoint), since self-hosted/white-labelled
   *  instances can have the two on entirely different domains. */
  upvotyAppUrl: string;
  upvotyKeyPrefix: string;
  /** Logical name under which the Upvoty API key is stored in app.secretStorage. */
  upvotySecretName: string;
  upvotyStatusTtlMinutes: number;
}

type FieldSpec =
  | { kind: "boolean"; default: boolean }
  /** `blankOk: true` keeps an empty string (a meaningful "unset"); otherwise
   *  a blank value falls back to the default. Always trimmed. */
  | { kind: "string"; default: string; blankOk?: boolean }
  /** An absolute https URL; anything else falls back to the default. A base
   *  URL carries the API key in a header, so http:// would send it in clear
   *  and a synced data.json could point it anywhere. */
  | { kind: "url"; default: string }
  /** Coerced to a finite integer and clamped to [min, max] — the slider range. */
  | { kind: "number"; default: number; min: number; max: number }
  | { kind: "enum"; default: string; values: readonly string[] };

type Schema = { [K in keyof PluginSettings]: FieldSpec };

export const SETTINGS_SCHEMA: Schema = {
  sketchMode:             { kind: "boolean", default: false },
  sketchFont:             { kind: "string",  default: "", blankOk: true },

  linearEnabled:          { kind: "boolean", default: false },
  linearBaseUrl:          { kind: "url",     default: "https://api.linear.app/graphql" },
  linearSecretName:       { kind: "string",  default: "vzd-linear-key" },

  llmProvider:            { kind: "enum",    default: "anthropic", values: ["anthropic", "openai"] },
  llmModel:               { kind: "string",  default: "claude-haiku-4-5" },
  llmSecretName:          { kind: "string",  default: "vzd-llm-key" },

  summaryTtlHours:        { kind: "number",  default: 24, min: 1, max: 168 },
  statusTtlMinutes:       { kind: "number",  default: 5,  min: 1, max: 60 },

  upvotyEnabled:          { kind: "boolean", default: false },
  upvotyBaseUrl:          { kind: "url",     default: "https://api.upvotyfeedback.com/v1" },
  upvotyAppUrl:           { kind: "url",     default: "https://app.upvoty.com/feedback" },
  upvotyKeyPrefix:        { kind: "string",  default: "UPV" },
  upvotySecretName:       { kind: "string",  default: "vzd-upvoty-key" },
  upvotyStatusTtlMinutes: { kind: "number",  default: 5,  min: 1, max: 60 },
};

/** Every key the plugin owns inside data.json's settings namespace. */
export const SETTINGS_KEYS = Object.keys(SETTINGS_SCHEMA) as (keyof PluginSettings)[];

function coerce(spec: FieldSpec, value: unknown): unknown {
  switch (spec.kind) {
    case "boolean":
      return typeof value === "boolean" ? value : spec.default;
    case "string": {
      if (typeof value !== "string") return spec.default;
      const trimmed = value.trim();
      if (trimmed === "") return spec.blankOk ? "" : spec.default;
      return trimmed;
    }
    case "url": {
      if (typeof value !== "string") return spec.default;
      const trimmed = value.trim();
      return isHttpsUrl(trimmed) ? trimmed : spec.default;
    }
    case "number": {
      // Accept a numeric string too: data.json edited by hand (or written by
      // an older build) can carry "24" where 24 is meant.
      const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
      if (!Number.isFinite(n)) return spec.default;
      return Math.min(spec.max, Math.max(spec.min, Math.round(n)));
    }
    case "enum":
      return typeof value === "string" && spec.values.includes(value) ? value : spec.default;
  }
}

/** True for an absolute URL with the https scheme and a host. */
export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.host !== "";
  } catch {
    return false;
  }
}

export const DEFAULT_SETTINGS: PluginSettings = Object.freeze(
  Object.fromEntries(SETTINGS_KEYS.map(k => [k, SETTINGS_SCHEMA[k].default])),
) as unknown as PluginSettings;

/**
 * Builds a fully-typed settings object from whatever data.json held: unknown
 * keys (including the cache blobs and settings removed in an earlier release)
 * are dropped, missing keys take their default, and present keys are coerced
 * and clamped to the schema.
 */
export function normalizeSettings(raw: unknown): PluginSettings {
  const source = (raw !== null && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = {} as Record<string, unknown>;
  for (const key of SETTINGS_KEYS) out[key] = coerce(SETTINGS_SCHEMA[key], source[key]);
  out.llmModel = healModelId(out.llmModel as string);
  return out as unknown as PluginSettings;
}

/**
 * Model ids persisted by earlier releases that the API no longer accepts.
 * `claude-*-latest` was never a valid alias for the 4.x models; every request
 * with one 404'd. Healed on load so an existing data.json starts working
 * without the user having to know why summaries stopped.
 */
const RENAMED_MODELS: Record<string, string> = {
  "claude-haiku-4-5-latest": "claude-haiku-4-5",
  "claude-sonnet-4-5-latest": "claude-sonnet-4-5",
};

function healModelId(model: string): string {
  return RENAMED_MODELS[model] ?? model;
}

/**
 * The inverse: the exact key set to merge into data.json on save. Anything
 * that isn't a schema key — notably `linearCache` / `upvotyCache` — is left
 * untouched for its own owner to write.
 */
export function serializeSettings(settings: PluginSettings): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of SETTINGS_KEYS) out[key] = settings[key];
  return out;
}
