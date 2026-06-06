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
    shearing: { note: 'What opinion, mood, or reaction showed up on the surface this period?' },
    product:  { note: 'What changed at the UI or campaign level? What was shipping fast?' },
    retro:    { note: 'What was the team\'s energy? What got said in standups?' },
  },
  Commerce: {
    shearing: { note: 'What goal did I set or decision did I consciously make?' },
    product:  { note: 'What was on the roadmap? Which OKRs were active?' },
    retro:    { note: 'What did the team commit to? What trade-offs were made?' },
  },
  Infrastructure: {
    shearing: {
      obs:  'What did I repeatedly do without consciously deciding to?',
      feed: 'What did someone notice about how I work — patterns, pace, style?',
      idea: 'What recurring pattern am I noticing across these observations?',
    },
    product: {
      obs:  'What did the system actually do under pressure or load?',
      feed: 'What did users or teammates report about friction or reliability?',
      idea: 'Where might tech debt or structural friction be masking a deeper constraint?',
    },
    retro: {
      obs:  'How did the team actually work, versus the stated process?',
      feed: 'What did someone say about how the team functions day-to-day?',
      idea: 'What recurring working pattern should the team name explicitly?',
    },
  },
  Governance: {
    shearing: {
      obs:  'What rule or principle did I follow without questioning it?',
      feed: 'What did someone reflect back about my limits, standards, or commitments?',
      idea: 'Is this rule still serving me — or is it inherited and unexamined?',
    },
    product: {
      obs:  'What process was followed even when it created friction?',
      feed: 'What did a stakeholder say about how decisions get made here?',
      idea: 'Which governance layer is misaligned with how the team actually operates?',
    },
    retro: {
      obs:  'What did the team treat as a rule, even without it being written down?',
      feed: 'What did someone flag about process, norms, or fairness?',
      idea: 'Which implicit agreement should be made explicit?',
    },
  },
  Culture: {
    shearing: {
      obs:  'What belief showed up in my behaviour this period — not what I said I believed?',
      feed: 'What did someone reflect back about who I am, or how I show up?',
      idea: 'Where is the gap between what I say I believe and how I actually acted?',
    },
    product: {
      obs:  'What value showed up in a tough prioritisation or hiring decision?',
      feed: 'What did a resignation, a conflict, or a customer escalation reveal?',
      idea: 'What do we actually optimise for, versus what we say we optimise for?',
    },
    retro: {
      obs:  'What did the team protect, even under deadline pressure?',
      feed: 'What did someone say about the team\'s character or identity?',
      idea: 'Where is the espoused culture diverging from the culture-in-use?',
    },
  },
  Nature: {
    shearing: { note: 'What structural constraint — in you or in your context — did not move this period and won\'t?' },
    product:  { note: 'What market, regulatory, or platform constraint is given — not a variable to optimise?' },
    retro:    { note: 'What organisational or structural reality constrained the team and remained fixed?' },
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

const VALID_TYPES = new Set<string>(['shearing', 'product', 'retro']);

// ── Parser ────────────────────────────────────────────────────────────────────

export function parsePaceLayers(source: string): PaceLayersResult {
  const lines = source.split('\n');

  let context = '';
  let type: PaceLayerType = 'shearing';
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
    // Strip inline comments
    const commentIdx = raw.indexOf('//');
    const line = commentIdx !== -1 ? raw.slice(0, commentIdx) : raw;

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
        context = trimmed.slice('context:'.length).trim();
        currentLayer = null;
        continue;
      }

      if (lower.startsWith('type:')) {
        const val = trimmed.slice('type:'.length).trim().toLowerCase();
        if (VALID_TYPES.has(val)) {
          type = val as PaceLayerType;
        } else {
          console.warn(`Vizardry pacelayers: unknown type "${val}", defaulting to "shearing"`);
        }
        currentLayer = null;
        continue;
      }

      if (lower.startsWith('layer:')) {
        commitLayer();
        const layerRaw = trimmed.slice('layer:'.length).trim();
        const canonical = LAYER_NAME_MAP[layerRaw.toLowerCase()];
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

      // Unknown top-level key — ignore
      currentLayer = null;
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
