import type { SIPOCData, SIPOCResult } from "./types";

const SECTIONS = ["suppliers", "inputs", "process", "outputs", "customers"] as const;
type Section = typeof SECTIONS[number];

export function parseSIPOC(source: string): SIPOCResult {
  const lines = source.split("\n");
  const data: SIPOCData = { suppliers: [], inputs: [], process: [], outputs: [], customers: [] };
  let current: Section | null = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const indent = raw.search(/\S/);

    if (indent === 0) {
      const key = trimmed.toLowerCase().replace(/:$/, "") as Section;
      if (!(SECTIONS as readonly string[]).includes(key)) {
        return { ok: false, error: `Line ${i + 1}: unknown section "${trimmed}" — expected one of: ${SECTIONS.join(", ")}` };
      }
      current = key;
    } else {
      if (!current) return { ok: false, error: `Line ${i + 1}: item before any section header` };
      if (trimmed) data[current].push(trimmed);
    }
  }

  return { ok: true, data };
}
