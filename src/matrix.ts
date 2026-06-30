import type { MatrixData, MatrixResult, MatrixType } from "./types";
import { parseFrameworkSource } from "./parser";

export function parseMatrix(source: string): MatrixResult {
  let type: MatrixType = "pain";

  const lines = source.split("\n");
  const filtered: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.toLowerCase().startsWith("type:")) {
      const value = trimmed.slice("type:".length).trim().toLowerCase();
      if (value === "pain") {
        type = "pain";
      } else if (value === "opportunity") {
        type = "opportunity";
      } else {
        return { ok: false, error: `Unknown type "${value}" — expected "pain" or "opportunity"` };
      }
    } else {
      filtered.push(line);
    }
  }

  const result = parseFrameworkSource(filtered.join("\n"));
  if (!result.ok) return result;

  return { ok: true, data: { type, data: result.data, cardModes: result.cardModes } };
}
