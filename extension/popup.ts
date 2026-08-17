document.getElementById("open")!.addEventListener("click", () => {
  const api = typeof browser !== "undefined" ? browser : chrome;
  api.tabs.create({ url: api.runtime.getURL("viewer.html") });
  window.close();
});
