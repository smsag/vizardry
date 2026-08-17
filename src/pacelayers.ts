import type { PaceLayerCell, PaceLayerName, PaceLayerType, PaceLayersResult, ParsedPaceLayers } from "./types";

// ── Data tables ───────────────────────────────────────────────────────────────

export type CellMode = 'note' | 'trio';

export interface LayerConfig {
  name:         PaceLayerName;
  speedLabel:   string;
  heightClass:  string;
  cellMode:     CellMode;
  accentBorder: boolean;
}

export const LAYER_CONFIG: LayerConfig[] = [
  { name: 'Fashion',        speedLabel: 'Hours – days',    heightClass: 'vzd-pl-row--xs',  cellMode: 'note', accentBorder: false },
  { name: 'Commerce',       speedLabel: 'Days – weeks',    heightClass: 'vzd-pl-row--sm',  cellMode: 'note', accentBorder: false },
  { name: 'Infrastructure', speedLabel: 'Weeks – months',  heightClass: 'vzd-pl-row--md',  cellMode: 'trio', accentBorder: false },
  { name: 'Governance',     speedLabel: 'Months – years',  heightClass: 'vzd-pl-row--lg',  cellMode: 'trio', accentBorder: false },
  { name: 'Culture',        speedLabel: 'Years',           heightClass: 'vzd-pl-row--xl',  cellMode: 'trio', accentBorder: true  },
  { name: 'Nature',         speedLabel: 'Structural',      heightClass: 'vzd-pl-row--xxl', cellMode: 'note', accentBorder: false },
];

/**
 * Primary display label for each layer per type.
 * The internal YAML key (layer: Fashion / Commerce / …) is unchanged for
 * back-compat; only the rendered label changes.
 */
export const LAYER_LABELS: Record<PaceLayerType, Record<PaceLayerName, string>> = {
  shearing: {
    Fashion:        'Trends',
    Commerce:       'Markets',
    Infrastructure: 'Systems',
    Governance:     'Governance',
    Culture:        'Culture',
    Nature:         'Nature',
  },
  product: {
    Fashion:        'Experiments',
    Commerce:       'Features',
    Infrastructure: 'Architecture',
    Governance:     'Operations',
    Culture:        'Culture',
    Nature:         'Mission',
  },
  retro: {
    Fashion:        'Actions',
    Commerce:       'Practices',
    Infrastructure: 'Tooling',
    Governance:     'Agreements',
    Culture:        'Values',
    Nature:         'Purpose',
  },
};

export const TYPE_TRANSLATIONS: Record<PaceLayerType, Record<PaceLayerName, string>> = {
  shearing: {
    Fashion:        'Opinions & reactions',
    Commerce:       'Goals & conscious choices',
    Infrastructure: 'Skills, workflows, habits',
    Governance:     'Personal rules & boundaries',
    Culture:        'Identity & core beliefs',
    Nature:         'Deep wiring — temperament, fears',
  },
  product: {
    Fashion:        'UI, copy, A/B tests',
    Commerce:       'Roadmap, OKRs, GTM',
    Infrastructure: 'Architecture, data model, APIs',
    Governance:     'Principles, process, SLAs',
    Culture:        'Company values, decision norms',
    Nature:         'Market structure, regulation, platform',
  },
  retro: {
    Fashion:        'Mood of the sprint',
    Commerce:       'Goals set, decisions made',
    Infrastructure: 'How we actually worked',
    Governance:     'Implicit rules & escalation patterns',
    Culture:        'Team identity — what we protect',
    Nature:         'Org constraints that didn\'t move',
  },
};

type PromptKey = 'note' | 'obs' | 'feed' | 'idea';
type PromptTable = Record<PaceLayerType, Partial<Record<PromptKey, string>>>;

