import type { FlowData, FlowEdge, FlowNode, FlowResult } from "./types/problem";
import { resolveProblemSubtype, problemSubtypeList } from "./shared/flow-subtypes";
import { isSkippableLine } from "./shared/indent-tree";

const MAX_NODES = 40;

/**
 * Parses the Problem-statement syntax:
 *
 *   type: problem, engineering
 *   title: ...
 *
 *   ideal_1: Fully automated line | Product X assembles as efficiently as possible.
 *   reality_1: Manual transport | Parts are carried between lines by hand.
 *   reality_2: Rework loop | Mis-installed parts are pulled and redone.
 *   consequences_1: Missed goals | Company Y is behind target this year.
 *   proposal_1: Conveyors + arms | Install belts and robot arms between lines.
 *
 *   link: ideal_1 -> reality_1 & reality_2
 *   link: reality_1 & reality_2 -> consequences_1
 *   link: consequences_1 -> proposal_1
 *
 * A line `<key>: heading | body` adds a card. The **stage** is the key's prefix
 * (fixed by the subtype — see flow-subtypes.ts — and supplies the eyebrow); an
 * optional `_suffix` makes the card's **stable id** (`reality_1`). A bare key
 * (`reality:`) auto-assigns `reality_N` in source order. The `| body` sentence
 * is optional (a bare `reality: heading` renders a heading-only card).
 *
 * `link:` lines draw directed edges, referencing a card by its **id** (or, as a
 * fallback, its heading text). They support Mermaid-style chains (`A -> B -> C`)
 * and `&` groups for fan-out / merge (`A -> B & C`, `B & C -> D`), each expanded
 * to individual edges.
 *
 * Parsing is graceful: an unknown keyword, an empty card, a duplicate id, or a
 * malformed / dangling link degrade to a warning and skip that line. It is only
 * fatal when the subtype is unknown or no cards are defined.
 */
export function parseProblem(source: string, variant?: string): FlowResult {
  const resolved = resolveProblemSubtype(variant);
  if (!resolved) {
    return {
      ok: false,
      error: `Unknown problem subtype "${(variant ?? "").trim()}" — expected one of: ${problemSubtypeList()}`,
    };
  }
  const { key: subtype, def } = resolved;
  const stageKeys = new Set(def.stages.map(s => s.key));

  const lines = source.split("\n");
  const nodes: FlowNode[] = [];
  const byId = new Map<string, FlowNode>();
  const byHeading = new Map<string, FlowNode>();
  const stageCount = new Map<string, number>();
  const usedIds = new Set<string>();
  const rawEdges: Array<{ from: string; to: string; line: number }> = [];
  const warnings: string[] = [];
  let capped = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (isSkippableLine(lines[i])) continue;
    const lineNum = i + 1;

    const colon = trimmed.indexOf(":");
    if (colon === -1) {
      warnings.push(`Line ${lineNum}: ignored — expected "key: value"`);
      continue;
    }
    const key = trimmed.slice(0, colon).trim().toLowerCase();
    const value = trimmed.slice(colon + 1).trim();

    // The title is read from the full source by initCanvas — not a node here.
    if (key === "title") continue;

    if (key === "link") {
      collectLinks(value, lineNum, rawEdges, warnings);
      continue;
    }

    // The stage is the key's prefix; an optional `_suffix` gives the card a
    // stable id (the link handle). `reality:` → stage reality, auto id
    // reality_N; `reality_1:` → stage reality, id reality_1.
    const us = key.indexOf("_");
    const stage = us === -1 ? key : key.slice(0, us);
    if (!stageKeys.has(stage)) {
      warnings.push(`Line ${lineNum}: ignored — "${key}" is not a stage of the ${def.label} problem type`);
      continue;
    }

    if (nodes.length >= MAX_NODES) {
      if (!capped) {
        warnings.push(`Only the first ${MAX_NODES} cards are shown.`);
        capped = true;
      }
      continue;
    }

    const bar = value.indexOf("|");
    const heading = (bar === -1 ? value : value.slice(0, bar)).trim();
    const body = bar === -1 ? "" : value.slice(bar + 1).trim();
    if (!heading && !body) {
      warnings.push(`Line ${lineNum}: skipped empty ${key}`);
      continue;
    }

    let id: string;
    if (us === -1) {
      // Auto-assign a stable id in source order, skipping any explicit ids
      // already taken (so bare and `_n` keys never collide).
      let n = (stageCount.get(stage) ?? 0) + 1;
      while (usedIds.has(`${stage}_${n}`)) n++;
      stageCount.set(stage, n);
      id = `${stage}_${n}`;
    } else {
      id = key;
      if (usedIds.has(id)) {
        warnings.push(`Line ${lineNum}: duplicate key "${key}" — a link to it is ambiguous`);
      }
    }
    usedIds.add(id);

    const node: FlowNode = { stage, id, heading, body: body || undefined };
    nodes.push(node);
    if (!byId.has(id)) byId.set(id, node);
    // Heading fallback: lets links reference a card by its visible heading too.
    if (node.heading) {
      const h = handle(node.heading);
      if (!byHeading.has(h)) byHeading.set(h, node);
    }
  }

  if (nodes.length === 0) {
    const first = def.stages[0].key;
    return { ok: false, error: `A problem statement needs at least one stage line, e.g. "${first}: ..."` };
  }

  const edges = resolveEdges(rawEdges, byId, byHeading, warnings);

  return {
    ok: true,
    data: {
      subtype,
      stages: def.stages,
      nodes,
      edges,
      warnings: warnings.length > 0 ? warnings : undefined,
    } satisfies FlowData,
  };
}

