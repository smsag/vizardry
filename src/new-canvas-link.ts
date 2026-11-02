/**
 * "New canvas" links: `obsidian://vizardry-new?canvas=bmc` creates a fresh
 * note holding an empty canvas template and opens it.
 *
 * Meant for playbooks — a note can carry a link per step ("Fill in a Business
 * Model Canvas") and each click starts a new note instead of copying a
 * template by hand.
 *
 * Obsidian plugins cannot register a scheme of their own (`vizardry://`); the
 * `obsidian://<action>` handler is the only one the host routes to a plugin.
 *
 * Parameters (all from a link, so all untrusted):
 *   canvas  required — an insert id from the catalog (`bmc`, `pain-matrix`, …)
 *   name    optional — note name; defaults to the canvas label. Characters a
 *           file name or wikilink cannot hold are dropped, and an existing
 *           note is never overwritten (`Name 2`, `Name 3`, …).
 *   folder  optional — vault-relative folder, created when missing. `..` and
 *           hidden segments (`.obsidian`) are refused. Defaults to the user's
 *           "Default location for new notes".
 *   vault   handled by Obsidian itself before the plugin sees the link.
 */
import type { App, TFile } from "obsidian";
import type { FrameworkOption } from "./modal";
import { uniqueName } from "./shared/unique-name";

/** The `obsidian://` action this plugin registers. */
export const NEW_CANVAS_ACTION = "vizardry-new";

/** Longest note name kept from a link — well inside every OS's file-name limit. */
const MAX_NAME_LENGTH = 120;

export type NewCanvasRequest =
  | { ok: true; option: FrameworkOption; name: string; folder: string | null }
  | { ok: false; reason: "missingCanvas" }
  | { ok: false; reason: "unknownCanvas"; canvas: string }
  | { ok: false; reason: "invalidFolder"; folder: string };

/**
 * Characters Obsidian refuses in a file name (`\ / : * ? " < > |`) plus those
 * that break a wikilink to it (`# ^ [ ]`), and control characters.
 */
const UNSAFE_NAME_CHARS = /[\\/:*?"<>|#^[\]\u0000-\u001f\u007f]/g;

/**
 * A note name safe to create: unsafe characters dropped, whitespace collapsed,
 * no leading dot (that would hide the file), capped in length. Returns "" when
 * nothing usable is left, so the caller can fall back to its default.
 */
export function sanitizeNoteName(raw: string): string {
  return raw
    .replace(UNSAFE_NAME_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s]+/, "")
    .slice(0, MAX_NAME_LENGTH)
    .trim();
}

/**
 * A vault-relative folder path, or null when the path would leave the vault or
 * reach a hidden folder (`..`, `.obsidian`, `.trash`) or carries a character
 * no file name may hold. Leading/trailing/duplicate slashes and `.` segments
 * are dropped; backslashes count as separators. "" means the vault root.
 */
export function normalizeFolderPath(raw: string): string | null {
  const segments = raw.replace(/\\/g, "/").split("/").map(s => s.trim()).filter(s => s !== "" && s !== ".");
  for (const segment of segments) {
    if (segment.startsWith(".")) return null;
    if (sanitizeNoteName(segment) !== segment) return null;
  }
  return segments.join("/");
}

/** Validate the parameters of a `vizardry-new` link against the insert catalog. */
export function resolveNewCanvasRequest(
  params: Record<string, string | undefined>,
  options: readonly FrameworkOption[],
): NewCanvasRequest {
  const canvas = (params.canvas ?? "").trim().toLowerCase();
  if (!canvas) return { ok: false, reason: "missingCanvas" };
  const option = options.find(o => o.id === canvas);
  if (!option) return { ok: false, reason: "unknownCanvas", canvas };

  let folder: string | null = null;
  if (params.folder !== undefined && params.folder.trim() !== "") {
    folder = normalizeFolderPath(params.folder);
    if (folder === null) return { ok: false, reason: "invalidFolder", folder: params.folder };
  }

  const name = sanitizeNoteName(params.name ?? "") || sanitizeNoteName(option.label) || option.id;
  return { ok: true, option, name, folder };
}

/** The link that creates a new note with `canvasId`, for pasting into a playbook. */
export function buildNewCanvasLink(canvasId: string, extra: { name?: string; folder?: string } = {}): string {
  const query = new URLSearchParams({ canvas: canvasId });
  if (extra.name) query.set("name", extra.name);
  if (extra.folder) query.set("folder", extra.folder);
  // URLSearchParams writes spaces as "+", which only form decoding turns back
  // into a space; %20 decodes the same under every URI parser.
  return `obsidian://${NEW_CANVAS_ACTION}?${query.toString().replace(/\+/g, "%20")}`;
}

/** A Markdown link that reads well in a playbook: `[New Business Model Canvas](obsidian://…)`. */
export function buildNewCanvasMarkdownLink(option: Pick<FrameworkOption, "id" | "label">, text: string): string {
  // Brackets in the label would end the link text early.
  return `[${text.replace(/[[\]]/g, "")}](${buildNewCanvasLink(option.id)})`;
}

function joinPath(folder: string, file: string): string {
  return folder === "" || folder === "/" ? file : `${folder}/${file}`;
}

/** Lower-cased basenames of the Markdown notes directly inside `folderPath`. */
function takenNoteNames(app: App, folderPath: string): Set<string> {
  const folder = app.vault.getAbstractFileByPath(folderPath === "" ? "/" : folderPath);
  const children = (folder as { children?: unknown[] } | null)?.children ?? [];
  const taken = new Set<string>();
  for (const child of children) {
    const file = child as { extension?: string; basename?: string };
    if (file.extension?.toLowerCase() === "md" && file.basename) taken.add(file.basename.toLowerCase());
  }
  return taken;
}

/**
 * Create the note for a resolved request and return it. The folder is created
 * when missing. Throws when the vault refuses a write — the caller reports it.
 */
export async function createCanvasNote(
  app: App,
  request: Extract<NewCanvasRequest, { ok: true }>,
): Promise<TFile> {
  let folderPath: string;
  if (request.folder !== null) {
    folderPath = request.folder;
    if (folderPath !== "" && !app.vault.getAbstractFileByPath(folderPath)) {
      await app.vault.createFolder(folderPath);
    }
  } else {
    const activePath = app.workspace.getActiveFile()?.path ?? "";
    folderPath = app.fileManager.getNewFileParent(activePath).path;
  }
  const name = uniqueName(request.name, takenNoteNames(app, folderPath));
  return app.vault.create(joinPath(folderPath, `${name}.md`), request.option.template);
}
