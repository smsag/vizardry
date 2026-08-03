// ── Shared Tree Node (used by OST, Mind Map, Impact Map renderers) ──────────

export interface TreeNode {
  text: string;
  level: number;
  sublabel?: string;
  /** Original source keyword (OST lane mode) — passed through to edit ops so a
   *  node can be located even when several keywords share a level. */
  key?: string;
  /** Bullet strings rendered as a chevron list inside the node (OST lane mode). */
  bullets?: string[];
  children: TreeNode[];

  // Set by layout engine — do not populate outside renderer
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TreeNodeStyle {
  fillVar: string;
  textVar: string;
  borderRadius: number;
  dashed: boolean;
  accentBar?: boolean;
  /** Render as an outlined box (transparent-ish fill, coloured border) rather
   *  than a solid fill. Used by the OST swim-lane style. */
  outline?: boolean;
  /** Border colour (CSS var or literal). Defaults to the neutral border when
   *  omitted. Also colours the connectors flowing INTO this level. */
  strokeVar?: string;
}

/** One horizontal swim-lane band in OST lane-mode layout. */
export interface TreeLane {
  /** Left-gutter label, e.g. "Opportunity Space". */
  label: string;
}

export interface TreeRenderOptions {
  nodeW: number;
  nodeH: number;
  levelGap: number;
  siblingGap: number;
  hPadding: number;
  vPadding: number;
  maxLabelChars: number;
  levelStyles: TreeNodeStyle[];
  canvasClass: string;
  wrapperClass: string;
  /** Layout direction. "down" (default) = root at top. "right" = root at left.
   *  "left" = root at right (RTL). "lanes" = top-down, but each level is a
   *  labelled horizontal band with variable-height boxes (OST). */
  direction?: "down" | "right" | "left" | "lanes";
  /** Deepest level that may have children added. Nodes at this level or deeper
   *  do not render the "+" add-child button. Omit to allow add at all levels. */
  maxAddLevel?: number;
  /** Wrap node labels (and bullets) onto multiple lines with variable box
   *  height, rendered via foreignObject instead of a single truncated <text>.
   *  Off by default so the classic tree diagrams are unchanged. */
  wrap?: boolean;
  /** Where the per-node sublabel/caption sits. "corner" (default) keeps the
   *  existing bottom-right placement; "top" renders it as an italic caption
   *  above the label (OST). */
  captionPosition?: "corner" | "top";
  /** Lane definitions (one per level), used only when direction === "lanes".
   *  The left-gutter width is reserved for the lane labels. */
  lanes?: TreeLane[];
  /** Left-gutter width reserved for lane labels in lane mode. */
  gutterWidth?: number;
}

/** Callbacks supplied by the caller when tree nodes should be editable. */
export interface TreeEditHandlers {
  onRename: (node: TreeNode, newText: string) => void;
  onAddChild: (node: TreeNode) => void;
  onDelete: (node: TreeNode) => void;
  /** Append a new bullet to a node (OST). */
  onAddBullet?: (node: TreeNode, text: string) => void;
  /** Rename an existing bullet of a node (OST). */
  onEditBullet?: (node: TreeNode, oldText: string, newText: string) => void;
  /** Remove a bullet from a node (OST). */
  onDeleteBullet?: (node: TreeNode, text: string) => void;
}
