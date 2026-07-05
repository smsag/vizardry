// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { enableDragGesture, DRAG_THRESHOLD_PX } from "./drag-gesture";

function makeCard(): HTMLElement {
  document.body.innerHTML = "";
  const card = document.createElement("div");
  document.body.appendChild(card);
  return card;
}

function handlers() {
  return { onStart: vi.fn(), onMove: vi.fn(), onEnd: vi.fn(), onClick: vi.fn() };
}

function mouse(type: string, clientX: number, clientY: number): MouseEvent {
  return new MouseEvent(type, { clientX, clientY, bubbles: true, button: 0 });
}

function touch(type: string, clientX: number, clientY: number): Event {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "touches", { value: [{ clientX, clientY }] });
  return ev;
}

describe("enableDragGesture — mouse", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("treats a click with tiny movement as a click, not a drag", () => {
    const card = makeCard();
    const h = handlers();
    enableDragGesture(card, h);

    card.dispatchEvent(mouse("mousedown", 100, 100));
    document.dispatchEvent(mouse("mousemove", 103, 101)); // < threshold
    document.dispatchEvent(mouse("mouseup", 103, 101));

    expect(h.onStart).not.toHaveBeenCalled();
    expect(h.onClick).toHaveBeenCalledOnce();
    expect(h.onEnd).not.toHaveBeenCalled();
  });

  it("starts a drag only once movement passes the threshold", () => {
    const card = makeCard();
    const h = handlers();
    enableDragGesture(card, h);

    card.dispatchEvent(mouse("mousedown", 100, 100));
    document.dispatchEvent(mouse("mousemove", 100 + DRAG_THRESHOLD_PX + 2, 100));
    expect(h.onStart).toHaveBeenCalledOnce();

    document.dispatchEvent(mouse("mousemove", 140, 120));
    expect(h.onMove).toHaveBeenCalled();

    document.dispatchEvent(mouse("mouseup", 140, 120));
    expect(h.onEnd).toHaveBeenCalledOnce();
    expect(h.onClick).not.toHaveBeenCalled();
  });

  it("respects shouldStart (e.g. clicks on a button are ignored)", () => {
    const card = makeCard();
    const btn = document.createElement("button");
    card.appendChild(btn);
    const h = handlers();
    enableDragGesture(card, { ...h, shouldStart: (t) => !t.closest("button") });

    btn.dispatchEvent(mouse("mousedown", 100, 100));
    document.dispatchEvent(mouse("mousemove", 200, 200));
    document.dispatchEvent(mouse("mouseup", 200, 200));

    expect(h.onStart).not.toHaveBeenCalled();
    expect(h.onClick).not.toHaveBeenCalled();
  });

  it("removes its move/up listeners after the gesture ends", () => {
    const card = makeCard();
    const h = handlers();
    enableDragGesture(card, h);

    card.dispatchEvent(mouse("mousedown", 100, 100));
    document.dispatchEvent(mouse("mouseup", 100, 100)); // click, no move
    h.onMove.mockClear();
    document.dispatchEvent(mouse("mousemove", 300, 300)); // stray move after release
    expect(h.onMove).not.toHaveBeenCalled();
  });
});

describe("enableDragGesture — touch", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("does not pick up the card on touchstart (a tap is not a drag)", () => {
    const card = makeCard();
    const h = handlers();
    enableDragGesture(card, h);

    card.dispatchEvent(touch("touchstart", 100, 100));
    expect(h.onStart).not.toHaveBeenCalled(); // key regression: no instant pickup

    document.dispatchEvent(touch("touchend", 100, 100));
    expect(h.onEnd).not.toHaveBeenCalled();
    expect(h.onClick).toHaveBeenCalledOnce();
  });

  it("starts a drag once the touch moves past the threshold", () => {
    const card = makeCard();
    const h = handlers();
    enableDragGesture(card, h);

    card.dispatchEvent(touch("touchstart", 100, 100));
    document.dispatchEvent(touch("touchmove", 100 + DRAG_THRESHOLD_PX + 3, 100));
    expect(h.onStart).toHaveBeenCalledOnce();

    document.dispatchEvent(touch("touchend", 140, 100));
    expect(h.onEnd).toHaveBeenCalledOnce();
  });
});
