const openButton = document.getElementById("open");
if (!openButton) throw new Error("popup.html is missing #open");

openButton.addEventListener("click", () => {
  const api = typeof browser !== "undefined" ? browser : chrome;
  // Firefox returns a promise, Chrome takes a callback and returns undefined;
  // handle both so a blocked tab creation is at least logged, never swallowed.
  const result = api.tabs.create({ url: api.runtime.getURL("viewer.html") });
  if (result && typeof result.then === "function") {
    result.then(() => window.close(), (err: unknown) => console.error("[vizardry] could not open viewer", err));
  } else {
    window.close();
  }
});
