import { MindMap, MindMapNode, MindMapResult } from "./types";

export function parseMindMap(source: string): MindMapResult {
  const lines = source.split("\n");

  // ── Pass 1: strip comments and blanks, record (indent, text) ──────────────
  const meaningful: Array<{ indent: number; text: string; lineNum: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    meaningful.push({ indent: raw.search(/\S/), text: trimmed, lineNum: i + 1 });
  }

  if (meaningful.length === 0) {
    return { ok: false, error: 'Missing required "root:" field' };
  }

  // ── Root must be the first non-blank line ─────────────────────────────────
  const first = meaningful[0];
  if (!first.text.startsWith("root:")) {
    return { ok: false, error: `Line ${first.lineNum}: first line must be "root: <text>"` };
  }
  if (first.indent !== 0) {
    return { ok: false, error: `Line ${first.lineNum}: "root:" must be at indent level 0` };
  }

  const rootText = first.text.slice("root:".length).trim();
  if (!rootText) {
    return { ok: false, error: `Line ${first.lineNum}: "root:" must have a non-empty label` };
  }

  // Detect a second root: declaration
  for (let i = 1; i < meaningful.length; i++) {
    if (meaningful[i].indent === 0 && meaningful[i].text.startsWith("root:")) {
      return { ok: false, error: `Line ${meaningful[i].lineNum}: duplicate "root:" — only one root is allowed` };
    }
  }

  // ── Determine indent unit from first indented line ────────────────────────
  let indentUnit = 0;
  for (let i = 1; i < meaningful.length; i++) {
    if (meaningful[i].indent > 0) {
      indentUnit = meaningful[i].indent;
      break;
    }
  }

  // ── Pass 2: build node tree ───────────────────────────────────────────────
  const root: MindMapNode = { text: rootText, children: [] };

  // Stack holds [indent, node]. We push the root at indent 0.
  const stack: Array<{ indent: number; node: MindMapNode }> = [
    { indent: 0, node: root },
  ];

  for (let i = 1; i < meaningful.length; i++) {
    const { indent, text, lineNum } = meaningful[i];

    // Validate indent is a multiple of the unit (if we have one)
    if (indentUnit > 0 && indent % indentUnit !== 0) {
      return {
        ok: false,
        error: `Line ${lineNum}: indent of ${indent} spaces is not a multiple of the base indent (${indentUnit})`,
      };
    }

    // Pop stack until the top is the direct parent (indent < current)
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];

    // Sanity: child indent must be greater than parent's
    if (indent <= parent.indent && !(parent.indent === 0 && indent === 0)) {
      return {
        ok: false,
        error: `Line ${lineNum}: unexpected indent level`,
      };
    }

    const node: MindMapNode = { text, children: [] };
    parent.node.children.push(node);
    stack.push({ indent, node });
  }

  return { ok: true, data: { root } };
}
