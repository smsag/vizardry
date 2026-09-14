import type { FrameworkDefinition } from "./types";
import { ADKAR } from "./frameworks/adkar";
import { BMC } from "./frameworks/bmc";
import { ERRC } from "./frameworks/errc";
import { LEAN } from "./frameworks/lean";
import { OPPORTUNITY } from "./frameworks/opportunity";
import { LEANUX } from "./frameworks/leanux";
import { EXPERIMENT } from "./frameworks/experiment";
import { VPC } from "./frameworks/vpc";
import { KATA } from "./frameworks/kata";
import { JOBS } from "./frameworks/jobs";
import { RAC } from "./frameworks/rac";
import { SWOT } from "./frameworks/swot";
import { FOURLS } from "./frameworks/fourls";
import { PTW } from "./frameworks/ptw";
import { FUTURE_SELF } from "./frameworks/futureself";

// The declaration order of the grid frameworks, and nothing else: the lookup
// map and the insert-options list are both built in src/catalog.ts, which is
// also where ids are checked for collisions against the custom renderers.
//
// Deliberately NOT in src/frameworks/ — scripts/docs-check.sh treats every
// file in that directory as a framework definition whose id must be
// mentioned in README.md, which doesn't apply to this shared registry.

export const ALL_FRAMEWORKS: FrameworkDefinition[] = [
  ADKAR, BMC, ERRC, FOURLS, LEAN, OPPORTUNITY, LEANUX, PTW, VPC, KATA, JOBS, RAC, SWOT, EXPERIMENT, FUTURE_SELF,
];
