// Everything that knows about Basecamp's URLs and page markup lives here, so
// when Basecamp changes its HTML there is one file to fix.
(function () {
  "use strict";

  const DOC_PATH = /^\/\d+\/buckets\/\d+\/documents\/\d+\/?$/;
  const FOLDER_PATH = /^\/\d+\/buckets\/\d+\/vaults\/\d+\/?$/;

  // The doc is an <article class="document recording">; comments live in a
  // separate .thread section, and banners also use .formatted_content.
  const CONTENT_SELECTORS = [
    "article.document .document-style-content > .formatted_content",
    "article.document .formatted_content",
  ];
  const TITLE_SELECTORS = ["article.document .perma-header__title", "article.document h1"];
  const BREADCRUMB_FOLDERS = "nav#breadcrumbs a[href*='/vaults/']";
  // The sticky bar at the top of a doc, and the actions on its right
  // (Bookmark, Edit, the "…" menu).
  const TOOLBAR = ".perma-toolbar";
  const TOOLBAR_ACTIONS = ".perma-toolbar__actions";
  const BOOKMARK = "turbo-frame[id^='bookmark_quick_toggle']";
  // Parts of the rendered doc that are page chrome, not content.
  const CHROME_SELECTORS = [".heading__link", ".attachment__buttons", ".hidden\\@print"].join(", ");

  const Basecamp = {
    DOC_PATH,
    CHROME_SELECTORS,

    isDocPage(loc = location) {
      return DOC_PATH.test(loc.pathname);
    },

    article() {
      return document.querySelector("article.document");
    },

    toolbar() {
      return document.querySelector(TOOLBAR);
    },

    // Where to put a toolbar button so it sits just left of "Bookmark".
    toolbarSlot() {
      const actions = document.querySelector(TOOLBAR_ACTIONS);
      if (!actions) return null;
      const bookmark = actions.querySelector(BOOKMARK);
      return { parent: actions, before: bookmark || actions.querySelector("a, button, .action-sheet") };
    },

    // The element that holds the doc body.
    docContent() {
      for (const selector of CONTENT_SELECTORS) {
        const el = [...document.querySelectorAll(selector)].find((e) => !e.closest(".thread"));
        if (el) return el;
      }
      return null;
    },

    docTitle() {
      for (const selector of TITLE_SELECTORS) {
        const text = this.headingText(document.querySelector(selector));
        if (text) return text;
      }
      return document.title.split(/\s+[|·–—]\s+/)[0].trim() || "Untitled";
    },

    // Heading text without Basecamp's "#" permalink.
    headingText(h) {
      if (!h) return "";
      const clone = h.cloneNode(true);
      clone.querySelectorAll(CHROME_SELECTORS).forEach((el) => el.remove());
      return clone.textContent.replace(/\s+/g, " ").trim();
    },

    // Headings inside the doc body, for the outline and j/k jumps.
    docHeadings() {
      const content = this.docContent();
      if (!content) return [];
      return [...content.querySelectorAll("h1, h2, h3, h4")].filter((h) => this.headingText(h));
    },

    // The folder (vault) the doc sits in, from the breadcrumb links.
    folderUrl() {
      const links = [...document.querySelectorAll(BREADCRUMB_FOLDERS)].filter((a) =>
        FOLDER_PATH.test(new URL(a.href, location.href).pathname),
      );
      const last = links[links.length - 1];
      return last ? new URL(last.href, location.href).href : null;
    },

    // Docs in a folder, in the order Basecamp lists them.
    async folderDocs(folderUrl) {
      const res = await fetch(folderUrl, { credentials: "same-origin", headers: { Accept: "text/html" } });
      if (!res.ok) throw new Error(`Folder request failed (${res.status})`);
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const seen = new Set();
      const docs = [];
      for (const a of doc.querySelectorAll("a[href*='/documents/']")) {
        const u = new URL(a.getAttribute("href"), folderUrl);
        if (!DOC_PATH.test(u.pathname) || seen.has(u.pathname)) continue;
        seen.add(u.pathname);
        docs.push({ url: u.origin + u.pathname, title: a.textContent.replace(/\s+/g, " ").trim() });
      }
      return docs;
    },
  };

  window.PenknifeBasecamp = Basecamp;
})();
