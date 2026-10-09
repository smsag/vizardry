// @vitest-environment happy-dom
import "../test-setup";
import { describe, it, expect } from "vitest";
import { renderHeaderChip } from "./header-chip";

function chip(value: string, editable: boolean): HTMLElement {
  const header = document.createElement("div");
  document.body.appendChild(header);
  renderHeaderChip(header, {
    label: "Deadline", value, placeholder: "Set a date",
    onCommit: editable ? () => {} : undefined,
  });
  return header.querySelector<HTMLElement>(".vizardry-period-value")!;
}

describe("renderHeaderChip", () => {
  it("renders inline formatting on the first render", () => {
    expect(chip("*TBD*", false).innerHTML).toBe("<em>TBD</em>");
  });

  it("looks the same after an edit is cancelled", () => {
    const el = chip("*TBD*", true);
    const before = el.innerHTML;
    el.click();
    expect(el.textContent).toBe("*TBD*"); // the editor shows the source
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(el.innerHTML).toBe(before);
  });

  it("keeps the placeholder after cancelling an edit of an empty chip", () => {
    const el = chip("", true);
    expect(el.textContent).toBe("Set a date");
    el.click();
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(el.textContent).toBe("Set a date");
    expect(el.classList.contains("vizardry-period-value--empty")).toBe(true);
  });
});
