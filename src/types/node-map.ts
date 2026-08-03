import type { Result } from "./core";

// ── Node Map ──────────────────────────────────────────────────────────────────

/** A palette name, or a raw "#rgb"/"#rrggbb" hex literal passed through as-authored. */
export type NodeMapColor =
  | "red" | "orange" | "yellow" | "green" | "teal"
  | "blue" | "purple" | "pink" | "gray"
  | `#${string}`;

export type NodeMapLinkDirection = "directed" | "bidirectional" | "undirected";
export type NodeMapLineStyle = "solid" | "dashed";

export interface NodeMapBox {
  name: string;
  x: number;
  y: number;
  color?: NodeMapColor;
  /** Multi-line body text, "\n"-joined from indented continuation lines. */
  body?: string;
}

export interface NodeMapLink {
  from: string;
  to: string;
  direction: NodeMapLinkDirection;
  label?: string;
  color?: NodeMapColor;
  style: NodeMapLineStyle;
}

export interface NodeMapData {
  boxes: NodeMapBox[];
  links: NodeMapLink[];
}

export type NodeMapResult = Result<NodeMapData>;
