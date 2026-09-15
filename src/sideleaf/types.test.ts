import { describe, it, expect } from "vitest";
import { cardId, parseCardId } from "./types";

describe("cardId / parseCardId", () => {
  it("round-trips both services", () => {
    for (const ref of [
      { service: "linear", key: "CORE-1234" },
      { service: "upvoty", key: "UPV-5OdEIWLP5WQ1B2z7TnjE1o" },
    ] as const) {
      expect(parseCardId(cardId(ref))).toEqual(ref);
    }
  });

  it("keeps a key containing colons intact", () => {
    // Only the first colon separates the service, so a key is never truncated.
    expect(parseCardId("linear:A:B:C")).toEqual({ service: "linear", key: "A:B:C" });
  });

  it("rejects ids that could not have come from cardId", () => {
    // Persisted state is workspace.json — user-editable, and an older build
    // may have written something else. A bad id must be dropped, not turned
    // into a card that can never load.
    for (const bad of ["", "linear:", ":CORE-1", "CORE-1", "jira:ABC-1", 42, null, undefined, {}]) {
      expect(parseCardId(bad), String(bad)).toBeNull();
    }
  });
});
