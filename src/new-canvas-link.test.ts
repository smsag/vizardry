import { describe, it, expect, vi } from "vitest";
import type { App } from "obsidian";
import {
  NEW_CANVAS_ACTION,
  buildNewCanvasLink,
  buildNewCanvasMarkdownLink,
  createCanvasNote,
  normalizeFolderPath,
  resolveNewCanvasRequest,
  sanitizeNoteName,
} from "./new-canvas-link";
import { getInsertOptions } from "./catalog";
import type { FrameworkOption } from "./modal";

const options = getInsertOptions();
const bmc = options.find(o => o.id === "bmc") as FrameworkOption;

describe("sanitizeNoteName", () => {
  it("drops characters a file name or wikilink cannot hold", () => {
    expect(sanitizeNoteName('Acme: BMC / v2 #draft [x] ^a | "q" <> * ?')).toBe("Acme BMC v2 draft x a q");
  });
  it("cannot hide the file or climb out of the folder", () => {
    expect(sanitizeNoteName("../../.obsidian/plugins")).toBe("obsidian plugins");
    expect(sanitizeNoteName(".hidden")).toBe("hidden");
  });
  it("drops control characters and caps the length", () => {
    expect(sanitizeNoteName("a\u0000b\nc")).toBe("a b c");
    expect(sanitizeNoteName("x".repeat(500))).toHaveLength(120);
  });
  it("returns empty when nothing usable is left", () => {
    expect(sanitizeNoteName(" /:?* ")).toBe("");
  });
});

describe("normalizeFolderPath", () => {
  it("normalises separators and redundant segments", () => {
    expect(normalizeFolderPath("/Playbooks//Discovery/./")).toBe("Playbooks/Discovery");
    expect(normalizeFolderPath("Playbooks\\Discovery")).toBe("Playbooks/Discovery");
    expect(normalizeFolderPath("/")).toBe("");
  });
  it("refuses paths that leave the vault or reach hidden folders", () => {
    expect(normalizeFolderPath("../outside")).toBeNull();
    expect(normalizeFolderPath("a/../../b")).toBeNull();
    expect(normalizeFolderPath(".obsidian/plugins")).toBeNull();
    expect(normalizeFolderPath("notes/.trash")).toBeNull();
  });
  it("refuses characters no file name may hold", () => {
    expect(normalizeFolderPath("a:b")).toBeNull();
    expect(normalizeFolderPath("a*")).toBeNull();
  });
});

describe("resolveNewCanvasRequest", () => {
  it("resolves a catalog id, defaulting the name to the canvas label", () => {
    const r = resolveNewCanvasRequest({ action: NEW_CANVAS_ACTION, canvas: "bmc" }, options);
    expect(r).toEqual({ ok: true, option: bmc, name: "Business Model Canvas", folder: null });
  });
  it("accepts preset insert aliases and ignores case and whitespace", () => {
    const r = resolveNewCanvasRequest({ canvas: " Pain-Matrix " }, options);
    expect(r.ok && r.option.id).toBe("pain-matrix");
  });
  it("uses a sanitised name and normalised folder when given", () => {
    const r = resolveNewCanvasRequest({ canvas: "bmc", name: "Acme / Q3", folder: "/Playbooks/Acme/" }, options);
    expect(r).toMatchObject({ ok: true, name: "Acme Q3", folder: "Playbooks/Acme" });
  });
  it("falls back to the label when the given name sanitises to nothing", () => {
    const r = resolveNewCanvasRequest({ canvas: "bmc", name: "///" }, options);
    expect(r).toMatchObject({ ok: true, name: "Business Model Canvas" });
  });
  it("reports a missing, unknown or unsafe parameter", () => {
    expect(resolveNewCanvasRequest({}, options)).toEqual({ ok: false, reason: "missingCanvas" });
    expect(resolveNewCanvasRequest({ canvas: "  " }, options)).toEqual({ ok: false, reason: "missingCanvas" });
    expect(resolveNewCanvasRequest({ canvas: "nope" }, options)).toEqual({ ok: false, reason: "unknownCanvas", canvas: "nope" });
    expect(resolveNewCanvasRequest({ canvas: "bmc", folder: "../x" }, options))
      .toEqual({ ok: false, reason: "invalidFolder", folder: "../x" });
  });
  it("resolves every catalog entry", () => {
    for (const option of options) {
      const r = resolveNewCanvasRequest({ canvas: option.id }, options);
      expect(r.ok && r.option.id, option.id).toBe(option.id);
    }
  });
});