export const PROMPTS: Record<PaceLayerName, PromptTable> = {
  Fashion: {
    shearing: { note: 'What are you reacting to right now — mood, opinion, or stance that feels current?' },
    product:  { note: 'What is shipping fast right now — UI changes, copy, campaigns?' },
    retro:    { note: "What was the team's energy this sprint? What got said in standups — not in the retro?" },
  },
  Commerce: {
    shearing: { note: 'What goals feel alive and genuinely chosen right now, not inherited?' },
    product:  { note: 'What is live on the roadmap? What OKRs are driving decisions this quarter?' },
    retro:    { note: 'What did the team commit to? What was traded off — and was that trade-off made consciously?' },
  },
  Infrastructure: {
    shearing: {
      obs:  'What do you default to doing — without consciously deciding to?',
      feed: "What have people around you named about how you work, your pace, or your style?",
      idea: 'Which recurring pattern here is a resource — and which is a constraint?',
    },
    product: {
      obs:  'What does the system actually do under real load — not what the docs say?',
      feed: 'What friction or reliability issues are users or engineers naming right now?',
      idea: 'Where is tech debt quietly limiting what you can safely change?',
    },
    retro: {
      obs:  'How did the team actually work, versus the stated process?',
      feed: 'What friction in tools, workflows, or coordination got named out loud?',
      idea: 'What working pattern served the team well enough to keep?',
    },
  },
  Governance: {
    shearing: {
      obs:  'What rule or standard are you currently operating from without questioning it?',
      feed: 'Where have others pushed back on your limits or commitments?',
      idea: 'Does this rule still serve you — or is it inherited and unexamined?',
    },
    product: {
      obs:  'What processes are people actually following — not the documented ones?',
      feed: 'Where are stakeholders frustrated with how decisions get made?',
      idea: 'Which process exists to manage a problem that no longer exists?',
    },
    retro: {
      obs:  'What did the team treat as a rule — without writing it down?',
      feed: 'Where was there friction around fairness, process, or who gets to decide?',
      idea: 'Which implicit agreement should be made explicit before next sprint?',
    },
  },
  Culture: {
    shearing: {
      obs:  'What do you actually prioritise — as shown by your calendar and choices, not your words?',
      feed: 'What has someone close reflected back about who you are or how you show up?',
      idea: 'Where is the gap between what you say matters and how you actually act?',
    },
    product: {
      obs:  'What does the company actually optimise for in a hard tradeoff — speed, quality, margin, users?',
      feed: 'What do recent departures, escalations, or all-hands questions reveal?',
      idea: 'Where is the stated culture diverging from what actually gets rewarded?',
    },
    retro: {
      obs:  'What did the team protect under pressure — quality, scope, relationships, pace?',
      feed: "What did someone say about the team's character or how you show up to each other?",
      idea: 'Where is the team you want to be diverging from the team you actually were this sprint?',
    },
  },
  Nature: {
    shearing: { note: "What constraint — in you or your context — is structural and won't shift on any useful timescale?" },
    product:  { note: 'What market structure, regulation, or platform constraint is simply given — not a variable to optimise?' },
    retro:    { note: 'What organisational constraint — structure, dependencies, or external pressure — was fixed and shaped everything else?' },
  },
};

// ── Canonical layer name lookup ───────────────────────────────────────────────

const LAYER_NAME_MAP: Record<string, PaceLayerName> = {
  fashion:        'Fashion',
  commerce:       'Commerce',
  infrastructure: 'Infrastructure',
  governance:     'Governance',
  culture:        'Culture',
  nature:         'Nature',
};

/**
 * Type-specific display name (lowercased) -> canonical layer name, so
 * `layer:` can accept either the canonical key or the current type's display
 * label as an alias. The rendered canvas never shows the canonical word (only
 * the type-specific label), so anyone authoring by hand only knows the label
 * they see on screen.
 */
const LAYER_ALIAS_MAP: Record<PaceLayerType, Record<string, PaceLayerName>> = (() => {
  const result = {} as Record<PaceLayerType, Record<string, PaceLayerName>>;
  for (const type of Object.keys(LAYER_LABELS) as PaceLayerType[]) {
    const aliases: Record<string, PaceLayerName> = {};
    for (const name of Object.keys(LAYER_LABELS[type]) as PaceLayerName[]) {
      aliases[LAYER_LABELS[type][name].toLowerCase()] = name;
    }
    result[type] = aliases;
  }
  return result;
})();

const VALID_TYPES = new Set<string>(['shearing', 'product', 'retro']);

/** Validates a single, already-resolved candidate value, warning and defaulting to "shearing" if unrecognized. */
function resolveValidType(val: string): PaceLayerType {
  const v = val.toLowerCase();
  if (VALID_TYPES.has(v)) return v as PaceLayerType;
  console.warn(`Vizardry pacelayers: unknown type "${v}", defaulting to "shearing"`);
  return 'shearing';
}

/** Strips an optional self-identifying "pacelayers," prefix from a type: value (see resolveType's doc comment). */
function stripPacelayersPrefix(val: string): string {
  const commaAt = val.indexOf(',');
  if (commaAt !== -1 && val.slice(0, commaAt).trim().toLowerCase() === 'pacelayers') {
    return val.slice(commaAt + 1).trim();
  }
  return val;
}

/**
 * Resolves `type:` alone, using "last valid line wins, warn on invalid but
 * keep the previous value" — the same rule the main parser loop follows.
 * The canvas lives under the generic ```vizardry fence, so the type: line
 * self-identifies as "pacelayers, <variant>"; the plain "<variant>" form
 * (no id prefix) is also accepted for tolerance.
 */
