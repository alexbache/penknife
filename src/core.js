// Penknife core: a tiny registry for tools, plus keyboard shortcuts, toasts
// and helpers for building UI out of Basecamp's own markup and icons.
//
// A tool looks like:
//   {
//     id: "doc-export",
//     matches: () => boolean,          // should the tool run on this page?
//     mount: () => cleanup | void,     // add the tool's UI; return a cleanup function
//     alive: () => boolean,            // optional: false if Basecamp removed the UI
//     shortcuts: [{ key, description, run }],  // single-key shortcuts
//   }
(function () {
  "use strict";

  const tools = [];
  let active = []; // { tool, cleanup }
  let currentUrl = null;

  const Penknife = {
    register(tool) {
      tools.push(tool);
    },

    start() {
      document.addEventListener("keydown", onKeydown, true);
      // Basecamp navigates with Turbo, so pages change without a full reload.
      document.addEventListener("turbo:load", refresh);
      // Remove our UI before Turbo caches the page, or a stale copy comes back.
      document.addEventListener("turbo:before-cache", unmountAll);
      window.addEventListener("popstate", refresh);
      setInterval(heal, 750);
      refresh();
    },

    toast(message, { timeout = 2600 } = {}) {
      document.querySelectorAll(".pk-toast").forEach((el) => el.remove());
      const el = document.createElement("div");
      el.className = "pk-toast";
      el.setAttribute("role", "status");
      el.textContent = message;
      document.body.appendChild(el);
      requestAnimationFrame(() => el.classList.add("pk-toast--in"));
      setTimeout(() => {
        el.classList.remove("pk-toast--in");
        setTimeout(() => el.remove(), 250);
      }, timeout);
    },

    // An icon from Basecamp's own sprite sheet, e.g. icon("download").
    // The sprite URL has a content hash, so read it from an icon on the page.
    icon(name) {
      const use = document.querySelector("svg.svg-icon use[href*='#']");
      if (!use) return "";
      const sprite = use.getAttribute("href").split("#")[0];
      return `<svg class="svg-icon svg-icon--${name}" aria-hidden="true"><use href="${sprite}#${name}"></use></svg>`;
    },

    // Build an element from a static HTML string (never pass user content here).
    html(markup) {
      const t = document.createElement("template");
      t.innerHTML = markup.trim();
      return t.content.firstElementChild;
    },
  };

  function unmountAll() {
    for (const { cleanup } of active) if (typeof cleanup === "function") safe(cleanup, null);
    active = [];
  }

  function refresh() {
    currentUrl = location.href;
    unmountAll();
    active = tools.filter((t) => safe(() => t.matches(), false)).map((tool) => ({
      tool,
      cleanup: tool.mount ? safe(() => tool.mount(), null) : null,
    }));
  }

  // Re-mount when the URL changed without a Turbo event, or when Basecamp
  // re-rendered part of the page and took our UI with it.
  function heal() {
    if (location.href !== currentUrl) return refresh();
    if (active.some(({ tool }) => tool.alive && !safe(() => tool.alive(), true))) refresh();
  }

  function safe(fn, fallback) {
    try {
      return fn();
    } catch (err) {
      console.error("[penknife]", err);
      return fallback;
    }
  }

  // ---- keyboard -----------------------------------------------------------

  function isTyping(target) {
    if (!target || !(target instanceof Element)) return false;
    return Boolean(
      target.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], trix-editor, lexxy-editor"),
    );
  }

  function onKeydown(e) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
    if (isTyping(e.target)) return;
    for (const { tool } of active) {
      const shortcut = (tool.shortcuts || []).find((s) => s.key === e.key);
      if (shortcut) {
        e.preventDefault();
        e.stopPropagation();
        safe(() => shortcut.run(e), null);
        return;
      }
    }
  }

  window.Penknife = Penknife;
})();
