export interface IndentLine {
  indent: number;
  text: string;
  lineNum: number;
}

export function extractMeaningfulLines(source: string): IndentLine[] {
  const lines = source.split("\n");
  const result: IndentLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("//") || trimmed.toLowerCase().startsWith("title:")) continue;
    result.push({ indent: raw.search(/\S/), text: trimmed, lineNum: i + 1 });
  }
  return result;
}

export function detectIndentUnit(lines: IndentLine[], startFrom = 1): number {
  for (let i = startFrom; i < lines.length; i++) {
    if (lines[i].indent > 0) return lines[i].indent;
  }
  return 0;
}

export type IndentTreeResult<N> =
  | { ok: true; root: N }
  | { ok: false; error: string };

export function buildIndentTree<N extends { children: N[] }>(
  lines: IndentLine[],
  indentUnit: number,
  makeNode: (text: string, level: number) => N,
  maxDepth?: number
): IndentTreeResult<N> {
  if (lines.length === 0) return { ok: false, error: "Empty tree" };

  const root = makeNode(lines[0].text, 0);
  const stack: Array<{ indent: number; node: N }> = [{ indent: 0, node: root }];

  for (let i = 1; i < lines.length; i++) {
    const { indent, text, lineNum } = lines[i];

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

    const level = indentUnit > 0 ? indent / indentUnit : stack.length - 1;

    if (maxDepth !== undefined && level > maxDepth) {
      return {
        ok: false,
        error: `Line ${lineNum}: maximum nesting depth exceeded (limit is ${maxDepth + 1} levels)`,
      };
    }

    const node = makeNode(text, level);
    parent.node.children.push(node);
    stack.push({ indent, node });
  }

  return { ok: true, root };
}
