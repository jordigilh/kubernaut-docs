/* Reinitialize Mermaid with the correct theme when the color scheme changes */
document.addEventListener("DOMContentLoaded", function () {
  var defined = false;

  function getMermaidTheme() {
    var scheme = document.body.getAttribute("data-md-color-scheme");
    return scheme === "slate" ? "dark" : "default";
  }

  var observer = new MutationObserver(function () {
    if (typeof mermaid !== "undefined") {
      mermaid.initialize({ startOnLoad: false, theme: getMermaidTheme() });
      mermaid.init(undefined, ".mermaid");
    }
  });

  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ["data-md-color-scheme"],
  });
});
