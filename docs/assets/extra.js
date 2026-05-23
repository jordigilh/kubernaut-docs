/**
 * Pipeline phase card <-> tab synchronisation.
 *
 * Each SVG card has class="phase-card" and data-tab="N" (0-based index).
 * Material for MkDocs renders === tabs as .tabbed-set with .tabbed-labels
 * containing one <label> per tab and <input type="radio"> siblings.
 */
(function () {
  function setup() {
    var obj = document.getElementById("pipeline-svg");
    if (!obj) return;

    var svgDoc = null;
    if (obj.tagName === "OBJECT" || obj.tagName === "object") {
      try {
        svgDoc = obj.contentDocument;
      } catch (e) {
        return;
      }
    } else if (obj.tagName === "svg" || obj.tagName === "SVG") {
      svgDoc = obj;
    }
    if (!svgDoc) return;

    var cards = svgDoc.querySelectorAll(".phase-card");
    if (!cards.length) return;

    function getTabbedSet() {
      var sets = document.querySelectorAll(".tabbed-set");
      for (var i = 0; i < sets.length; i++) {
        if (sets[i].closest(".md-content")) return sets[i];
      }
      return sets[0] || null;
    }

    function updateIndicators(activeIndex) {
      var indicators = svgDoc.querySelectorAll(".phase-indicator");
      indicators.forEach(function (ind) {
        var parent = ind.closest(".phase-card");
        if (!parent) return;
        var idx = parseInt(parent.getAttribute("data-tab"), 10);
        ind.setAttribute(
          "fill",
          idx === activeIndex
            ? ind.getAttribute("data-color")
            : "transparent"
        );
      });
    }

    function activateTab(index) {
      var tabSet = getTabbedSet();
      if (!tabSet) return;
      var labels = tabSet.querySelectorAll(".tabbed-labels > label");
      if (labels[index]) labels[index].click();
      updateIndicators(index);
    }

    cards.forEach(function (card) {
      card.style.cursor = "pointer";
      card.addEventListener("click", function () {
        var idx = parseInt(card.getAttribute("data-tab"), 10);
        activateTab(idx);
      });
    });

    var tabSet = getTabbedSet();
    if (tabSet) {
      var inputs = tabSet.querySelectorAll('input[type="radio"]');
      inputs.forEach(function (input, i) {
        input.addEventListener("change", function () {
          if (input.checked) updateIndicators(i);
        });
      });
    }

    updateIndicators(0);
  }

  function waitForSVG() {
    var obj = document.getElementById("pipeline-svg");
    if (!obj) return;

    if (obj.tagName === "OBJECT" || obj.tagName === "object") {
      obj.addEventListener("load", function () {
        setTimeout(setup, 50);
      });
      if (obj.contentDocument && obj.contentDocument.readyState === "complete") {
        setTimeout(setup, 50);
      }
    } else {
      setup();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", waitForSVG);
  } else {
    waitForSVG();
  }
})();