/** Normalise a heading or id token into a link handle: lowercased, whitespace
 *  collapsed (ids have no spaces, so this leaves them untouched). */
function handle(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Expands one `link:` value into directed edges. Splits on `->` into a chain of
 * groups; each group splits on `&` into node handles; every handle in group k
 * links to every handle in group k+1 (so `A & B -> C` is A->C and B->C).
 */
function collectLinks(
  value: string,
  lineNum: number,
  out: Array<{ from: string; to: string; line: number }>,
  warnings: string[],
): void {
  const groups = value
    .split("->")
    .map(g => g.split("&").map(h => handle(h)).filter(Boolean));
  if (groups.length < 2 || groups.some(g => g.length === 0)) {
    warnings.push(`Line ${lineNum}: skipped link — needs "A -> B" (optionally chained or grouped with &)`);
    return;
  }
  for (let g = 0; g < groups.length - 1; g++) {
    for (const from of groups[g]) {
      for (const to of groups[g + 1]) {
        out.push({ from, to, line: lineNum });
      }
    }
  }
}

/** Resolves raw edges to node ids — matching a link token against a card's id
 *  first, then its heading (fallback) — dropping dangling, self- and duplicate
 *  edges with a warning; preserves source order. */
function resolveEdges(
  rawEdges: Array<{ from: string; to: string; line: number }>,
  byId: Map<string, FlowNode>,
  byHeading: Map<string, FlowNode>,
  warnings: string[],
): FlowEdge[] {
  const edges: FlowEdge[] = [];
  const seen = new Set<string>();
  const resolve = (token: string): FlowNode | undefined => byId.get(token) ?? byHeading.get(token);
  for (const e of rawEdges) {
    const from = resolve(e.from);
    if (!from) { warnings.push(`Line ${e.line}: link references unknown card "${e.from}"`); continue; }
    const to = resolve(e.to);
    if (!to) { warnings.push(`Line ${e.line}: link references unknown card "${e.to}"`); continue; }
    if (from.id === to.id) { warnings.push(`Line ${e.line}: skipped self-link on "${e.from}"`); continue; }
    const sig = `${from.id} ${to.id}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    edges.push({ from: from.id, to: to.id });
  }
  return edges;
}
