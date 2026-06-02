import type { SIPOCColumn, SIPOCFlowData, SIPOCFlowLink, SIPOCFlowNode, SIPOCFlowResult, SIPOCNodeShape } from "./types";

const COLUMNS: SIPOCColumn[] = ["suppliers", "inputs", "process", "outputs", "customers"];
const SHAPES: SIPOCNodeShape[] = ["ellipse", "parallelogram", "rect"];

function normalise(label: string): string {
  return label.toLowerCase().trim();
}

/**
 * Parses the flow variant of a sipoc block (i.e. source already has
 * "type: flow" stripped by the caller).
 *
 * Syntax:
 *   suppliers:
 *     Supplier 1 [ellipse]
 *
 *   link: Supplier 1 -> Data 1
 */
export function parseSIPOCFlow(source: string): SIPOCFlowResult {
  const lines = source.split("\n");
  const nodes: SIPOCFlowNode[] = [];
  const links: SIPOCFlowLink[] = [];
  const linkLines = new Map<SIPOCFlowLink, number>();
  const nodeIndex = new Map<string, SIPOCFlowNode>();
  let currentCol: SIPOCColumn | null = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#") || trimmed.toLowerCase().startsWith("title:")) continue;

    const indent = raw.search(/\S/);

    if (indent === 0) {
      // Top-level: either a column header or a link directive
      if (trimmed.startsWith("link:")) {
        currentCol = null;
        const rest = trimmed.slice("link:".length).trim().replace(/#.*$/, "").trim();
        const arrowIdx = rest.indexOf("->");
        if (arrowIdx === -1) {
          return { ok: false, error: `Line ${i + 1}: link requires "->" separator, e.g. link: A -> B` };
        }
        const fromLabel = rest.slice(0, arrowIdx).trim();
        const toLabel = rest.slice(arrowIdx + 2).trim();
        if (!fromLabel || !toLabel) {
          return { ok: false, error: `Line ${i + 1}: link requires two node names` };
        }
        const linkObj = { from: normalise(fromLabel), to: normalise(toLabel) };
        links.push(linkObj);
        linkLines.set(linkObj, i + 1);
        continue;
      }

      const colKey = trimmed.toLowerCase().replace(/:$/, "") as SIPOCColumn;
      if (!(COLUMNS as string[]).includes(colKey)) {
        return { ok: false, error: `Line ${i + 1}: unknown section "${trimmed}" — expected one of: ${COLUMNS.join(", ")}, or link:` };
      }
      currentCol = colKey;
      continue;
    }

    // Indented: node declaration
    if (!currentCol) {
      return { ok: false, error: `Line ${i + 1}: node before any section header` };
    }

    const bracketMatch = trimmed.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
    if (!bracketMatch) {
      return { ok: false, error: `Line ${i + 1}: node requires a shape, e.g. "${trimmed} [rect]" — valid shapes: ${SHAPES.join(", ")}` };
    }
    const label = bracketMatch[1].trim();
    const shapeRaw = bracketMatch[2].trim().toLowerCase() as SIPOCNodeShape;
    if (!label) {
      return { ok: false, error: `Line ${i + 1}: node requires a label` };
    }
    if (!(SHAPES as string[]).includes(shapeRaw)) {
      return { ok: false, error: `Line ${i + 1}: unknown shape "${shapeRaw}" — valid shapes: ${SHAPES.join(", ")}` };
    }

    const id = normalise(label);
    if (nodeIndex.has(id)) {
      return { ok: false, error: `Line ${i + 1}: duplicate node name "${label}"` };
    }

    const node: SIPOCFlowNode = { id, label, shape: shapeRaw, column: currentCol };
    nodes.push(node);
    nodeIndex.set(id, node);
  }

  if (nodes.length === 0) {
    return { ok: false, error: "No nodes defined" };
  }

  // Validate link references (line numbers tracked in linkLines for precise errors)
  for (const link of links) {
    const ln = linkLines.get(link) ?? 0;
    const lineTag = ln ? `Line ${ln}: ` : "";
    if (!nodeIndex.has(link.from)) {
      return { ok: false, error: `${lineTag}link references unknown node "${link.from}"` };
    }
    if (!nodeIndex.has(link.to)) {
      return { ok: false, error: `${lineTag}link references unknown node "${link.to}"` };
    }
  }

  return { ok: true, data: { nodes, links } };
}
