import type { FrameworkDefinition } from "../types";
import { ADKAR } from "./adkar";
import { BMC } from "./bmc";
import { LEAN } from "./lean";
import { OPPORTUNITY } from "./opportunity";
import { LEANUX } from "./leanux";
import { VPC } from "./vpc";
import { KATA } from "./kata";
import { JOBS } from "./jobs";
import { RAC } from "./rac";
import { SWOT } from "./swot";
import { FOURLS } from "./fourls";
import { PTW } from "./ptw";

// The map is derived from the id field on each definition — no duplicate key.

export const ALL_FRAMEWORKS: FrameworkDefinition[] = [
  ADKAR, BMC, FOURLS, LEAN, OPPORTUNITY, LEANUX, PTW, VPC, KATA, JOBS, RAC, SWOT,
];

export const FRAMEWORKS: Record<string, FrameworkDefinition> = Object.fromEntries(
  ALL_FRAMEWORKS.map(f => [f.id, f])
);
