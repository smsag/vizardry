import { OSTNode, OSTResult, OSTTree } from "../types";

export function parseOST(source: string): OSTResult {
  const lines = source.split("\n");

  const meaningful: Array<{ indent: number; text: string; lineNum: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    meaningful.push({ indent: raw.search(/\S/), text: trimmed, lineNum: i + 1 });
  }

  if (meaningful.length === 0) {
    return { ok: false, error: 'Missing required "outcome:" field' };
  }

  const first = meaningful[0];
  if (!first.text.startsWith("outcome:")) {
    return { ok: false, error: `Line ${first.lineNum}: first line must be "outcome: <text>"` };
  }
  if (first.indent !== 0) {
    return { ok: false, error: `Line ${first.lineNum}: "outcome:" must be at indent level 0` };
  }

  const rootText = first.text.slice("outcome:".length).trim();
  if (!rootText) {
    return { ok: false, error: `Line ${first.lineNum}: "outcome:" must have a non-empty label` };
  }

  for (let i = 1; i < meaningful.length; i++) {
    if (meaningful[i].indent === 0 && meaningful[i].text.startsWith("outcome:")) {
      return { ok: false, error: `Line ${meaningful[i].lineNum}: duplicate "outcome:" — only one outcome is allowed` };
    }
  }

  let indentUnit = 0;
  for (let i = 1; i < meaningful.length; i++) {
    if (meaningful[i].indent > 0) {
      indentUnit = meaningful[i].indent;
      break;
    }
  }

  const makeNode = (text: string, level: number): OSTNode => ({
    text,
    level,
    children: [],
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });

  const root = makeNode(rootText, 0);
  const stack: Array<{ indent: number; node: OSTNode }> = [{ indent: 0, node: root }];

  for (let i = 1; i < meaningful.length; i++) {
    const { indent, text, lineNum } = meaningful[i];

    if (indentUnit > 0 && indent % indentUnit !== 0) {
      return {
        ok: false,
        error: `Line ${lineNum}: indent of ${indent} spaces is not a multiple of the base indent (${indentUnit})`,
      };
    }

    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    if (indent <= parent.indent && !(parent.indent === 0 && indent === 0)) {
      return { ok: false, error: `Line ${lineNum}: unexpected indent level` };
    }

    const level = indentUnit > 0 ? indent / indentUnit : 1;
    if (level > 4) {
      return { ok: false, error: `Line ${lineNum}: OST depth cannot exceed 5 levels (0-4)` };
    }

    const node = makeNode(text, level);
    parent.node.children.push(node);
    stack.push({ indent, node });
  }

  const tree: OSTTree = { root };
  return { ok: true, data: tree };
}