function resolveType(lines: string[]): PaceLayerType {
  let type: PaceLayerType = 'shearing';
  for (const raw of lines) {
    const commentIdx = raw.indexOf('//');
    const line = commentIdx !== -1 ? raw.slice(0, commentIdx) : raw;
    const trimmed = line.trim();
    if (line.search(/\S/) !== 0) continue; // only top-level lines
    const lower = trimmed.toLowerCase();
    if (lower.startsWith('type:')) {
      const val = stripPacelayersPrefix(trimmed.slice('type:'.length).trim()).toLowerCase();
      if (VALID_TYPES.has(val)) {
        type = val as PaceLayerType;
      } else {
        console.warn(`Vizardry pacelayers: unknown type "${val}", defaulting to "shearing"`);
      }
    }
  }
  return type;
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * `typeOverride`, when provided (e.g. by the vizardry dispatcher, which
 * already split a compound "type: pacelayers, shearing" line into id +
 * variant), is used instead of scanning `source` for its own `type:` line —
 * but is still validated exactly as a scanned value would be (warn and
 * default to "shearing" if unrecognized).
 */
export function parsePaceLayers(source: string, typeOverride?: string): PaceLayersResult {
  const lines = source.split('\n');

  // Resolve `type:` up front (before layers are parsed) so `layer:` can
  // resolve type-specific aliases regardless of whether `type:` appears
  // before or after `layer:` lines in the source.
  const type: PaceLayerType = typeOverride !== undefined
    ? resolveValidType(typeOverride)
    : resolveType(lines);

  let context = '';
  const layers: Partial<Record<PaceLayerName, PaceLayerCell>> = {};

  let currentLayer: PaceLayerName | null = null;
  let currentCell: PaceLayerCell = {};
  // Track the last sub-key we parsed so continuation lines can append to it
  let lastKey: keyof PaceLayerCell | null = null;

  const commitLayer = (): void => {
    if (currentLayer !== null) {
      layers[currentLayer] = currentCell;
    }
  };

  for (const raw of lines) {
    // Strip inline comments (but not :// in URLs)
    let commentIdx = 0;
    while (commentIdx < raw.length) {
      commentIdx = raw.indexOf('//', commentIdx);
      if (commentIdx === -1) { commentIdx = raw.length; break; }
      if (commentIdx > 0 && raw[commentIdx - 1] === ':') { commentIdx += 2; continue; }
      break;
    }
    const line = commentIdx < raw.length ? raw.slice(0, commentIdx) : raw;

    const trimmed = line.trimEnd();
    if (trimmed.trim() === '') {
      // Blank lines don't reset current layer — just skip
      lastKey = null;
      continue;
    }

    const indent = line.search(/\S/);

    if (indent === 0) {
      // Top-level key
      lastKey = null;

      const lower = trimmed.toLowerCase();

      if (lower.startsWith('context:')) {
        commitLayer();
        context = trimmed.slice('context:'.length).trim();
        currentLayer = null;
        currentCell = {};
        continue;
      }

      if (lower.startsWith('type:')) {
        // Already resolved by resolveType() before this loop started.
        commitLayer();
        currentLayer = null;
        currentCell = {};
        continue;
      }

      if (lower.startsWith('layer:')) {
        commitLayer();
        const layerRaw = trimmed.slice('layer:'.length).trim();
        const key = layerRaw.toLowerCase();
        const canonical = LAYER_NAME_MAP[key] ?? LAYER_ALIAS_MAP[type][key];
        if (!canonical) {
          console.warn(`Vizardry pacelayers: unknown layer "${layerRaw}", skipping`);
          currentLayer = null;
          currentCell = {};
          continue;
        }
        currentLayer = canonical;
        currentCell = {};
        continue;
      }

      // Unknown top-level key — ignore, but keep any in-progress layer intact
      // (don't commit or reset — an unrecognised line shouldn't end the layer).
      continue;
    }

    // Indented line — belongs to current layer
    if (currentLayer === null) continue;

    const innerTrimmed = trimmed.trim();

    // Check if this is a sub-key line
    const subKeyMatch = innerTrimmed.match(/^(obs|feed|idea|note):\s*(.*)/i);
    if (subKeyMatch) {
      const key = subKeyMatch[1].toLowerCase() as keyof PaceLayerCell;
      const val = subKeyMatch[2];
      currentCell[key] = val;
      lastKey = key;
      continue;
    }

    // Continuation line — append to last sub-key value
    if (lastKey !== null) {
      const existing = currentCell[lastKey] ?? '';
      currentCell[lastKey] = existing === '' ? innerTrimmed : existing + '\n' + innerTrimmed;
      continue;
    }
  }

  // Commit the final layer
  commitLayer();

  const data: ParsedPaceLayers = { context, type, layers };
  return { ok: true, data };
}
