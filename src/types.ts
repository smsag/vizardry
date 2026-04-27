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
  gridColumns: string;
  gridRows: string;
}

export interface ImpactDeliverable {
  text: string;
}

export interface ImpactItem {
  name: string;
  deliverables: string[];
}

export interface ImpactActor {
  name: string;
  impacts: ImpactItem[];
}

export interface ImpactMap {
  goal: string;
  actors: ImpactActor[];
}

export type ImpactMapResult =
  | { ok: true; data: ImpactMap }
  | { ok: false; error: string };

export interface BlockDefinition {
  key: string;
  label: string;
  area: string;
}

export type ParseResult =
  | { ok: true; data: Record<string, string>; links: Record<string, string> }
  | { ok: false; error: string };