describe("buildNewCanvasLink", () => {
  it("builds a link that resolves back to the same request", () => {
    const link = buildNewCanvasLink("bmc", { name: "Acme Q3", folder: "Playbooks/Acme" });
    expect(link).toBe("obsidian://vizardry-new?canvas=bmc&name=Acme%20Q3&folder=Playbooks%2FAcme");
    const url = new URL(link);
    const params = Object.fromEntries(url.searchParams.entries());
    expect(resolveNewCanvasRequest(params, options)).toMatchObject({ ok: true, name: "Acme Q3", folder: "Playbooks/Acme" });
  });
  it("wraps the link in Markdown without brackets breaking the link text", () => {
    expect(buildNewCanvasMarkdownLink({ id: "bmc", label: "x" }, "New [BMC]"))
      .toBe("[New BMC](obsidian://vizardry-new?canvas=bmc)");
  });
});

// ── createCanvasNote against a minimal in-memory vault ────────────────────

function fakeApp(existing: string[], defaultFolder = "Inbox") {
  const files = new Map<string, { path: string; basename: string; extension: string }>();
  const folders = new Set<string>(["/", defaultFolder]);
  const addFile = (path: string) => {
    const name = path.split("/").pop() as string;
    const dot = name.lastIndexOf(".");
    const file = { path, basename: name.slice(0, dot), extension: name.slice(dot + 1) };
    files.set(path, file);
    return file;
  };
  existing.forEach(addFile);
  const childrenOf = (folder: string) =>
    [...files.values()].filter(f => (f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "/") === folder);
  const create = vi.fn(async (path: string, _data: string) => {
    if (files.has(path)) throw new Error("File already exists.");
    return addFile(path);
  });
  const createFolder = vi.fn(async (path: string) => { folders.add(path); });
  const app = {
    vault: {
      getAbstractFileByPath: (path: string) =>
        files.get(path) ?? (folders.has(path) ? { path, children: childrenOf(path) } : null),
      create,
      createFolder,
    },
    workspace: { getActiveFile: () => null },
    fileManager: { getNewFileParent: () => ({ path: defaultFolder }) },
  } as unknown as App;
  return { app, create, createFolder };
}

describe("createCanvasNote", () => {
  it("creates the template in the default new-note folder", async () => {
    const { app, create } = fakeApp([]);
    const file = await createCanvasNote(app, { ok: true, option: bmc, name: "Business Model Canvas", folder: null });
    expect(file.path).toBe("Inbox/Business Model Canvas.md");
    expect(create).toHaveBeenCalledWith("Inbox/Business Model Canvas.md", bmc.template);
  });
  it("never overwrites an existing note", async () => {
    const { app } = fakeApp(["Inbox/Business Model Canvas.md", "Inbox/business model canvas 2.md"]);
    const file = await createCanvasNote(app, { ok: true, option: bmc, name: "Business Model Canvas", folder: null });
    expect(file.path).toBe("Inbox/Business Model Canvas 3.md");
  });
  it("creates a missing folder from the link", async () => {
    const { app, createFolder } = fakeApp([]);
    const file = await createCanvasNote(app, { ok: true, option: bmc, name: "Acme", folder: "Playbooks/Acme" });
    expect(createFolder).toHaveBeenCalledWith("Playbooks/Acme");
    expect(file.path).toBe("Playbooks/Acme/Acme.md");
  });
  it("writes to the vault root for an empty folder", async () => {
    const { app, createFolder } = fakeApp(["Acme.md"]);
    const file = await createCanvasNote(app, { ok: true, option: bmc, name: "Acme", folder: "" });
    expect(createFolder).not.toHaveBeenCalled();
    expect(file.path).toBe("Acme 2.md");
  });
});
