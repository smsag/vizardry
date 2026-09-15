import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { App } from "obsidian";
import { isValidSecretId, saveSecret, loadSecret, listSecrets, secretLinkState } from "./keychain";

/**
 * A stand-in for Obsidian's SecretStorage. `throwOn` reproduces the documented
 * behaviour of setSecret — "Lowercase alphanumeric ID with optional dashes",
 * throws on anything else — and `async` reproduces mobile, where the methods
 * the typings call synchronous actually return promises.
 */
function makeApp(opts: { store?: Record<string, string>; async?: boolean; throwOnSet?: boolean } = {}) {
  const store = opts.store ?? {};
  const wrap = <T>(v: T): T => (opts.async ? (Promise.resolve(v) as unknown as T) : v);
  return {
    secretStorage: {
      setSecret: vi.fn((id: string, secret: string) => {
        if (opts.throwOnSet) throw new Error("invalid id");
        store[id] = secret;
        return wrap(undefined);
      }),
      getSecret: vi.fn((id: string) => wrap(id in store ? store[id] : null)),
      listSecrets: vi.fn(() => wrap(Object.keys(store))),
    },
  } as unknown as App;
}

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => { errorSpy = vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { errorSpy.mockRestore(); });

describe("isValidSecretId", () => {
  it("accepts the ids Obsidian documents", () => {
    for (const id of ["upvoty", "linear", "vzd-linear-key", "a1", "a-1-b"]) {
      expect(isValidSecretId(id)).toBe(true);
    }
  });

  it("rejects everything setSecret would throw on", () => {
    // Uppercase, spaces, underscores, dots and edge dashes are all outside
    // "lowercase alphanumeric with optional dashes".
    for (const id of ["Linear", "linear key", "linear_key", "linear.key", "-linear", "linear-", "a--b", "", "ümlaut"]) {
      expect(isValidSecretId(id), id).toBe(false);
    }
  });
});

describe("saveSecret", () => {
  it("stores a value under a valid name", async () => {
    const app = makeApp();
    expect(await saveSecret(app, "linear", "lin_api_1")).toEqual({ ok: true });
    expect(await loadSecret(app, "linear")).toBe("lin_api_1");
  });

  it("reports an invalid name instead of attempting the write", async () => {
    const app = makeApp();
    expect(await saveSecret(app, "Linear", "lin_api_1")).toEqual({ ok: false, reason: "invalid-name" });
    expect(app.secretStorage.setSecret).not.toHaveBeenCalled();
  });

  it("reports a throwing write rather than swallowing it", async () => {
    // The regression this guards: a rejected write used to be indistinguishable
    // from a successful one, leaving the only trace in the console.
    const app = makeApp({ throwOnSet: true });
    expect(await saveSecret(app, "linear", "x")).toEqual({ ok: false, reason: "write-failed" });
  });

  it("reports storage that isn't there at all", async () => {
    const app = {} as App;
    expect(await saveSecret(app, "linear", "x")).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("listSecrets", () => {
  it("returns the stored names", async () => {
    const app = makeApp({ store: { upvoty: "a", linear: "b" } });
    expect(await listSecrets(app)).toEqual(["upvoty", "linear"]);
  });

  it("resolves the promise mobile returns where the typings promise an array", async () => {
    // Read synchronously this came back as a Promise, and the picker rendered
    // as if the keychain were empty.
    const app = makeApp({ store: { upvoty: "a" }, async: true });
    expect(await listSecrets(app)).toEqual(["upvoty"]);
  });

  it("is empty rather than throwing when storage is missing", async () => {
    expect(await listSecrets({} as App)).toEqual([]);
  });
});

describe("secretLinkState", () => {
  it("finds a name that resolves to a value", async () => {
    const app = makeApp({ store: { upvoty: "secret" } });
    expect(await secretLinkState(app, "upvoty")).toBe("found");
  });

  it("calls a name the keychain doesn't hold missing, not unset", async () => {
    // The reported bug: an Upvoty secret still in the keychain under `upvoty`
    // while the plugin pointed at the default name, which read as "Not set"
    // and sent the user looking for a lost key instead of a broken link.
    const app = makeApp({ store: { upvoty: "secret" } });
    expect(await secretLinkState(app, "vzd-upvoty-key")).toBe("missing");
  });

  it("separates a name that exists but holds nothing", async () => {
    const app = makeApp({ store: { upvoty: "" } });
    expect(await secretLinkState(app, "upvoty")).toBe("empty");
  });

  it("flags a name Obsidian would never accept before touching storage", async () => {
    const app = makeApp();
    expect(await secretLinkState(app, "Linear")).toBe("invalid");
    expect(app.secretStorage.getSecret).not.toHaveBeenCalled();
  });

  it("reports missing secret storage", async () => {
    expect(await secretLinkState({} as App, "linear")).toBe("unavailable");
  });
});
