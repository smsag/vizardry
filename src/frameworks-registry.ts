import type { FrameworkDefinition } from "./types";
import { ADKAR } from "./frameworks/adkar";
import { BMC } from "./frameworks/bmc";
import { LEAN } from "./frameworks/lean";
import { OPPORTUNITY } from "./frameworks/opportunity";
import { LEANUX } from "./frameworks/leanux";
import { VPC } from "./frameworks/vpc";
import { KATA } from "./frameworks/kata";
import { JOBS } from "./frameworks/jobs";
import { RAC } from "./frameworks/rac";
import { SWOT } from "./frameworks/swot";
import { FOURLS } from "./frameworks/fourls";
import { PTW } from "./frameworks/ptw";

// The map is derived from the id field on each definition — no duplicate key.
//
// Deliberately NOT in src/frameworks/ — scripts/docs-check.sh treats every
// file in that directory as a framework definition whose id must be
// mentioned in README.md, which doesn't apply to this shared registry.

export const ALL_FRAMEWORKS: FrameworkDefinition[] = [
  ADKAR, BMC, FOURLS, LEAN, OPPORTUNITY, LEANUX, PTW, VPC, KATA, JOBS, RAC, SWOT,
];

export const FRAMEWORKS: Record<string, FrameworkDefinition> = Object.fromEntries(
  ALL_FRAMEWORKS.map(f => [f.id, f])
);
