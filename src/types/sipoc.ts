import type { Result } from "./core";

// ── SIPOC ────────────────────────────────────────────────────────────────────
//
// One canvas, two views over the same data: "table" (default) renders `rows`
// as an editable table; "flow" derives a node/link diagram from those same
// rows (see renderer/sipoc.ts) so nothing needs to be re-entered when
// switching. `links` is parsed unconditionally regardless of the active view
// — it sits inert in table view and resurfaces the moment you switch to flow,
// exactly as Owner/Metric sit inert in flow view and resurface in table view.

export type SIPOCVariant = "table" | "flow";

export interface SIPOCRow {
  supplier: string;
  input: string;
  process: string;
  output: string;
  customer: string;
  owner: string;
  metric: string;
}

/** A `link: A -> B` directive — raw, un-normalised text pairs. Only ever
 *  resolved against actual nodes when rendering flow view (see
 *  renderer/sipoc.ts's deriveFlowGraph) — never validated at parse time, so
 *  a stale link can't break table view. */
export interface SIPOCFlowLink {
  from: string;
  to: string;
}

export interface SIPOCData {
  variant: SIPOCVariant;
  rows: SIPOCRow[];
  links: SIPOCFlowLink[];
}

export type SIPOCResult = Result<SIPOCData>;

export type SIPOCColumn = "suppliers" | "inputs" | "process" | "outputs" | "customers";

/** Renderer-internal node for flow view's derived diagram — never produced
 *  by the parser; built from `rows` at render time (see renderer/sipoc.ts).
 *  Always drawn as a plain rect — there's no source syntax for a per-node
 *  shape override since the old freeform `Name [shape]` declarations were
 *  dropped in favour of deriving nodes from table rows. */
export interface SIPOCFlowNode {
  id: string;           // normalised label used for link lookup
  label: string;        // display text
  column: SIPOCColumn;
}
