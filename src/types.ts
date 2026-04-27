export interface FrameworkBlock {
  key: string;
  label: string;
  content: string;
}

export interface FrameworkDefinition {
  id: string;
  label: string;
  blocks: BlockDefinition[];
  gridTemplate: string;
  gridTemplateMobile: string;
}

export interface BlockDefinition {
  key: string;
  label: string;
  area: string;
}

export type ParseResult =
  | { ok: true; data: Record<string, string> }
  | { ok: false; error: string };
